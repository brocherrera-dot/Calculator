// src/components/EpsPoolCalculator.tsx
import React, { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import VesselVisualization from "./VesselVisualization";

/* ----------------------------- helpers ----------------------------- */
const clampN = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/* ---------------------- Weight Calculation Constants ---------------------- */
const DENSITY_WATER = 62.4; // lb/ft³
const TILE_PSF = 2.0; // lb/ft² applied to all exposed interior surfaces
const SS12_PSF = 4.374; // 12ga 304L sheet (walls/benches/steps skins)
const SS10_PSF = 5.60; // 10ga 304L sheet (floor skin)
const EPS_DENSITY = 1.5; // lb/ft³ Type II
const AVG_BATHER_LB = 199; // lb/person

/* ------------------------------ types ------------------------------ */
type VesselType = "Cold Plunge" | "Hot Tub";
type ConstructionType = "EPS" | "Stainless Steel";
type ViewMode = "pricing" | "weights";

interface Vessel {
  id: string;
  type: VesselType;
  name: string;
  length_ft: number;
  width_ft: number;
  waterDepth_ft: number;
  wallHeight_ft: number; // rim to floor (for weight calcs)
  handrails: number;
  refrigerationLine: boolean;
  jets: number;
  equipmentPackageKey: string;
  collapsed?: boolean;
  // Simplified bench configuration
  hasBench: boolean;
  benchLength_ft: number;
  benchDepth_ft: number;
  benchHeight_ft: number;
  // Simplified steps configuration
  hasSteps: boolean;
  stepsWidth_ft: number;
  stepsCount: number;
  stepRiser_ft: number;
  stepTread_ft: number;
  // Weight calculation parameters
  bathers: number;
  eps_wall_thickness_ft: number;
  eps_floor_thickness_ft: number;
}

interface EquipmentLineItem { label: string; cost: number; }
interface EquipmentPackage {
  key: string;
  label: string;
  appliesTo: VesselType[];
  items: EquipmentLineItem[];
}

/* ---------------------- vessel migration helper ---------------------- */
const migrateVessel = (v: any): Vessel => {
  // If vessel has old structure with benches/steps arrays, migrate to new simplified structure
  if (v.benches || v.steps) {
    const firstBench = v.benches?.[0];
    const firstStep = v.steps?.[0];

    // Create new object without benches/steps properties
    const { benches, steps, ...rest } = v;

    return {
      ...rest,
      // Add new simplified bench properties
      hasBench: !!firstBench,
      benchLength_ft: firstBench?.length_ft ?? 3,
      benchDepth_ft: firstBench?.depth_ft ?? 1.5,
      benchHeight_ft: firstBench?.seat_height_ft ?? 1.5,
      // Add new simplified steps properties
      hasSteps: !!firstStep,
      stepsWidth_ft: firstStep?.width_ft ?? 2,
      stepsCount: firstStep?.n_risers ?? 3,
      stepRiser_ft: firstStep?.riser_ft ?? 0.58,
      stepTread_ft: firstStep?.tread_ft ?? 1,
    };
  }

  // If already new structure, ensure all required properties exist
  return {
    ...v,
    hasBench: v.hasBench ?? false,
    benchLength_ft: v.benchLength_ft ?? 3,
    benchDepth_ft: v.benchDepth_ft ?? 1.5,
    benchHeight_ft: v.benchHeight_ft ?? 1.5,
    hasSteps: v.hasSteps ?? false,
    stepsWidth_ft: v.stepsWidth_ft ?? 2,
    stepsCount: v.stepsCount ?? 3,
    stepRiser_ft: v.stepRiser_ft ?? 0.58,
    stepTread_ft: v.stepTread_ft ?? 1,
  };
};

/* -------- latest equipment pricing (locked per your request) ------- */
const DEFAULT_PACKAGES: EquipmentPackage[] = [
  { key: "cp-1-2", label: "CP 1–2 Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller 1.5-ton + controller", cost: 13000 },
    { label: "AOP / UV sanitization", cost: 1800 },
    { label: "Pump & cartridge filter (upsized)", cost: 3000 },
    { label: "Valves, unions, fittings", cost: 1100 },
    { label: "Sensors / control panel", cost: 1500 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "cp-3-4", label: "CP 3–4 Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller ~2.5-ton + controller", cost: 18000 },
    { label: "AOP / UV sanitization", cost: 1900 },
    { label: "Pump & cartridge filter (upsized)", cost: 3200 },
    { label: "Valves, unions, fittings", cost: 1200 },
    { label: "Sensors / control panel", cost: 1600 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "cp-5-6", label: "CP 5–6 Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller ~4-ton + controller", cost: 26000 },
    { label: "AOP / UV sanitization", cost: 2100 },
    { label: "Commercial high-rate sand filter + pump", cost: 5200 },
    { label: "Valves, unions, fittings", cost: 1300 },
    { label: "Sensors / control panel", cost: 1700 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "cp-7-8", label: "CP 7–8 Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller ~5-ton + controller", cost: 31000 },
    { label: "AOP / UV sanitization", cost: 2300 },
    { label: "Commercial high-rate sand filter + pump", cost: 6000 },
    { label: "Valves, unions, fittings", cost: 1400 },
    { label: "Sensors / control panel", cost: 1800 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "cp-9-10", label: "CP 9–10 Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller ~7.5-ton + controller", cost: 43000 },
    { label: "AOP / UV sanitization", cost: 2500 },
    { label: "Commercial high-rate sand filter + pump", cost: 7000 },
    { label: "Valves, unions, fittings", cost: 1600 },
    { label: "Sensors / control panel", cost: 2000 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "cp-11-12", label: "CP 11–12 Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller ~10-ton + controller", cost: 55000 },
    { label: "AOP / UV sanitization", cost: 2700 },
    { label: "Commercial high-rate sand filter + pump", cost: 8500 },
    { label: "Valves, unions, fittings", cost: 1800 },
    { label: "Sensors / control panel", cost: 2200 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "cp-13-15plus", label: "CP 13–15+ Person", appliesTo: ["Cold Plunge"], items: [
    { label: "Chiller ~12.5–15-ton + controller", cost: 68000 },
    { label: "AOP / UV sanitization", cost: 3000 },
    { label: "Commercial high-rate sand filter + pump", cost: 10000 },
    { label: "Valves, unions, fittings", cost: 2000 },
    { label: "Sensors / control panel", cost: 2400 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
  { key: "ht-standard", label: "Hot Tub Standard (6–8 jets)", appliesTo: ["Hot Tub"], items: [
    { label: "Gas heater (400k BTU) or equiv", cost: 4200 },
    { label: "Jet pump + air blower", cost: 2800 },
    { label: "Sanitization (AOP/UV)", cost: 2000 },
    { label: "Filter/pump", cost: 1600 },
    { label: "Valves, unions, fittings", cost: 1200 },
    { label: "Sensors / controls panel", cost: 1800 },
    { label: "Chemical dosing & monitoring controller", cost: 2200 },
  ]},
];

/* -------------------------- tiny UI pieces -------------------------- */
const Card: React.FC<{ title?: string; tight?: boolean }> = ({ title, tight, children }) => (
  <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl ${tight ? 'p-3' : 'p-4'}`}>
    {title ? <div className="font-semibold mb-2.5 dark:text-gray-100">{title}</div> : null}
    {children}
  </div>
);
const GridCols: React.FC<{ cols?: number }> = ({ cols = 2, children }) => (
  <div style={{
    display: "grid",
    gap: 16,
    gridTemplateColumns: `repeat(${cols}, minmax(320px, 1fr))`,
    alignItems: "start"
  }}>
    {children}
  </div>
);
const Row: React.FC<{ label: string }> = ({ label, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", alignItems: "center", gap: 10, marginBottom: 10 }}>
    <div className="text-xs text-gray-600 dark:text-gray-300">{label}</div>
    <div>{children}</div>
  </div>
);
const Num: React.FC<{ value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; title?: string }> = ({ value, onChange, step = 1, min, max, title }) => (
  <input
    type="number"
    step={step}
    min={min}
    max={max}
    value={Number.isFinite(value) ? value : 0}
    onChange={(e) => onChange(Number(e.target.value))}
    title={title}
    className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
  />
);

/* ------------------------------- main ------------------------------- */
export default function EpsPoolCalculator() {
  /* Construction Type */
  const [constructionType, setConstructionType] = useState<ConstructionType>("EPS");

  /* Scopes */
  const [scopeMaterials, setScopeMaterials] = useState(true);
  const [scopeLabor, setScopeLabor] = useState(true);
  const [scopeEquipment, setScopeEquipment] = useState(true);
  const [scopeFreight, setScopeFreight] = useState(true);
  const [scopeDesignEng, setScopeDesignEng] = useState(true);
  const [scopeDesignCont, setScopeDesignCont] = useState(true);
  const [scopeWarranty, setScopeWarranty] = useState(true);

  /* MATERIALS — per SF & per vessel bundles (EPS) */
  const [epsBundlePerSf, setEpsBundlePerSf] = useState(6);       // EPS foam + adhesives + mesh + Basecrete/membrane
  const [tileMaterialsPerSf, setTileMaterialsPerSf] = useState(20); // Tile + thinset + grout + sundries
  const [ffeMaterialsPerVessel, setFfeMaterialsPerVessel] = useState(2000); // handrails, markers, DOH safety kit

  /* STAINLESS STEEL MATERIALS — weight & length based */
  const [ss304LPricePerLb, setSs304LPricePerLb] = useState(1.28);  // 304L plate $/lb (Mexican sourced)
  const [ss316LPricePerFt, setSs316LPricePerFt] = useState(18);    // 316L tubing/pipe $/ft (for handrails)
  const [plateThickness, setPlateThickness] = useState(0.1875);    // 3/16" = 0.1875 inches
  const [bitumasticCoatingPerSf, setBitumasticCoatingPerSf] = useState(2.5); // Exterior coating
  const [sacrificialAnodePerVessel, setSacrificialAnodePerVessel] = useState(450); // Magnesium anodes per vessel

  /* LABOR — per SF & per vessel (EPS) */
  const [epsWpLaborPerSf, setEpsWpLaborPerSf] = useState(40);    // EPS assembly + waterproofing labor
  const [tileLaborPerSf, setTileLaborPerSf] = useState(40);      // tile setting labor
  const [ffeLaborPerVessel, setFfeLaborPerVessel] = useState(600);
  const [equipPlumbPerVessel, setEquipPlumbPerVessel] = useState(15000); // interconnect & equipment setting (CP baseline; HT 1.5×)
  const [handrailInstallPerEa, setHandrailInstallPerEa] = useState(0);
  const [refrigLinePerCP, setRefrigLinePerCP] = useState(1800);
  const [startupLump, setStartupLump] = useState(3500);
  const [repOnsiteFee, setRepOnsiteFee] = useState(4000);
  const [includeRigging, setIncludeRigging] = useState(true);
  const [riggingPerVessel, setRiggingPerVessel] = useState(2000);
  const [regionMult, setRegionMult] = useState(1.0);

  /* STAINLESS STEEL LABOR — Mexico fabrication rates (USD/hr) */
  const [tigWelderRatePerHr, setTigWelderRatePerHr] = useState(10);  // AWS D1.6 certified TIG welder (Mexico)
  const [welderLoadedMult, setWelderLoadedMult] = useState(1.65);   // Loaded rate multiplier (benefits, overhead)
  const [weldingTimePerLf, setWeldingTimePerLf] = useState(0.15);   // Hours per linear foot of weld (TIG)
  const [grindingTimePerLf, setGrindingTimePerLf] = useState(0.10); // Hours per linear foot for grinding/finishing
  const [polishingTimePerLf, setPolishingTimePerLf] = useState(0.08); // Hours per LF for 316L polishing to 600 grit
  const [passivationPerSf, setPassivationPerSf] = useState(1.2);    // Passivation/cleaning cost per SF
  const [leakTestPerVessel, setLeakTestPerVessel] = useState(800);  // Leak testing cost per vessel
  const [qualityCertPerVessel, setQualityCertPerVessel] = useState(1200); // AWS certification & QC documentation

  /* FREIGHT */
  const [miles, setMiles] = useState(1000);
  const [dollarsPerMile, setDollarsPerMile] = useState(4.25);
  const [handlingPerVessel, setHandlingPerVessel] = useState(1000);

  /* DESIGN & ENGINEERING + CONTINGENCY */
  const [designBase, setDesignBase] = useState(25000);
  const [designMult, setDesignMult] = useState(1.0);
  const [designContPct, setDesignContPct] = useState(7.5);

  /* WARRANTY + OH&P + WASTE */
  const [warrantyPctOfClient, setWarrantyPctOfClient] = useState(1.5);
  const [ohpPct, setOhpPct] = useState(100);
  const [wastePct, setWastePct] = useState(7.5);

  /* ADA TRANSFER WALL / STEEL FRAME */
  const [includeAdaFrame, setIncludeAdaFrame] = useState(false);
  const [steelTubingPricePerFt, setSteelTubingPricePerFt] = useState(4.5);  // 2" mild steel tubing $/ft
  const [steelFabricationPerFt, setSteelFabricationPerFt] = useState(8);     // Welding/fabrication $/ft

  /* Equipment packages (editable) */
  const [packages, setPackages] = useState<EquipmentPackage[]>(DEFAULT_PACKAGES);

  /* Project chemical storage */
  const [useProjectChemicalStorage, setUseProjectChemicalStorage] = useState(true);
  const [projectChemicalStorageCost, setProjectChemicalStorageCost] = useState(1200);

  /* Vessels */
  const mkId = () => Math.random().toString(36).slice(2, 9);
  const [vessels, setVessels] = useState<Vessel[]>([
    {
      id: mkId(),
      type: "Cold Plunge",
      name: "CP-1",
      length_ft: 10,
      width_ft: 3,
      waterDepth_ft: 3.5,
      wallHeight_ft: 3.5,
      handrails: 1,
      refrigerationLine: true,
      jets: 0,
      equipmentPackageKey: "cp-1-2",
      collapsed: false,
      hasBench: false,
      benchLength_ft: 3,
      benchDepth_ft: 1.5,
      benchHeight_ft: 1.5,
      hasSteps: false,
      stepsWidth_ft: 2,
      stepsCount: 3,
      stepRiser_ft: 0.58,
      stepTread_ft: 1,
      bathers: 2,
      eps_wall_thickness_ft: 1.0,
      eps_floor_thickness_ft: 0.667,
    },
    {
      id: mkId(),
      type: "Hot Tub",
      name: "HT-1",
      length_ft: 17.75,
      width_ft: 5.58,
      waterDepth_ft: 3.5,
      wallHeight_ft: 3.5,
      handrails: 2,
      refrigerationLine: false,
      jets: 8,
      equipmentPackageKey: "ht-standard",
      collapsed: true,
      hasBench: true,
      benchLength_ft: 17.75,
      benchDepth_ft: 2,
      benchHeight_ft: 1.5,
      hasSteps: false,
      stepsWidth_ft: 2,
      stepsCount: 3,
      stepRiser_ft: 0.58,
      stepTread_ft: 1,
      bathers: 8,
      eps_wall_thickness_ft: 1.0,
      eps_floor_thickness_ft: 0.667,
    },
  ]);

  /* View Mode */
  const [viewMode, setViewMode] = useState<ViewMode>("pricing");

  /* Breakdown Expansion States */
  const [vesselExpanded, setVesselExpanded] = useState(false);
  const [equipExpanded, setEquipExpanded] = useState(false);

  /* Project Name */
  const [projectName, setProjectName] = useState("Untitled Project");

  /* Client & Project Information */
  const [clientInfo, setClientInfo] = useState({
    clientName: '',
    contactEmail: '',
    contactPhone: '',
    projectAddress: '',
    proposalDate: new Date().toISOString().split('T')[0],
    proposalNumber: `PP-${Date.now().toString().slice(-6)}`,
  });

  /* Project Notes & Scope */
  const [projectNotes, setProjectNotes] = useState({
    scopeNotes: '',
    assumptions: '',
    inclusions: `Fabrication and delivery of modular EPS foam vessels
Mechanical installation and waterproofing by licensed third-party installer
Tile finishes and vessel detailing (Depth markers inside of the vessels) (Tile allowance $8/sf)
Complete equipment packages: chiller/heater, pumps, chemical controllers, Clear Comfort AOP system, valves, and chemical tanks
Hydraulic and permit-ready drawings prepared by an experienced design & engineering firm
Prana Plunge site visits during installation for supervision and commissioning
Project coordination, documentation, and field assistance
Freight, customs, or import duties
Handrails and ADA transfer grab bars`,
    exclusions: `Structural slabs, decks, and drains outside vessel perimeter
Refrigeration line setting for chiller units
Slab removal, coring, or core drilling for plumbing or drain penetrations
Exterior/deck finishes (wood, stone, tile, plaster, or architectural facades outside vessel scope)
Safety equipment and signage (barriers, depth markers, warning signage)
Electrical/HVAC tie-ins beyond provided equipment pads
Permit fees, local inspections, and all taxes (TBD)
Specialty finishes, tile material supply, or decorative upgrades unless noted
Engineering stamps or special inspections not defined in base scope`,
  });

  /* Photos */
  const [photos, setPhotos] = useState<Array<{
    id: string;
    dataUrl: string;
    caption: string;
  }>>([]);

  /* Quick Add Modal State */
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddType, setQuickAddType] = useState<VesselType>("Cold Plunge");
  const [quickAddBathers, setQuickAddBathers] = useState(2);
  const [quickAddLength, setQuickAddLength] = useState(6);
  const [quickAddWidth, setQuickAddWidth] = useState(4);
  const [quickAddDepth, setQuickAddDepth] = useState(3.5);
  const [quickAddName, setQuickAddName] = useState("");

  // Auto-size based on bather load (1 person = 10 sq ft water surface)
  const autoSizeDimensions = (bathers: number): { length: number; width: number } => {
    const targetArea = bathers * 10; // 10 sq ft per person

    // Common aspect ratios and configurations
    if (bathers <= 2) return { length: 6, width: 3.5 };   // 21 sq ft
    if (bathers <= 3) return { length: 7, width: 4.5 };   // 31.5 sq ft
    if (bathers <= 4) return { length: 8, width: 5 };     // 40 sq ft
    if (bathers <= 6) return { length: 10, width: 6 };    // 60 sq ft
    if (bathers <= 8) return { length: 12, width: 7 };    // 84 sq ft
    if (bathers <= 10) return { length: 14, width: 7.5 }; // 105 sq ft
    if (bathers <= 12) return { length: 15, width: 8 };   // 120 sq ft

    // For larger capacities, use a 2:1 aspect ratio
    const width = Math.sqrt(targetArea / 2);
    const length = width * 2;
    return { length: Math.round(length * 2) / 2, width: Math.round(width * 2) / 2 }; // Round to 0.5
  };

  // Update dimensions when bather count changes
  React.useEffect(() => {
    const dims = autoSizeDimensions(quickAddBathers);
    setQuickAddLength(dims.length);
    setQuickAddWidth(dims.width);
  }, [quickAddBathers]);

  const openQuickAdd = (t: VesselType) => {
    setQuickAddType(t);
    const nextNum = t === "Cold Plunge"
      ? vessels.filter(v => v.type === "Cold Plunge").length + 1
      : vessels.filter(v => v.type === "Hot Tub").length + 1;
    const prefix = t === "Cold Plunge" ? "CP" : "HT";
    setQuickAddName(`${prefix}-${nextNum}`);
    setQuickAddBathers(t === "Cold Plunge" ? 2 : 6);
    setQuickAddDepth(3.5);
    setShowQuickAdd(true);
  };

  const addVesselFromQuickAdd = () => {
    const fallBack = quickAddType === "Cold Plunge" ? "cp-1-2" : "ht-standard";
    const pkg = packages.find(p => p.appliesTo.includes(quickAddType))?.key ?? fallBack;

    setVessels(v => v.concat({
      id: mkId(),
      type: quickAddType,
      name: quickAddName,
      length_ft: quickAddLength,
      width_ft: quickAddWidth,
      waterDepth_ft: quickAddDepth,
      wallHeight_ft: quickAddDepth,
      handrails: 1,
      refrigerationLine: quickAddType === "Cold Plunge",
      jets: quickAddType === "Hot Tub" ? 6 : 0,
      equipmentPackageKey: pkg,
      collapsed: false,
      hasBench: quickAddType === "Hot Tub",
      benchLength_ft: quickAddLength,
      benchDepth_ft: 2,
      benchHeight_ft: 1.5,
      hasSteps: false,
      stepsWidth_ft: 2,
      stepsCount: 3,
      stepRiser_ft: 0.58,
      stepTread_ft: 1,
      bathers: quickAddBathers,
      eps_wall_thickness_ft: 1.0,
      eps_floor_thickness_ft: 0.667,
    }));
    setShowQuickAdd(false);
  };
  const removeVessel = (id: string) => setVessels(v => v.filter(x => x.id !== id));
  const updateVessel = (id: string, patch: Partial<Vessel>) =>
    setVessels(v => v.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const duplicateVessel = (id: string) => {
    const vessel = vessels.find(v => v.id === id);
    if (!vessel) return;
    const sameType = vessels.filter(v => v.type === vessel.type);
    const nextNum = sameType.length + 1;
    const prefix = vessel.type === "Cold Plunge" ? "CP" : "HT";
    setVessels(v => v.concat({
      ...vessel,
      id: mkId(),
      name: `${prefix}-${nextNum}`,
      collapsed: false,
    }));
  };

  /* ---------------------- PDF export helper ---------------------- */
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // ====== COVER PAGE ======
    doc.setFillColor(59, 130, 246); // Blue background
    doc.rect(0, 0, pageWidth, 80, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont("helvetica", "bold");
    doc.text("PRANA PLUNGE", pageWidth / 2, 40, { align: "center" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Commercial Pool & Spa Solutions", pageWidth / 2, 55, { align: "center" });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Proposal title
    yPos = 110;
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("PROJECT PROPOSAL", pageWidth / 2, yPos, { align: "center" });

    yPos += 20;
    doc.setFontSize(16);
    doc.setFont("helvetica", "normal");
    doc.text(projectName || "Untitled Project", pageWidth / 2, yPos, { align: "center" });

    // Client info on cover
    if (clientInfo.clientName) {
      yPos += 30;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("PREPARED FOR:", pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.setFont("helvetica", "normal");
      doc.text(clientInfo.clientName, pageWidth / 2, yPos, { align: "center" });
    }

    // Proposal details
    yPos = pageHeight - 60;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Proposal Number:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(clientInfo.proposalNumber, 80, yPos);

    yPos += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Date:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(new Date(clientInfo.proposalDate).toLocaleDateString(), 80, yPos);

    yPos += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Valid For:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text("30 Days", 80, yPos);

    // ====== CLIENT INFORMATION PAGE ======
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CLIENT INFORMATION", 14, yPos);
    yPos += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Client Name:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(clientInfo.clientName || "N/A", 70, yPos);

    yPos += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Contact Email:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(clientInfo.contactEmail || "N/A", 70, yPos);

    yPos += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Contact Phone:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(clientInfo.contactPhone || "N/A", 70, yPos);

    yPos += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Project Address:", 20, yPos);
    doc.setFont("helvetica", "normal");
    const addressLines = doc.splitTextToSize(clientInfo.projectAddress || "N/A", pageWidth - 80);
    doc.text(addressLines, 70, yPos);
    yPos += addressLines.length * 6;

    yPos += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Construction Type:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(constructionType, 70, yPos);

    // Project notes if provided
    if (projectNotes.scopeNotes) {
      yPos += 15;
      doc.setFont("helvetica", "bold");
      doc.text("Project Overview:", 20, yPos);
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const scopeLines = doc.splitTextToSize(projectNotes.scopeNotes, pageWidth - 40);
      doc.text(scopeLines, 20, yPos);
      yPos += scopeLines.length * 5;
    }

    // ====== SCOPE OF WORK PAGE ======
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SCOPE OF WORK", 14, yPos);
    yPos += 15;

    // INCLUSIONS
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("INCLUSIONS", 14, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    // Parse inclusions from state (one per line)
    const inclusions = projectNotes.inclusions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    inclusions.forEach(item => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(`• ${item}`, pageWidth - 30);
      doc.text(lines, 20, yPos);
      yPos += lines.length * 5;
    });

    yPos += 10;

    // EXCLUSIONS
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("EXCLUSIONS", 14, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    // Parse exclusions from state (one per line)
    const exclusions = projectNotes.exclusions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    exclusions.forEach(item => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(`• ${item}`, pageWidth - 30);
      doc.text(lines, 20, yPos);
      yPos += lines.length * 5;
    });

    // ====== PHOTOS PAGE (if any) ======
    if (photos.length > 0) {
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("PROJECT PHOTOS", 14, yPos);
      yPos += 15;

      let photoIndex = 0;
      const photosPerPage = 4;
      const photoWidth = 80;
      const photoHeight = 60;

      photos.forEach((photo, idx) => {
        if (photoIndex > 0 && photoIndex % photosPerPage === 0) {
          doc.addPage();
          yPos = 20;
        }

        try {
          doc.addImage(photo.dataUrl, 'JPEG', 20, yPos, photoWidth, photoHeight);
          doc.setFontSize(9);
          doc.setFont("helvetica", "italic");
          doc.text(photo.caption || `Photo ${idx + 1}`, 20, yPos + photoHeight + 5);
        } catch (e) {
          console.error('Error adding photo to PDF:', e);
        }

        yPos += photoHeight + 15;
        photoIndex++;
      });
    }

    // ====== PRICING SECTION ======
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("PROJECT INVESTMENT", 14, yPos);
    yPos += 15;

    // Vessels Summary Table
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Project Scope", 14, yPos);
    yPos += 5;

    const vesselsSummaryData = vesselCalcs.map(c => {
      return [
        c.vessel.name,
        c.vessel.type,
        `${c.vessel.length_ft.toFixed(1)}' × ${c.vessel.width_ft.toFixed(1)}' × ${c.vessel.waterDepth_ft.toFixed(1)}'`,
        fmt(c.areas.finishSf)
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Vessel", "Type", "Dimensions (L×W×D)", "Finish SF"]],
      body: vesselsSummaryData,
      theme: "striped",
      headStyles: {
        fillColor: [59, 130, 246]
      },
      columnStyles: {
        3: { halign: "right" }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Cost Breakdown by Category
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Investment Breakdown", 14, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const categoryBreakdown = [
      ["Vessels & Installation", `$${fmt(project.scopeBreakdown?.vesselAndInstall.cost || 0)}`],
      ["Equipment & Installation", `$${fmt(project.scopeBreakdown?.equipmentAndInstall.cost || 0)}`],
      ["Freight & Handling", `$${fmt(project.scopeBreakdown?.freightHandling.cost || 0)}`],
      ["Design & Engineering", `$${fmt(project.scopeBreakdown?.designEngineering.cost || 0)}`],
    ];

    autoTable(doc, {
      startY: yPos,
      body: categoryBreakdown,
      theme: "plain",
      columnStyles: {
        0: { cellWidth: 100, fontStyle: "bold" },
        1: { halign: "right", cellWidth: 60, fontStyle: "bold" }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Total Investment Box
    doc.setFillColor(59, 130, 246);
    doc.rect(14, yPos, pageWidth - 28, 20, "F");

    yPos += 6;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL INVESTMENT: $${fmt(project.clientPrice)}`, 20, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Finish Area: ${fmt(project.finishSfTotal)} sf  |  Cost per SF: $${fmt(project.effectivePerSf)}`, 20, yPos);

    // Reset text color
    doc.setTextColor(0, 0, 0);
    yPos += 20;

    // Equipment Packages Section (no pricing)
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Included Equipment Packages", 14, yPos);
    yPos += 8;

    vesselCalcs.forEach((calc) => {
      const pkg = packages.find(p => p.key === calc.vessel.equipmentPackageKey);
      if (!pkg) return;

      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${calc.vessel.name}: ${pkg.label}`, 14, yPos);
      yPos += 5;

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      pkg.items.forEach(item => {
        doc.text(`  • ${item.label}`, 14, yPos);
        yPos += 4;
      });
      yPos += 3;
    });

    yPos += 10;

    // Weight Calculations Table with PSF
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Structural Load Analysis", 14, yPos);
    yPos += 5;

    const weightData = vesselCalcs.map(c => {
      const w = c.weights;
      const totalLoad = constructionType === "EPS" ? w.eps_total_lb : w.stainless_total_lb;
      const psf = w.planArea_ft2 > 0 ? totalLoad / w.planArea_ft2 : 0;

      return [
        c.vessel.name,
        fmt(w.planArea_ft2),
        fmt(w.water_lb),
        fmt(w.tile_lb),
        constructionType === "EPS" ? fmt(w.eps_lb) : fmt(w.stainless_lb),
        fmt(w.bathers_lb),
        fmt(totalLoad),
        fmt(psf)
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Vessel", "Plan Area (ft²)", "Water (lb)", "Tile (lb)", constructionType === "EPS" ? "EPS (lb)" : "SS (lb)", "Bathers (lb)", "Total Load (lb)", "PSF"]],
      body: weightData,
      theme: "striped",
      headStyles: {
        fillColor: [59, 130, 246],
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 8
      },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right", fontStyle: "bold" },
        7: { halign: "right", fontStyle: "bold" }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // ====== TERMS & CONDITIONS PAGE ======
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("TERMS & CONDITIONS", 14, yPos);
    yPos += 15;

    // GENERAL CONDITIONS & SITE REQUIREMENTS
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("GENERAL CONDITIONS & SITE REQUIREMENTS", 14, yPos);
    yPos += 8;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    const generalConditions = [
      "1. Site Access: Client ensures clear access for deliveries (containers/trucks) and adequate space for staging materials.",
      "2. Utilities: Client to provide electricity and water required for construction activities.",
      "3. Permits: Client responsible for all local building permits; Prana Plunge will provide necessary documentation.",
      "4. Storage: Client ensures covered, secure storage for equipment and materials throughout construction.",
      "5. Coordination: Client coordinates with any third-party contractors (electrical, plumbing) to avoid conflicts or delays.",
      "6. Changes: Any client-requested changes beyond this scope will require written approval and may incur additional costs.",
      "7. Timeline: Construction schedule is subject to change based on material availability, weather, or unforeseen site conditions.",
    ];

    generalConditions.forEach(item => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(item, pageWidth - 28);
      doc.text(lines, 14, yPos);
      yPos += lines.length * 4 + 2;
    });

    yPos += 8;

    // THIRD-PARTY CONTRACTOR TERMS
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("THIRD-PARTY CONTRACTOR TERMS", 14, yPos);
    yPos += 8;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    const thirdPartyTerms = [
      "1. Installer: Client and Prana Plunge agree to hire a licensed third-party installer for mechanical and waterproofing work.",
      "2. Installer Responsibilities: Installer to provide mechanical installation, epoxy waterproofing, pressure testing, tile setting, and grouting.",
      "3. Licensing: Installer must be licensed per local jurisdiction and carry required insurance (general liability, workers' compensation).",
      "4. Contract: Client or Prana Plunge will execute a separate agreement with the installer; installer is not an employee or agent of Prana Plunge.",
      "5. Payment: Client responsible for timely payment to installer per agreed schedule; delays in payment may affect project timeline.",
      "6. Workmanship Warranty: Installer provides workmanship warranty for all mechanical and waterproofing installation per their agreement with Client.",
      "7. Quality: Prana Plunge will coordinate with installer to ensure work meets specifications, but installer solely responsible for workmanship and execution.",
      "8. Site Safety: Installer responsible for site safety, compliance with OSHA and local regulations, and cleanliness throughout installation.",
    ];

    thirdPartyTerms.forEach(item => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(item, pageWidth - 28);
      doc.text(lines, 14, yPos);
      yPos += lines.length * 4 + 2;
    });

    yPos += 8;

    // TERMS & CONDITIONS
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT, WARRANTY, AND LIABILITY", 14, yPos);
    yPos += 8;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    const paymentTerms = [
      "Payment Terms: Payments due per milestone schedule outlined below. Late payments subject to 1.5% monthly interest.",

      "Product Warranty: Prana Plunge warrants EPS vessels free from manufacturing defects for 10 years from delivery. Equipment warranted per manufacturer terms (typically 1-3 years). Client responsible for routine maintenance.",

      "Installation Warranty: Mechanical installation and waterproofing warranted by third-party installer per their agreement with Client (typically 1-2 years workmanship warranty).",

      "Limitation of Liability: Prana Plunge's total liability limited to project contract price. Prana Plunge not liable for consequential, indirect, or incidental damages including lost profits, business interruption, or property damage.",

      "Client Obligations: Client to ensure site readiness, proper permits, and coordination with utilities and third parties. Failure may result in delays or additional costs borne by Client.",

      "Force Majeure: Neither party liable for delays due to events beyond reasonable control (weather, material shortages, labor disputes, natural disasters, government actions).",

      "Dispute Resolution: Disputes to be resolved through mediation in good faith. If unresolved, binding arbitration per AAA Commercial Arbitration Rules. Prevailing party entitled to reasonable attorney fees.",

      "Governing Law: Agreement governed by laws of California without regard to conflict of law provisions.",
    ];

    paymentTerms.forEach(item => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(item, pageWidth - 28);
      doc.text(lines, 14, yPos);
      yPos += lines.length * 4 + 3;
    });

    // ====== PAYMENT SCHEDULE PAGE ======
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT SCHEDULE", 14, yPos);
    yPos += 15;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Payments are due according to the following milestone schedule:", 14, yPos);
    yPos += 10;

    const totalPrice = project.clientPrice;
    const deposit = totalPrice * 0.20;
    const drawings = totalPrice * 0.50;
    const shipping = totalPrice * 0.20;
    const startup = totalPrice * 0.10;

    const paymentScheduleData = [
      ["Milestone 1: Contract Signing", "20%", `$${fmt(deposit)}`, "Upon execution of contract"],
      ["Milestone 2: Design & Drawings Complete", "50%", `$${fmt(drawings)}`, "Upon approval of hydraulic drawings"],
      ["Milestone 3: Vessel Shipping", "20%", `$${fmt(shipping)}`, "When vessels ship from manufacturer"],
      ["Milestone 4: Startup & Commissioning", "10%", `$${fmt(startup)}`, "Upon successful startup and handoff"],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [["Milestone", "Percentage", "Amount", "Trigger"]],
      body: paymentScheduleData,
      theme: "striped",
      headStyles: {
        fillColor: [59, 130, 246],
        fontStyle: "bold"
      },
      columnStyles: {
        1: { halign: "center" },
        2: { halign: "right", fontStyle: "bold" }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL PROJECT INVESTMENT: $${fmt(totalPrice)}`, 14, yPos);
    yPos += 15;

    // Wiring Information
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("WIRE TRANSFER INFORMATION", 14, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("For wire transfers, please use the following banking details:", 14, yPos);
    yPos += 8;

    const wireInfo = [
      "Bank Name: [Your Bank Name]",
      "Account Name: Prana Plunge LLC",
      "Account Number: [Account Number]",
      "Routing Number: [Routing Number]",
      "Swift Code: [Swift Code] (for international transfers)",
      "",
      "Please include proposal number in wire reference: " + clientInfo.proposalNumber,
    ];

    wireInfo.forEach(line => {
      doc.text(line, 20, yPos);
      yPos += 5;
    });

    yPos += 10;

    // Signature Section
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PROPOSAL ACCEPTANCE", 14, yPos);
    yPos += 15;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("By signing below, Client accepts the terms and conditions outlined in this proposal.", 14, yPos);
    yPos += 15;

    doc.line(14, yPos, 90, yPos);
    yPos += 5;
    doc.setFontSize(8);
    doc.text("Client Signature", 14, yPos);
    yPos += 10;

    doc.line(14, yPos, 90, yPos);
    yPos += 5;
    doc.text("Printed Name", 14, yPos);
    yPos += 10;

    doc.line(14, yPos, 90, yPos);
    yPos += 5;
    doc.text("Date", 14, yPos);

    yPos = yPos - 30;
    doc.line(110, yPos + 15, 186, yPos + 15);
    yPos += 20;
    doc.text("Prana Plunge Representative", 110, yPos);
    yPos += 10;

    doc.line(110, yPos, 186, yPos);
    yPos += 5;
    doc.text("Printed Name", 110, yPos);
    yPos += 10;

    doc.line(110, yPos, 186, yPos);
    yPos += 5;
    doc.text("Date", 110, yPos);

    // Save the PDF
    const filename = `${projectName.replace(/\s+/g, '_')}_Pool_Estimate_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  };

  /* ---------------------- weight calculation helpers ---------------------- */
  const calcVesselWeights = (v: Vessel) => {
    const L = clampN(v.length_ft);
    const W = clampN(v.width_ft);
    const wallH = clampN(v.wallHeight_ft);
    const waterD = clampN(v.waterDepth_ft);
    const epsWallT = clampN(v.eps_wall_thickness_ft);
    const epsFloorT = clampN(v.eps_floor_thickness_ft);

    const A = L * W; // plan area
    const P = 2 * (L + W); // perimeter

    // Simplified bench calculation
    let benchFootprint = 0, benchExposedArea = 0, benchVolume = 0;
    if (v.hasBench) {
      const bL = clampN(v.benchLength_ft);
      const bD = clampN(v.benchDepth_ft);
      const bH = clampN(v.benchHeight_ft);
      benchFootprint = bL * bD;
      benchVolume = benchFootprint * bH;
      // Exposed surfaces: top + front + two sides
      benchExposedArea = benchFootprint + (bL * bH) + 2 * (bD * bH);
    }

    // Simplified steps calculation
    let stepFootprint = 0, stepExposedArea = 0, stepVolume = 0;
    if (v.hasSteps) {
      const sW = clampN(v.stepsWidth_ft);
      const sN = Math.max(1, Math.round(clampN(v.stepsCount)));
      const sH = clampN(v.stepRiser_ft);
      const sD = clampN(v.stepTread_ft);
      stepFootprint = sW * (sN * sD);
      stepVolume = sW * sD * sH * (sN * (sN + 1) / 2);
      // Exposed surfaces: treads + risers + two side faces
      const treads = sW * sD * sN;
      const risers = sW * sH * sN;
      const sideFaces = 2 * ((sN * sH / 2) * (sN * sD)); // triangular side profile approximation
      stepExposedArea = treads + risers + sideFaces;
    }

    // Floor and wall removal for benches/steps (assume they touch walls/floor)
    const floorRemoval = benchFootprint + stepFootprint;
    const wallRemoval = 0; // simplified: benches/steps don't cover wall area in this model

    // Exposed areas
    const floorExposed = Math.max(0, A - floorRemoval);
    const wallGross = P * wallH;
    const wallsExposed = Math.max(0, wallGross - wallRemoval);
    const interiorArea = floorExposed + wallsExposed + benchExposedArea + stepExposedArea;

    // Water
    const fullWaterVol = A * waterD;
    const displacedVol = benchVolume + stepVolume;
    const netWaterVol = Math.max(0, fullWaterVol - displacedVol);
    const water_lb = netWaterVol * DENSITY_WATER;

    // Tile
    const tile_lb = interiorArea * TILE_PSF;

    // Stainless skins
    const floor10_lb = floorExposed * SS10_PSF;
    const wallsAndFeatureArea = wallsExposed + benchExposedArea + stepExposedArea;
    const walls12_lb = wallsAndFeatureArea * SS12_PSF;
    const stainless_lb = floor10_lb + walls12_lb;

    // EPS body
    const epsWallsVol = (P * epsWallT + 4 * epsWallT ** 2) * wallH;
    const epsFloorVol = A * epsFloorT;
    const epsVol = epsWallsVol + epsFloorVol + benchVolume + stepVolume;
    const eps_lb = epsVol * EPS_DENSITY;

    // Bathers
    const bathers_lb = clampN(v.bathers) * AVG_BATHER_LB;

    // Totals
    const stainless_total_lb = water_lb + tile_lb + stainless_lb + bathers_lb;
    const eps_total_lb = water_lb + tile_lb + eps_lb + bathers_lb;
    const stainless_psf = stainless_total_lb / A;
    const eps_psf = eps_total_lb / A;

    return {
      planArea_ft2: A,
      perimeter_ft: P,
      interiorArea_ft2: interiorArea,
      floorExposed_ft2: floorExposed,
      wallsExposed_ft2: wallsExposed,
      water_lb,
      water_psf: water_lb / A,
      tile_lb,
      tile_psf: tile_lb / A,
      stainless_lb,
      stainless_total_lb,
      stainless_psf,
      eps_lb,
      eps_total_lb,
      eps_psf,
      bathers_lb,
      netWaterVol_ft3: netWaterVol,
      displacedVol_ft3: displacedVol,
    };
  };

  /* ---------------------- per-vessel calculations ---------------------- */
  const vesselCalcs = useMemo(() => {
    return vessels.map(v => {
      const L = clampN(v.length_ft), W = clampN(v.width_ft), D = clampN(v.waterDepth_ft);
      const floorSf = L * W;
      const wallSf  = 2 * (L + W) * D;

      // Calculate bench/step surface area from simplified configuration
      let benchSf = 0;
      if (v.hasBench) {
        const bL = clampN(v.benchLength_ft);
        const bD = clampN(v.benchDepth_ft);
        const bH = clampN(v.benchHeight_ft);
        const benchFootprint = bL * bD;
        // Exposed surfaces: top + front + two sides
        benchSf += benchFootprint + (bL * bH) + 2 * (bD * bH);
      }
      if (v.hasSteps) {
        const sW = clampN(v.stepsWidth_ft);
        const sN = Math.max(1, Math.round(clampN(v.stepsCount)));
        const sH = clampN(v.stepRiser_ft);
        const sD = clampN(v.stepTread_ft);
        // Exposed surfaces: treads + risers + two side faces
        const treads = sW * sD * sN;
        const risers = sW * sH * sN;
        const sideFaces = 2 * ((sN * sH / 2) * (sN * sD));
        benchSf += treads + risers + sideFaces;
      }

      const finishSf = floorSf + wallSf + benchSf;

      let materialsEpsBundle = 0, materialsTile = 0, materialsFfe = 0;
      let materialsStainless = 0, coatingCost = 0, anodeCost = 0;

      if (constructionType === "EPS") {
        // EPS MATERIALS:
        materialsEpsBundle = scopeMaterials ? clampN(epsBundlePerSf) * finishSf : 0;
        materialsTile      = scopeMaterials ? clampN(tileMaterialsPerSf) * (floorSf + wallSf) : 0;
        materialsFfe       = scopeMaterials ? clampN(ffeMaterialsPerVessel) : 0;
      } else {
        // STAINLESS STEEL MATERIALS:
        if (scopeMaterials) {
          // Calculate weight: 304L @ 3/16" thick = 7.65 lb/sf (stainless steel density)
          const weightPerSf = clampN(plateThickness) * 12 * 40.8; // lb/sf for 304L (40.8 lb/ft³)
          const totalWeight = finishSf * weightPerSf;
          materialsStainless = totalWeight * clampN(ss304LPricePerLb);

          // Bitumastic exterior coating
          coatingCost = finishSf * clampN(bitumasticCoatingPerSf);

          // Sacrificial anodes
          anodeCost = clampN(sacrificialAnodePerVessel);

          // Tile finish (same as EPS)
          materialsTile = clampN(tileMaterialsPerSf) * (floorSf + wallSf);

          // 316L handrails (estimate 8ft per handrail, polished to 600 grit)
          const handrailCost = clampN(v.handrails) * 8 * clampN(ss316LPricePerFt);
          materialsFfe = handrailCost;
        }
      }

      // EQUIPMENT:
      const pkg = packages.find(p => p.key === v.equipmentPackageKey && p.appliesTo.includes(v.type));
      const equipmentSubtotal = scopeEquipment && pkg ? pkg.items.reduce((s, it) => s + clampN(it.cost), 0) : 0;

      // ADA TRANSFER WALL / STEEL FRAME (stainless steel only):
      let adaFrameCost = 0;
      if (constructionType === "Stainless Steel" && includeAdaFrame && scopeMaterials) {
        // Calculate perimeter (floor level)
        const perimeterFt = 2 * (L + W);

        // Calculate vertical studs at 16" on center around perimeter
        const studSpacing = 16 / 12; // 16" in feet
        const numStuds = Math.ceil(perimeterFt / studSpacing);
        const studHeight = D; // From floor to top of vessel (water depth)
        const totalStudLf = numStuds * studHeight;

        // Top and bottom rails around entire perimeter
        const railsLf = perimeterFt * 2; // Top + bottom rails

        // Total linear feet of 2" steel tubing
        const totalSteelLf = totalStudLf + railsLf;

        // Material + fabrication costs
        const steelMaterialCost = totalSteelLf * clampN(steelTubingPricePerFt);
        const steelFabCost = totalSteelLf * clampN(steelFabricationPerFt);

        adaFrameCost = steelMaterialCost + steelFabCost;
      }

      // LABOR:
      let vesselInstallLabor = 0, equipmentInterconnectLabor = 0, fabricationLabor = 0, qualityControlCost = 0;
      if (scopeLabor) {
        if (constructionType === "EPS") {
          // EPS LABOR (vessel install):
          let vesselLabor = 0;
          vesselLabor += clampN(epsWpLaborPerSf) * finishSf;                 // EPS + waterproofing labor
          vesselLabor += clampN(tileLaborPerSf) * (floorSf + wallSf);        // Tile setting labor
          vesselLabor += clampN(ffeLaborPerVessel);                          // FF&E install
          vesselLabor += clampN(handrailInstallPerEa) * clampN(v.handrails); // optional extra
          if (v.type === "Cold Plunge" && v.refrigerationLine) vesselLabor += clampN(refrigLinePerCP);
          if (v.type === "Hot Tub" && v.jets > 6) vesselLabor += (v.jets - 6) * 100; // simple jet adder
          vesselInstallLabor = vesselLabor * clampN(regionMult);             // regional multiplier on labor

          // Equipment interconnect labor (separate):
          const interconnect = (v.type === "Hot Tub")
            ? clampN(equipPlumbPerVessel) * 1.5                         // +50% for hot tubs
            : clampN(equipPlumbPerVessel);
          equipmentInterconnectLabor = interconnect * clampN(regionMult);
        } else {
          // STAINLESS STEEL FABRICATION LABOR (Mexico):
          const loadedWelderRate = clampN(tigWelderRatePerHr) * clampN(welderLoadedMult);

          // Calculate weld linear footage (perimeter welds + seams)
          const perimeterLf = 2 * (L + W);  // floor-to-wall weld
          const wallCornerLf = 4 * D;        // 4 corner welds
          const floorSeamsLf = Math.ceil(L / 4) * W; // Plate seams (assume 4ft wide plates)
          const wallSeamsLf = Math.ceil((2*L + 2*W) / 4) * D; // Wall plate seams
          const totalWeldLf = perimeterLf + wallCornerLf + floorSeamsLf + wallSeamsLf;

          // Welding labor (TIG)
          const weldingHours = totalWeldLf * clampN(weldingTimePerLf);
          const weldingCost = weldingHours * loadedWelderRate;

          // Grinding/finishing labor
          const grindingHours = totalWeldLf * clampN(grindingTimePerLf);
          const grindingCost = grindingHours * loadedWelderRate * 0.85; // Slightly lower rate for grinding

          // 316L handrail polishing (600 grit)
          const handrailLf = clampN(v.handrails) * 8;
          const polishingHours = handrailLf * clampN(polishingTimePerLf);
          const polishingCost = polishingHours * loadedWelderRate;

          // Passivation & cleaning
          const passivationCost = finishSf * clampN(passivationPerSf);

          fabricationLabor = weldingCost + grindingCost + polishingCost + passivationCost;

          // Tile installation labor (same as EPS)
          const tileLaborCost = clampN(tileLaborPerSf) * (floorSf + wallSf);

          vesselInstallLabor = fabricationLabor + tileLaborCost;

          // Equipment interconnect (separate, same as EPS):
          const interconnect = (v.type === "Hot Tub")
            ? clampN(equipPlumbPerVessel) * 1.5
            : clampN(equipPlumbPerVessel);
          equipmentInterconnectLabor = interconnect;

          // Quality control & testing
          qualityControlCost = clampN(leakTestPerVessel) + clampN(qualityCertPerVessel);
        }
      }

      const labor = vesselInstallLabor + equipmentInterconnectLabor;

      const materialsSubtotal = constructionType === "EPS"
        ? materialsEpsBundle + materialsTile + materialsFfe + adaFrameCost
        : materialsStainless + coatingCost + anodeCost + materialsTile + materialsFfe + adaFrameCost;
      const perVesselDirect   = materialsSubtotal + equipmentSubtotal + labor + qualityControlCost;

      // Weight calculations
      const weights = calcVesselWeights(v);

      return {
        vessel: v,
        areas: { floorSf, wallSf, benchSf, finishSf },
        materials: constructionType === "EPS"
          ? { materialsEpsBundle, materialsTile, materialsFfe, adaFrameCost }
          : { materialsStainless, coatingCost, anodeCost, materialsTile, materialsFfe, adaFrameCost },
        equipmentSubtotal,
        laborSubtotal: labor,
        vesselInstallLabor, // Separated vessel install labor
        equipmentInterconnectLabor, // Separated equipment interconnect labor
        fabricationLabor, // SS-specific
        qualityControlCost, // SS-specific
        adaFrameCost, // ADA frame if enabled
        perVesselDirect,
        weights, // Weight calculations
      };
    });
  }, [
    vessels,
    constructionType,
    scopeMaterials, scopeLabor, scopeEquipment,
    // EPS params
    epsBundlePerSf, tileMaterialsPerSf, ffeMaterialsPerVessel,
    epsWpLaborPerSf, tileLaborPerSf, ffeLaborPerVessel, equipPlumbPerVessel, handrailInstallPerEa, refrigLinePerCP, regionMult,
    // SS params
    ss304LPricePerLb, ss316LPricePerFt, plateThickness, bitumasticCoatingPerSf, sacrificialAnodePerVessel,
    tigWelderRatePerHr, welderLoadedMult, weldingTimePerLf, grindingTimePerLf, polishingTimePerLf, passivationPerSf,
    leakTestPerVessel, qualityCertPerVessel,
    // ADA frame params
    includeAdaFrame, steelTubingPricePerFt, steelFabricationPerFt,
    packages
  ]);

  /* ------------------------ project roll-up math ----------------------- */
  const project = useMemo(() => {
    // Direct vessel sums
    const finishSfTotal = vesselCalcs.reduce((s, c) => s + c.areas.finishSf, 0);
    const materialsTotal = vesselCalcs.reduce((s, c) => {
      const mats = c.materials as any;
      if (constructionType === "EPS") {
        return s + (mats.materialsEpsBundle + mats.materialsTile + mats.materialsFfe + (mats.adaFrameCost || 0));
      } else {
        return s + (mats.materialsStainless + mats.coatingCost + mats.anodeCost + mats.materialsTile + mats.materialsFfe + (mats.adaFrameCost || 0));
      }
    }, 0);
    const equipmentSubtotalVessels = vesselCalcs.reduce((s, c) => s + c.equipmentSubtotal, 0);
    const laborSubtotal = vesselCalcs.reduce((s, c) => s + c.laborSubtotal, 0);
    const qualityControlTotal = vesselCalcs.reduce((s, c) => s + (c.qualityControlCost || 0), 0);
    const sumPreAllocBase = vesselCalcs.reduce((s, c) => s + c.perVesselDirect, 0) || 1;

    // Project-level softs
    const freightTotal = scopeFreight
      ? (clampN(miles) * clampN(dollarsPerMile) + vessels.length * clampN(handlingPerVessel)) * clampN(regionMult)
      : 0;
    const designEngineering = scopeDesignEng ? clampN(designBase) * clampN(designMult) : 0;
    const repFee = scopeLabor ? clampN(repOnsiteFee) : 0;
    const startup = scopeLabor ? clampN(startupLump) : 0;
    const chemStorage = scopeEquipment && useProjectChemicalStorage ? clampN(projectChemicalStorageCost) : 0;
    const rigging = (scopeLabor && includeRigging) ? clampN(riggingPerVessel) * vessels.length : 0;

    // Separate construction costs from pass-through costs
    // Construction costs (subject to contingency, waste, OH&P): materials, labor, equipment, startup, chem storage
    // Pass-through costs (NOT subject to OH&P): freight, rigging, design/eng, rep fee

    const constructionCostsPerVessel = vesselCalcs.map(c => c.perVesselDirect); // materials + equipment + labor per vessel
    const totalConstructionBase = constructionCostsPerVessel.reduce((s, n) => s + n, 0);

    // Allocate startup and chem storage to construction (subject to OH&P)
    const allocShares = vesselCalcs.map(c => c.perVesselDirect / sumPreAllocBase);
    const perVesselConstruction = constructionCostsPerVessel.map((base, i) =>
      base + allocShares[i] * (startup + chemStorage)
    );

    // Allocate pass-through costs (NOT subject to OH&P)
    const perVesselPassThrough = allocShares.map(share =>
      share * (freightTotal + rigging + designEngineering + repFee)
    );

    // Design Development Contingency (only on construction costs)
    const constructionBeforeCont = perVesselConstruction.reduce((s, n) => s + n, 0);
    const contRate = scopeDesignCont ? clampN(designContPct) / 100 : 0;
    const designContAmount = constructionBeforeCont * contRate;
    const perVesselCont = perVesselConstruction.map(b => (b / (constructionBeforeCont || 1)) * designContAmount);

    // Waste & OH&P (only on construction costs)
    const wasteRate = clampN(wastePct) / 100;
    const ohpRate   = clampN(ohpPct) / 100;
    const perVesselConstructionPlusCont = perVesselConstruction.map((b, i) => b + perVesselCont[i]);
    const perVesselWaste = perVesselConstructionPlusCont.map(b => b * wasteRate);
    const perVesselOhp   = perVesselConstructionPlusCont.map(b => b * ohpRate);

    // Combine construction (with markups) + pass-through costs
    const perVesselPreWarranty = perVesselConstructionPlusCont.map((construction, i) =>
      construction + perVesselWaste[i] + perVesselOhp[i] + perVesselPassThrough[i]
    );

    // Pre-warranty & client total (warranty as % of client)
    const wRate = scopeWarranty ? clampN(warrantyPctOfClient) / 100 : 0;
    const perVesselClient = perVesselPreWarranty.map(n => (wRate < 1 ? n / (1 - wRate) : Infinity));
    const perVesselWarranty = perVesselClient.map(n => (scopeWarranty ? n * wRate : 0));

    // Rollups
    const constructionPlusContProject = perVesselConstructionPlusCont.reduce((s, n) => s + n, 0);
    const passThroughTotal = perVesselPassThrough.reduce((s, n) => s + n, 0);
    const wasteAmount = perVesselWaste.reduce((s, n) => s + n, 0);
    const ohpAmount   = perVesselOhp.reduce((s, n) => s + n, 0);
    const clientPrice = perVesselClient.reduce((s, n) => s + n, 0);
    const warrantyReserve = perVesselWarranty.reduce((s, n) => s + n, 0);
    const profit = ohpAmount;
    const grossMarginPct = clientPrice > 0 ? (profit / clientPrice) * 100 : 0;
    const effectivePerSf = finishSfTotal > 0 ? clientPrice / finishSfTotal : 0;

    const perVesselRows = vesselCalcs.map((c, i) => ({
      id: c.vessel.id,
      name: c.vessel.name,
      type: c.vessel.type,
      finishSf: c.areas.finishSf,
      construction: perVesselConstruction[i],
      passThrough: perVesselPassThrough[i],
      preContBase: perVesselConstruction[i] + perVesselPassThrough[i],
      designCont: perVesselCont[i],
      waste: perVesselWaste[i],
      ohp: perVesselOhp[i],
      warranty: perVesselWarranty[i],
      clientTotal: perVesselClient[i],
    }));

    // Consolidated scope breakdown (4 categories with subcategories)
    const vesselInstallLaborTotal = vesselCalcs.reduce((s, c) => s + (c.vesselInstallLabor || 0), 0);
    const equipmentInterconnectLaborTotal = vesselCalcs.reduce((s, c) => s + (c.equipmentInterconnectLabor || 0), 0);

    // Base costs (before markups) - separated into subcategories
    const vesselMaterialsBaseCost = materialsTotal + qualityControlTotal; // Vessel materials + QC
    const vesselInstallBaseCost = vesselInstallLaborTotal; // Vessel install labor

    const equipmentBaseCost = equipmentSubtotalVessels + chemStorage; // Equipment + chem storage
    const equipmentInstallBaseCost = equipmentInterconnectLaborTotal + startup; // Equipment interconnect + startup

    const freightHandlingBaseCost = freightTotal + rigging; // Freight + handling + rigging (pass-through, NO OH&P)
    const designEngineeringBaseCost = designEngineering + repFee; // Design/eng + rep onsite (pass-through, NO OH&P)

    const vesselAndInstallBaseCost = vesselMaterialsBaseCost + vesselInstallBaseCost;
    const equipmentAndInstallBaseCost = equipmentBaseCost + equipmentInstallBaseCost;
    const constructionBaseCost = vesselAndInstallBaseCost + equipmentAndInstallBaseCost;
    const passThroughBaseCost = freightHandlingBaseCost + designEngineeringBaseCost;

    // Apply markups ONLY to construction costs (vessel + equipment), proportionally
    const vesselConstructionShare = vesselAndInstallBaseCost / (constructionBaseCost || 1);
    const equipmentConstructionShare = equipmentAndInstallBaseCost / (constructionBaseCost || 1);

    const vesselAndInstallMarkups = (designContAmount + wasteAmount + ohpAmount) * vesselConstructionShare;
    const equipmentAndInstallMarkups = (designContAmount + wasteAmount + ohpAmount) * equipmentConstructionShare;

    // Split markups proportionally between materials and install for each category
    const vesselMaterialsShare = vesselMaterialsBaseCost / (vesselAndInstallBaseCost || 1);
    const vesselInstallShare = vesselInstallBaseCost / (vesselAndInstallBaseCost || 1);
    const vesselMaterialsMarkups = vesselAndInstallMarkups * vesselMaterialsShare;
    const vesselInstallMarkups = vesselAndInstallMarkups * vesselInstallShare;

    const equipmentMaterialsShare = equipmentBaseCost / (equipmentAndInstallBaseCost || 1);
    const equipmentInstallShare = equipmentInstallBaseCost / (equipmentAndInstallBaseCost || 1);
    const equipmentMaterialsMarkups = equipmentAndInstallMarkups * equipmentMaterialsShare;
    const equipmentInstallMarkups = equipmentAndInstallMarkups * equipmentInstallShare;

    const vesselMaterialsCost = vesselMaterialsBaseCost + vesselMaterialsMarkups;
    const vesselInstallCost = vesselInstallBaseCost + vesselInstallMarkups;
    const equipmentMaterialsCost = equipmentBaseCost + equipmentMaterialsMarkups;
    const equipmentInstallCost = equipmentInstallBaseCost + equipmentInstallMarkups;

    const vesselAndInstallCost = vesselMaterialsCost + vesselInstallCost;
    const equipmentAndInstallCost = equipmentMaterialsCost + equipmentInstallCost;
    const freightHandlingCost = freightHandlingBaseCost; // No markups
    const designEngineeringCost = designEngineeringBaseCost; // No markups

    // Warranty applies to entire project (including pass-through costs)
    const totalBeforeWarranty = vesselAndInstallCost + equipmentAndInstallCost + freightHandlingCost + designEngineeringCost;
    const warrantyShare = warrantyReserve / (totalBeforeWarranty || 1);

    const vesselMaterialsWarranty = vesselMaterialsCost * warrantyShare;
    const vesselInstallWarranty = vesselInstallCost * warrantyShare;
    const equipmentMaterialsWarranty = equipmentMaterialsCost * warrantyShare;
    const equipmentInstallWarranty = equipmentInstallCost * warrantyShare;
    const vesselAndInstallWarranty = vesselMaterialsWarranty + vesselInstallWarranty;
    const equipmentAndInstallWarranty = equipmentMaterialsWarranty + equipmentInstallWarranty;
    const freightHandlingWarranty = freightHandlingCost * warrantyShare;
    const designEngineeringWarranty = designEngineeringCost * warrantyShare;

    const scopeBreakdown = clientPrice > 0 ? {
      // Consolidated categories (including warranty allocations) with subcategories
      vesselAndInstall: {
        cost: vesselAndInstallCost + vesselAndInstallWarranty,
        pct: ((vesselAndInstallCost + vesselAndInstallWarranty) / clientPrice) * 100,
        subcategories: {
          materials: {
            cost: vesselMaterialsCost + vesselMaterialsWarranty,
            pct: ((vesselMaterialsCost + vesselMaterialsWarranty) / clientPrice) * 100,
          },
          install: {
            cost: vesselInstallCost + vesselInstallWarranty,
            pct: ((vesselInstallCost + vesselInstallWarranty) / clientPrice) * 100,
          },
        },
      },
      equipmentAndInstall: {
        cost: equipmentAndInstallCost + equipmentAndInstallWarranty,
        pct: ((equipmentAndInstallCost + equipmentAndInstallWarranty) / clientPrice) * 100,
        subcategories: {
          equipment: {
            cost: equipmentMaterialsCost + equipmentMaterialsWarranty,
            pct: ((equipmentMaterialsCost + equipmentMaterialsWarranty) / clientPrice) * 100,
          },
          install: {
            cost: equipmentInstallCost + equipmentInstallWarranty,
            pct: ((equipmentInstallCost + equipmentInstallWarranty) / clientPrice) * 100,
          },
        },
      },
      freightHandling: {
        cost: freightHandlingCost + freightHandlingWarranty,
        pct: ((freightHandlingCost + freightHandlingWarranty) / clientPrice) * 100,
      },
      designEngineering: {
        cost: designEngineeringCost + designEngineeringWarranty,
        pct: ((designEngineeringCost + designEngineeringWarranty) / clientPrice) * 100,
      },
    } : null;

    // Per-vessel breakdown (allocate consolidated costs proportionally)
    const perVesselBreakdown = vesselCalcs.map((c, i) => {
      const vesselShare = perVesselClient[i] / (clientPrice || 1);
      return {
        id: c.vessel.id,
        name: c.vessel.name,
        vesselAndInstall: (vesselAndInstallCost + vesselAndInstallWarranty) * vesselShare,
        equipmentAndInstall: (equipmentAndInstallCost + equipmentAndInstallWarranty) * vesselShare,
        freightHandling: (freightHandlingCost + freightHandlingWarranty) * vesselShare,
        designEngineering: (designEngineeringCost + designEngineeringWarranty) * vesselShare,
        total: perVesselClient[i],
      };
    });

    return {
      // areas
      finishSfTotal,
      // direct subtotals
      materialsTotal,
      equipmentSubtotalVessels,
      laborSubtotal,
      // project softs
      freightTotal, designEngineering, repFee, startup, chemStorage, rigging,
      // contingency
      designContAmount,
      // rollups
      constructionBase: constructionPlusContProject,
      passThroughTotal,
      wasteAmount, ohpAmount, warrantyReserve,
      clientPrice, profit, grossMarginPct, effectivePerSf,
      // per-vessel
      perVesselRows,
      // scope breakdown
      scopeBreakdown,
      perVesselBreakdown,
    };
  }, [
    vesselCalcs, vessels.length, constructionType,
    scopeFreight, miles, dollarsPerMile, handlingPerVessel, regionMult,
    scopeDesignEng, designBase, designMult,
    scopeEquipment, useProjectChemicalStorage, projectChemicalStorageCost,
    scopeLabor, repOnsiteFee, startupLump, includeRigging, riggingPerVessel,
    scopeDesignCont, designContPct,
    scopeWarranty, warrantyPctOfClient,
    wastePct, ohpPct,
  ]);

  /* ------------------------------- UI -------------------------------- */
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Client & Project Information */}
      <Card title="Client & Project Information">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div>
            <Row label="Client Name">
              <input
                value={clientInfo.clientName}
                onChange={e => setClientInfo({...clientInfo, clientName: e.target.value})}
                className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                placeholder="Client company name"
              />
            </Row>
            <Row label="Contact Email">
              <input
                type="email"
                value={clientInfo.contactEmail}
                onChange={e => setClientInfo({...clientInfo, contactEmail: e.target.value})}
                className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                placeholder="email@example.com"
              />
            </Row>
            <Row label="Contact Phone">
              <input
                type="tel"
                value={clientInfo.contactPhone}
                onChange={e => setClientInfo({...clientInfo, contactPhone: e.target.value})}
                className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                placeholder="(555) 123-4567"
              />
            </Row>
          </div>
          <div>
            <Row label="Project Address">
              <input
                value={clientInfo.projectAddress}
                onChange={e => setClientInfo({...clientInfo, projectAddress: e.target.value})}
                className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                placeholder="123 Main St, City, State ZIP"
              />
            </Row>
            <Row label="Proposal Date">
              <input
                type="date"
                value={clientInfo.proposalDate}
                onChange={e => setClientInfo({...clientInfo, proposalDate: e.target.value})}
                className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
              />
            </Row>
            <Row label="Proposal #">
              <input
                value={clientInfo.proposalNumber}
                onChange={e => setClientInfo({...clientInfo, proposalNumber: e.target.value})}
                className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                placeholder="PP-123456"
              />
            </Row>
          </div>
        </div>
      </Card>

      {/* Project Notes & Scope */}
      <Card title="Project Notes & Scope">
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="block text-sm font-semibold mb-1.5 dark:text-gray-100">Scope Summary / Notes</label>
            <textarea
              value={projectNotes.scopeNotes}
              onChange={e => setProjectNotes({...projectNotes, scopeNotes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
              rows={3}
              placeholder="Brief overview of project scope..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 dark:text-gray-100">Custom Assumptions</label>
            <textarea
              value={projectNotes.assumptions}
              onChange={e => setProjectNotes({...projectNotes, assumptions: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
              rows={2}
              placeholder="Project-specific assumptions..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 dark:text-gray-100">
              Inclusions
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(One item per line)</span>
            </label>
            <textarea
              value={projectNotes.inclusions}
              onChange={e => setProjectNotes({...projectNotes, inclusions: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
              rows={8}
              placeholder="One inclusion per line..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 dark:text-gray-100">
              Exclusions
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(One item per line)</span>
            </label>
            <textarea
              value={projectNotes.exclusions}
              onChange={e => setProjectNotes({...projectNotes, exclusions: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
              rows={8}
              placeholder="One exclusion per line..."
            />
          </div>
        </div>
      </Card>

      {/* Photos */}
      <Card title="Project Photos">
        <div>
          <div className="mb-3">
            <label className="block text-sm font-semibold mb-2 dark:text-gray-100">Add Photos</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (!files) return;

                Array.from(files).forEach(file => {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    setPhotos(prev => [...prev, {
                      id: Date.now().toString() + Math.random(),
                      dataUrl,
                      caption: file.name,
                    }]);
                  };
                  reader.readAsDataURL(file);
                });

                // Reset input
                e.target.value = '';
              }}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                dark:file:bg-blue-900/30 dark:file:text-blue-400
                hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                cursor-pointer"
            />
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map(photo => (
                <div key={photo.id} className="relative border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <img src={photo.dataUrl} alt={photo.caption} className="w-full h-32 object-cover" />
                  <div className="p-2 bg-white dark:bg-gray-800">
                    <input
                      value={photo.caption}
                      onChange={e => setPhotos(prev => prev.map(p => p.id === photo.id ? {...p, caption: e.target.value} : p))}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Caption..."
                    />
                  </div>
                  <button
                    onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Export to PDF */}
      <Card title="Export Proposal">
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <label className="text-sm font-semibold min-w-[100px] dark:text-gray-100">Project Name:</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            placeholder="Enter project name..."
          />
        </div>
        <button
          onClick={exportToPDF}
          style={{
            padding: "12px 24px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
          }}
        >
          📄 Export to PDF
        </button>
      </Card>

      {/* Tab Selector */}
      <Card>
        <div className="flex gap-2 border-b-2 border-gray-200 dark:border-gray-700 -mb-4 pb-0">
          <button
            onClick={() => setViewMode("pricing")}
            className={`px-6 py-3 border-none cursor-pointer text-base transition-all ${
              viewMode === "pricing"
                ? "border-b-[3px] border-b-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 font-semibold"
                : "border-b-[3px] border-b-transparent bg-transparent text-gray-500 dark:text-gray-400 font-normal"
            }`}
          >
            💰 Pricing
          </button>
          <button
            onClick={() => setViewMode("weights")}
            className={`px-6 py-3 border-none cursor-pointer text-base transition-all ${
              viewMode === "weights"
                ? "border-b-[3px] border-b-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-500 dark:text-purple-400 font-semibold"
                : "border-b-[3px] border-b-transparent bg-transparent text-gray-500 dark:text-gray-400 font-normal"
            }`}
          >
            ⚖️ Weights & Loads
          </button>
        </div>
      </Card>

      {/* Pricing View */}
      {viewMode === "pricing" && (
        <div style={{ display: "grid", gap: 16 }}>
      {/* Construction Type Selector */}
      <Card title="Construction Type">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer ${constructionType === "EPS" ? "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"}`}>
            <input type="radio" checked={constructionType === "EPS"} onChange={() => setConstructionType("EPS")} />
            <div>
              <div className="font-semibold dark:text-gray-100">EPS Construction</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Foam vessel with tile finish</div>
            </div>
          </label>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer ${constructionType === "Stainless Steel" ? "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"}`}>
            <input type="radio" checked={constructionType === "Stainless Steel"} onChange={() => setConstructionType("Stainless Steel")} />
            <div>
              <div className="font-semibold dark:text-gray-100">Stainless Steel</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">304L/316L fabricated in Mexico</div>
            </div>
          </label>
        </div>
      </Card>

      {/* Top controls row */}
      <GridCols cols={3}>
        <Card title="Scopes" tight>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(140px, 1fr))", gap: 8 }}>
            <label><input type="checkbox" checked={scopeMaterials} onChange={e=>setScopeMaterials(e.target.checked)} /> Materials</label>
            <label><input type="checkbox" checked={scopeLabor}     onChange={e=>setScopeLabor(e.target.checked)} /> Labor</label>
            <label><input type="checkbox" checked={scopeEquipment} onChange={e=>setScopeEquipment(e.target.checked)} /> Equipment</label>
            <label><input type="checkbox" checked={scopeFreight}   onChange={e=>setScopeFreight(e.target.checked)} /> Freight/Delivery</label>
            <label><input type="checkbox" checked={scopeDesignEng} onChange={e=>setScopeDesignEng(e.target.checked)} /> Design & Engineering</label>
            <label><input type="checkbox" checked={scopeDesignCont} onChange={e=>setScopeDesignCont(e.target.checked)} /> Design Contingency</label>
            <label><input type="checkbox" checked={scopeWarranty}  onChange={e=>setScopeWarranty(e.target.checked)} /> Warranty reserve</label>
          </div>
        </Card>

        <Card title="OH&P, Waste, Warranty & Contingency" tight>
          <Row label="OH&P (%)"><Num value={ohpPct} onChange={setOhpPct} step={0.5} min={0} max={100} title="Overhead & Profit percentage" /></Row>
          <Row label="Waste (%)"><Num value={wastePct} onChange={setWastePct} step={0.5} min={0} max={100} title="Material waste and inefficiency percentage" /></Row>
          <Row label="Warranty (% of client)"><Num value={warrantyPctOfClient} onChange={setWarrantyPctOfClient} step={0.1} min={0} max={100} title="Warranty reserve as percentage of total client price" /></Row>
          <Row label="Design development contingency (%)"><Num value={designContPct} onChange={setDesignContPct} step={0.5} min={0} max={100} title="Buffer for scope changes and unknowns" /></Row>
        </Card>

        <Card title="Design & Engineering" tight>
          <Row label="Design base ($)"><Num value={designBase} onChange={setDesignBase} step={500} min={0} title="Base design & engineering cost for DOH and permit-ready drawings" /></Row>
          <Row label="Complexity multiplier (×)"><Num value={designMult} onChange={setDesignMult} step={0.05} min={0} title="Adjust for project complexity (1.0 = standard, >1.0 = more complex)" /></Row>
        </Card>
      </GridCols>

      {/* Materials / Labor / Freight */}
      <GridCols cols={3}>
        {constructionType === "EPS" ? (
          <Card title="Materials (per-SF / per-vessel)">
            <Row label="EPS Vessel Materials ($/sf)">
              <Num value={epsBundlePerSf} onChange={setEpsBundlePerSf} step={0.25} min={0} title="EPS foam, adhesives, mesh, Basecrete/membrane per square foot" />
            </Row>
            <Row label="Tile & Setting Materials ($/sf)">
              <Num value={tileMaterialsPerSf} onChange={setTileMaterialsPerSf} step={0.5} min={0} title="Tile, thinset, grout, and sundries per square foot" />
            </Row>
            <Row label="FF&E Materials ($/vessel)">
              <Num value={ffeMaterialsPerVessel} onChange={setFfeMaterialsPerVessel} step={50} min={0} title="Handrails, markers, and DOH safety kit per vessel" />
            </Row>
          </Card>
        ) : (
          <Card title="Stainless Steel Materials">
            <Row label="304L Plate ($/lb)">
              <Num value={ss304LPricePerLb} onChange={setSs304LPricePerLb} step={0.05} min={0} title="304L stainless steel plate price per pound (Mexican sourced)" />
            </Row>
            <Row label="316L Tubing ($/ft)">
              <Num value={ss316LPricePerFt} onChange={setSs316LPricePerFt} step={0.5} min={0} title="316L stainless tubing/pipe for handrails per linear foot" />
            </Row>
            <Row label="Plate Thickness (inches)">
              <Num value={plateThickness} onChange={setPlateThickness} step={0.0625} min={0.0625} title="Plate thickness in inches (3/16 inch = 0.1875)" />
            </Row>
            <Row label="Bitumastic Coating ($/sf)">
              <Num value={bitumasticCoatingPerSf} onChange={setBitumasticCoatingPerSf} step={0.25} min={0} title="Exterior coating per square foot" />
            </Row>
            <Row label="Sacrificial Anodes ($/vessel)">
              <Num value={sacrificialAnodePerVessel} onChange={setSacrificialAnodePerVessel} step={50} min={0} title="Magnesium anodes for corrosion protection" />
            </Row>
            <Row label="ADA Transfer Wall / Steel Frame">
              <label><input type="checkbox" checked={includeAdaFrame} onChange={e=>setIncludeAdaFrame(e.target.checked)} /> Include 2&quot; steel tubing frame</label>
            </Row>
            {includeAdaFrame && (
              <>
                <Row label="Steel Tubing ($/ft)">
                  <Num value={steelTubingPricePerFt} onChange={setSteelTubingPricePerFt} step={0.25} min={0} title="2 inch mild steel tubing price per linear foot" />
                </Row>
                <Row label="Steel Fabrication ($/ft)">
                  <Num value={steelFabricationPerFt} onChange={setSteelFabricationPerFt} step={0.5} min={0} title="Welding and fabrication cost per linear foot" />
                </Row>
              </>
            )}
          </Card>
        )}

        {constructionType === "EPS" ? (
          <Card title="Labor (per-SF / per-vessel)">
            <Row label="EPS + Waterproofing Labor ($/sf)">
              <Num value={epsWpLaborPerSf} onChange={setEpsWpLaborPerSf} step={1} min={0} title="Fabrication and membrane application labor per square foot" />
            </Row>
            <Row label="Tile Install Labor ($/sf)">
              <Num value={tileLaborPerSf} onChange={setTileLaborPerSf} step={1} min={0} title="Tile setting and grouting labor per square foot" />
            </Row>
            <Row label="FF&E Labor ($/vessel)">
              <Num value={ffeLaborPerVessel} onChange={setFfeLaborPerVessel} step={50} min={0} title="Install handrails, signage, safety equipment (3-4 hrs at loaded rate)" />
            </Row>
            <Row label="Equip & Interconnect ($/vessel — HT = 1.5×)">
              <Num value={equipPlumbPerVessel} onChange={setEquipPlumbPerVessel} step={250} min={0} title="Equipment placement and plumbing interconnect (Hot Tubs get 1.5× multiplier)" />
            </Row>
            <Row label="Refrigeration Line (CP only)">
              <Num value={refrigLinePerCP} onChange={setRefrigLinePerCP} step={50} min={0} title="Run and insulate refrigeration lines for Cold Plunge" />
            </Row>
            <Row label="Rep Onsite (project)">
              <Num value={repOnsiteFee} onChange={setRepOnsiteFee} step={100} min={0} title="On-site representative fee for the entire project" />
            </Row>
            <Row label="Startup / Commissioning (project)">
              <Num value={startupLump} onChange={setStartupLump} step={100} min={0} title="Technician time and system balancing for project" />
            </Row>
            <Row label="Region multiplier (×)">
              <Num value={regionMult} onChange={setRegionMult} step={0.01} min={0} title="Regional cost adjustment multiplier for labor and freight (1.0 = baseline)" />
            </Row>
            <Row label="Include Rigging?">
              <label><input type="checkbox" checked={includeRigging} onChange={e=>setIncludeRigging(e.target.checked)} /> Yes</label>
            </Row>
            <Row label="Rigging ($/vessel)">
              <Num value={riggingPerVessel} onChange={setRiggingPerVessel} step={100} min={0} title="Crane or forklift placement cost per vessel" />
            </Row>
          </Card>
        ) : (
          <Card title="Fabrication Labor (Mexico)">
            <Row label="TIG Welder Rate ($/hr)">
              <Num value={tigWelderRatePerHr} onChange={setTigWelderRatePerHr} step={0.5} min={0} title="AWS D1.6 certified TIG welder hourly rate (Mexico)" />
            </Row>
            <Row label="Loaded Rate Multiplier (×)">
              <Num value={welderLoadedMult} onChange={setWelderLoadedMult} step={0.05} min={1} title="Multiplier for benefits, overhead, etc. (typically 1.5-1.8)" />
            </Row>
            <Row label="TIG Welding (hrs/LF)">
              <Num value={weldingTimePerLf} onChange={setWeldingTimePerLf} step={0.01} min={0} title="Hours per linear foot of TIG weld" />
            </Row>
            <Row label="Grinding/Finishing (hrs/LF)">
              <Num value={grindingTimePerLf} onChange={setGrindingTimePerLf} step={0.01} min={0} title="Hours per linear foot for grinding welds smooth" />
            </Row>
            <Row label="316L Polishing (hrs/LF)">
              <Num value={polishingTimePerLf} onChange={setPolishingTimePerLf} step={0.01} min={0} title="Hours per LF to polish 316L to 600 grit" />
            </Row>
            <Row label="Passivation ($/sf)">
              <Num value={passivationPerSf} onChange={setPassivationPerSf} step={0.1} min={0} title="Chemical cleaning and passivation per square foot" />
            </Row>
            <Row label="Leak Testing ($/vessel)">
              <Num value={leakTestPerVessel} onChange={setLeakTestPerVessel} step={50} min={0} title="Leak testing cost per vessel" />
            </Row>
            <Row label="Quality Certification ($/vessel)">
              <Num value={qualityCertPerVessel} onChange={setQualityCertPerVessel} step={50} min={0} title="AWS certification and QC documentation" />
            </Row>
            <Row label="Equip & Interconnect ($/vessel — HT = 1.5×)">
              <Num value={equipPlumbPerVessel} onChange={setEquipPlumbPerVessel} step={250} min={0} title="Equipment placement and plumbing interconnect" />
            </Row>
          </Card>
        )}

        <Card title="Freight / Delivery">
          <Row label="Distance (mi)"><Num value={miles} onChange={setMiles} min={0} title="Distance to job site in miles" /></Row>
          <Row label="Rate ($/mi)"><Num value={dollarsPerMile} onChange={setDollarsPerMile} step={0.05} min={0} title="Line-haul rate per mile" /></Row>
          <Row label="Handling per vessel ($)"><Num value={handlingPerVessel} onChange={setHandlingPerVessel} step={50} min={0} title="Loading/unloading handling fee per vessel" /></Row>
        </Card>
      </GridCols>

      {/* Vessels */}
      <Card title="Vessels">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => openQuickAdd("Cold Plunge")} style={{...btn, fontWeight: 600, background: "#3b82f6", color: "#fff", border: "1px solid #2563eb"}}>+ Cold Plunge</button>
          <button onClick={() => openQuickAdd("Hot Tub")} style={{...btn, fontWeight: 600, background: "#ef4444", color: "#fff", border: "1px solid #dc2626"}}>+ Hot Tub</button>
        </div>

        {vessels.map((v) => {
          const c = vesselCalcs.find(x => x.vessel.id === v.id)!;
          const availablePkgs = packages.filter(p => p.appliesTo.includes(v.type));
          const headerRight = (
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6b7280" }}>
              <span>Finish: <b>{fmt(c.areas.finishSf)} sf</b></span>
              <span>Direct: <b>${fmt(c.perVesselDirect)}</b></span>
            </div>
          );

          return (
            <div key={v.id} style={{ border: "1px dashed #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => updateVessel(v.id, { collapsed: !v.collapsed })}
                    aria-expanded={!v.collapsed}
                    title={v.collapsed ? "Expand" : "Collapse"}
                    className="w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 cursor-pointer"
                  >
                    {v.collapsed ? "▸" : "▾"}
                  </button>
                  <div className="font-semibold dark:text-gray-100">{v.name} — {v.type}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {headerRight}
                  <button onClick={() => duplicateVessel(v.id)} className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" title="Duplicate this vessel">Duplicate</button>
                  <button onClick={() => removeVessel(v.id)} className="px-2.5 py-1 rounded-lg border border-red-400 dark:border-red-500 text-red-500 dark:text-red-400 bg-white dark:bg-gray-800">Remove</button>
                </div>
              </div>

              {!v.collapsed && (
                <div style={{ marginTop: 12, display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
                  <div>
                    <Row label="Name">
                      <input value={v.name} onChange={e => updateVessel(v.id, { name: e.target.value })} className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                    </Row>
                    <Row label="Inside length (ft)"><Num value={v.length_ft} onChange={n => updateVessel(v.id, { length_ft: n })} step={0.1} min={0.1} title="Interior length of vessel in feet" /></Row>
                    <Row label="Inside width (ft)"><Num value={v.width_ft} onChange={n => updateVessel(v.id, { width_ft: n })} step={0.1} min={0.1} title="Interior width of vessel in feet" /></Row>
                    <Row label="Water depth (ft)"><Num value={v.waterDepth_ft} onChange={n => updateVessel(v.id, { waterDepth_ft: n })} step={0.1} min={0.1} title="Water depth in feet (affects wall surface area)" /></Row>
                    <Row label="Wall height (ft)"><Num value={v.wallHeight_ft} onChange={n => updateVessel(v.id, { wallHeight_ft: n })} step={0.1} min={0.1} title="Total wall height (for weight calculations)" /></Row>
                  </div>
                  <div>
                    <Row label="Include bench">
                      <label><input type="checkbox" checked={v.hasBench} onChange={e => updateVessel(v.id, { hasBench: e.target.checked })} /> Yes</label>
                    </Row>
                    {v.hasBench && (
                      <>
                        <Row label="Bench length (in)"><Num value={v.benchLength_ft * 12} onChange={n => updateVessel(v.id, { benchLength_ft: n / 12 })} step={1} min={1} /></Row>
                        <Row label="Bench depth (in)"><Num value={v.benchDepth_ft * 12} onChange={n => updateVessel(v.id, { benchDepth_ft: n / 12 })} step={1} min={1} /></Row>
                        <Row label="Bench height (in)"><Num value={v.benchHeight_ft * 12} onChange={n => updateVessel(v.id, { benchHeight_ft: n / 12 })} step={1} min={1} /></Row>
                      </>
                    )}
                    <Row label="Include steps">
                      <label><input type="checkbox" checked={v.hasSteps} onChange={e => updateVessel(v.id, { hasSteps: e.target.checked })} /> Yes</label>
                    </Row>
                    {v.hasSteps && (
                      <>
                        <Row label="Steps width (in)"><Num value={v.stepsWidth_ft * 12} onChange={n => updateVessel(v.id, { stepsWidth_ft: n / 12 })} step={1} min={1} /></Row>
                        <Row label="Number of steps"><Num value={v.stepsCount} onChange={n => updateVessel(v.id, { stepsCount: Math.round(n) })} min={1} /></Row>
                        <Row label="Step riser (in)"><Num value={v.stepRiser_ft * 12} onChange={n => updateVessel(v.id, { stepRiser_ft: n / 12 })} step={0.5} min={1} /></Row>
                        <Row label="Step tread (in)"><Num value={v.stepTread_ft * 12} onChange={n => updateVessel(v.id, { stepTread_ft: n / 12 })} step={1} min={1} /></Row>
                      </>
                    )}
                  </div>
                  <div>
                    <Row label="Handrails (ea)"><Num value={v.handrails} onChange={n => updateVessel(v.id, { handrails: n })} min={0} title="Number of handrails to install" /></Row>
                    {v.type === "Cold Plunge" && (
                      <Row label="Refrigeration line set">
                        <label><input type="checkbox" checked={v.refrigerationLine} onChange={e => updateVessel(v.id, { refrigerationLine: e.target.checked })} /> Include</label>
                      </Row>
                    )}
                    {v.type === "Hot Tub" && (
                      <Row label="Jets (install complexity)"><Num value={v.jets} onChange={n => updateVessel(v.id, { jets: n })} min={0} title="Number of jets (>6 adds $100 labor per extra jet)" /></Row>
                    )}
                    <Row label="Number of Bathers"><Num value={v.bathers} onChange={n => updateVessel(v.id, { bathers: Math.round(n) })} min={0} title="Number of bathers for weight calculations" /></Row>
                  </div>
                  <div>
                    <Row label="Equipment package">
                      <select
                        value={v.equipmentPackageKey}
                        onChange={e => updateVessel(v.id, { equipmentPackageKey: e.target.value })}
                        className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                      >
                        {availablePkgs.map(p => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                      </select>
                    </Row>
                    {constructionType === "EPS" && (
                      <>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <label style={{ fontSize: 13, fontWeight: 500 }}>EPS Wall Thickness: {v.eps_wall_thickness_ft.toFixed(2)} ft ({(v.eps_wall_thickness_ft * 12).toFixed(1)}")</label>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.08333"
                            value={v.eps_wall_thickness_ft}
                            onChange={e => updateVessel(v.id, { eps_wall_thickness_ft: parseFloat(e.target.value) })}
                            style={{ width: "100%", accentColor: "#3b82f6" }}
                          />
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Range: 6" - 24" (default: 12")</div>
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <label style={{ fontSize: 13, fontWeight: 500 }}>EPS Floor Thickness: {v.eps_floor_thickness_ft.toFixed(2)} ft ({(v.eps_floor_thickness_ft * 12).toFixed(1)}")</label>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="1.5"
                            step="0.08333"
                            value={v.eps_floor_thickness_ft}
                            onChange={e => updateVessel(v.id, { eps_floor_thickness_ft: parseFloat(e.target.value) })}
                            style={{ width: "100%", accentColor: "#3b82f6" }}
                          />
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Range: 6" - 18" (default: 8")</div>
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                      Areas — Floor: <b>{fmt(c.areas.floorSf)} sf</b>, Walls: <b>{fmt(c.areas.wallSf)} sf</b>, Benches/Steps: <b>{fmt(c.areas.benchSf)} sf</b>, Finish total: <b>{fmt(c.areas.finishSf)} sf</b>
                      <br />
                      Subtotals — Materials: <b>${fmt(
                        constructionType === "EPS"
                          ? (c.materials as any).materialsEpsBundle + (c.materials as any).materialsTile + (c.materials as any).materialsFfe + ((c.materials as any).adaFrameCost || 0)
                          : (c.materials as any).materialsStainless + (c.materials as any).coatingCost + (c.materials as any).anodeCost + (c.materials as any).materialsTile + (c.materials as any).materialsFfe + ((c.materials as any).adaFrameCost || 0)
                      )}</b> | Equipment: <b>${fmt(c.equipmentSubtotal)}</b> | Labor: <b>${fmt(c.laborSubtotal)}</b>
                    </div>
                  </div>
                </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>


      {/* Equipment config (collapsible) */}
      <details>
        <summary style={summary}>Equipment Package Configuration</summary>
        <Card>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Edit line-item pricing inside each package. These changes affect totals immediately.
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {packages.map((p, idxP) => (
              <details key={p.key}>
                <summary style={summarySm}>{p.label} — applies to {p.appliesTo.join(", ")}</summary>
                <div style={{ padding: "8px 0", display: "grid", gap: 6 }}>
                  {p.items.map((it, idxI) => (
                    <div key={idxI} style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
                      <input
                        value={it.label}
                        onChange={e => {
                          const next = [...packages];
                          next[idxP] = { ...next[idxP], items: next[idxP].items.map((x, i) => i === idxI ? { ...x, label: e.target.value } : x) };
                          setPackages(next);
                        }}
                        className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                      />
                      <Num
                        value={it.cost}
                        onChange={(n) => {
                          const next = [...packages];
                          next[idxP] = { ...next[idxP], items: next[idxP].items.map((x, i) => i === idxI ? { ...x, cost: clampN(n) } : x) };
                          setPackages(next);
                        }}
                        step={100}
                      />
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Card>
      </details>

      {/* Assumptions & math (collapsible) */}
      <details>
        <summary style={summary}>Assumptions & Math (click to expand)</summary>
        <Card>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thLeft}>Bucket</th>
                  <th style={thLeft}>What it includes</th>
                  <th style={thLeft}>Default</th>
                  <th style={thLeft}>Units</th>
                  <th style={thLeft}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={tdLeft}>EPS Vessel Materials</td><td style={tdLeft}>EPS foam, adhesives, mesh, Basecrete/membrane</td><td style={tdLeft}>$6.00</td><td style={tdLeft}>per sf (finish)</td><td style={tdLeft}>EPS @ ~$7.80/ft³ blended into rate</td></tr>
                <tr><td style={tdLeft}>Tile & Setting Materials</td><td style={tdLeft}>Tile, thinset, grout, sundries</td><td style={tdLeft}>$20.00</td><td style={tdLeft}>per sf (floor+walls)</td><td style={tdLeft}>Finish materials only</td></tr>
                <tr><td style={tdLeft}>EPS + Waterproofing Labor</td><td style={tdLeft}>Fabrication + membrane application</td><td style={tdLeft}>$40.00</td><td style={tdLeft}>per sf (finish)</td><td style={tdLeft}>Labor only</td></tr>
                <tr><td style={tdLeft}>Tile Install Labor</td><td style={tdLeft}>Set tile + grout</td><td style={tdLeft}>$40.00</td><td style={tdLeft}>per sf (floor+walls)</td><td style={tdLeft}>Labor only</td></tr>
                <tr><td style={tdLeft}>FF&E Materials</td><td style={tdLeft}>Handrails, markers, safety kit</td><td style={tdLeft}>$2,000</td><td style={tdLeft}>per vessel</td><td style={tdLeft}>Hard goods bundle</td></tr>
                <tr><td style={tdLeft}>FF&E Labor</td><td style={tdLeft}>Install rails, signage, etc.</td><td style={tdLeft}>$600</td><td style={tdLeft}>per vessel</td><td style={tdLeft}>3–4 hrs @ loaded rate</td></tr>
                <tr><td style={tdLeft}>Equip & Interconnect</td><td style={tdLeft}>Set equipment, tie-in plumbing</td><td style={tdLeft}>$15,000</td><td style={tdLeft}>per vessel</td><td style={tdLeft}>Hot Tub = 1.5× for jets</td></tr>
                <tr><td style={tdLeft}>Refrigeration Line (CP)</td><td style={tdLeft}>Run/insulate refrig lines</td><td style={tdLeft}>$1,800</td><td style={tdLeft}>per vessel</td><td style={tdLeft}>Cold Plunge only</td></tr>
                <tr><td style={tdLeft}>Freight / Delivery</td><td style={tdLeft}>Line-haul + handling</td><td style={tdLeft}>$4.25/mi + $1,000/vessel</td><td style={tdLeft}>project + per vessel</td><td style={tdLeft}>Region multiplier applies to labor</td></tr>
                <tr><td style={tdLeft}>Design & Engineering</td><td style={tdLeft}>DOH + permit-ready drawings</td><td style={tdLeft}>$25,000 × mult</td><td style={tdLeft}>per project</td><td style={tdLeft}>Complexity multiplier adjustable</td></tr>
                <tr><td style={tdLeft}>Startup / Commissioning</td><td style={tdLeft}>Tech time, balancing</td><td style={tdLeft}>$3,500</td><td style={tdLeft}>per project</td><td style={tdLeft}>Average commercial start</td></tr>
                <tr><td style={tdLeft}>Rigging</td><td style={tdLeft}>Crane/fork placement</td><td style={tdLeft}>$2,000</td><td style={tdLeft}>per vessel</td><td style={tdLeft}>Toggle on/off</td></tr>
                <tr><td style={tdLeft}>Design Dev. Contingency</td><td style={tdLeft}>Scope/unknowns buffer</td><td style={tdLeft}>7.5%</td><td style={tdLeft}>of base</td><td style={tdLeft}>Applied pre-waste, pre-OH&P</td></tr>
                <tr><td style={tdLeft}>Waste</td><td style={tdLeft}>Cuts/overage/inefficiency</td><td style={tdLeft}>7.5%</td><td style={tdLeft}>of base+cont</td><td style={tdLeft}>Markup layer</td></tr>
                <tr><td style={tdLeft}>OH&P</td><td style={tdLeft}>Overhead & profit</td><td style={tdLeft}>12%</td><td style={tdLeft}>of base+cont</td><td style={tdLeft}>Profit ≈ OH&P amount</td></tr>
                <tr><td style={tdLeft}>Warranty Reserve</td><td style={tdLeft}>Post-completion reserve</td><td style={tdLeft}>1.5%</td><td style={tdLeft}>of client total</td><td style={tdLeft}>Solved from top-line</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </details>

      {/* Consolidated Scope Breakdown */}
      {project.scopeBreakdown && (
        <Card title="Cost Breakdown by Category">
          {/* Donut Chart */}
          <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {(() => {
              const categories = [
                { label: 'Vessel & Install', pct: project.scopeBreakdown.vesselAndInstall.pct, cost: project.scopeBreakdown.vesselAndInstall.cost, color: '#3b82f6' },
                { label: 'Equipment & Install', pct: project.scopeBreakdown.equipmentAndInstall.pct, cost: project.scopeBreakdown.equipmentAndInstall.cost, color: '#8b5cf6' },
                { label: 'Freight / Handling', pct: project.scopeBreakdown.freightHandling.pct, cost: project.scopeBreakdown.freightHandling.cost, color: '#10b981' },
                { label: 'Design / Engineering', pct: project.scopeBreakdown.designEngineering.pct, cost: project.scopeBreakdown.designEngineering.cost, color: '#ef4444' },
              ];
              const radius = 100;
              const strokeWidth = 40;
              const centerX = 150;
              const centerY = 150;
              const circumference = 2 * Math.PI * radius;

              let accumulatedPct = 0;
              const arcs = categories.map((cat) => {
                const startPct = accumulatedPct;
                const endPct = accumulatedPct + cat.pct;
                accumulatedPct = endPct;
                const startAngle = (startPct / 100) * 360 - 90;
                const endAngle = (endPct / 100) * 360 - 90;
                return { ...cat, startAngle, endAngle };
              });

              const polarToCartesian = (angle: number) => {
                const rad = (angle * Math.PI) / 180;
                return {
                  x: centerX + radius * Math.cos(rad),
                  y: centerY + radius * Math.sin(rad),
                };
              };

              return (
                <div style={{ display: 'flex', gap: 40, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <svg width="300" height="300" viewBox="0 0 300 300">
                    {arcs.map((arc, i) => {
                      const start = polarToCartesian(arc.startAngle);
                      const end = polarToCartesian(arc.endAngle);
                      const largeArc = arc.pct > 50 ? 1 : 0;
                      const pathData = [
                        `M ${start.x} ${start.y}`,
                        `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
                      ].join(' ');
                      return (
                        <path
                          key={i}
                          d={pathData}
                          fill="none"
                          stroke={arc.color}
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                        />
                      );
                    })}
                    <text x={centerX} y={centerY - 10} textAnchor="middle" fontSize="16" fontWeight="600" className="fill-gray-900 dark:fill-gray-100">
                      Total
                    </text>
                    <text x={centerX} y={centerY + 15} textAnchor="middle" fontSize="24" fontWeight="700" className="fill-gray-900 dark:fill-gray-100">
                      ${fmt(project.clientPrice / 1000)}k
                    </text>
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {categories.map((cat, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 16, height: 16, background: cat.color, borderRadius: 3 }} />
                        <div>
                          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{cat.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">${fmt(cat.cost)} ({fmt(cat.pct)}%)</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Project-Level Breakdown with Subcategories */}
          <div style={{ marginBottom: 24 }}>
            <div className="font-semibold mb-3 text-base dark:text-gray-100">Project Total Breakdown</div>
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              {/* Vessel & Vessel Install */}
              {(() => {
                const cat = project.scopeBreakdown.vesselAndInstall;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      onClick={() => setVesselExpanded(!vesselExpanded)}
                      style={{ cursor: 'pointer', marginBottom: 6 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, alignItems: 'center' }}>
                        <span className="text-gray-700 dark:text-gray-200 font-semibold">
                          {vesselExpanded ? '▾' : '▸'} Vessel & Vessel Install
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">${fmt(cat.cost)} ({fmt(cat.pct)}%)</span>
                      </div>
                      <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded-md overflow-hidden">
                        <div style={{ height: '100%', background: '#3b82f6', width: `${Math.min(cat.pct, 100)}%`, transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                          {cat.pct > 8 && `${fmt(cat.pct)}%`}
                        </div>
                      </div>
                    </div>
                    {vesselExpanded && cat.subcategories && (
                      <div style={{ marginLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span>• Vessel Materials</span>
                            <span>${fmt(cat.subcategories.materials.cost)} ({fmt(cat.subcategories.materials.pct)}%)</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• Vessel Install Labor</span>
                            <span>${fmt(cat.subcategories.install.cost)} ({fmt(cat.subcategories.install.pct)}%)</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Equipment & Equipment Install */}
              {(() => {
                const cat = project.scopeBreakdown.equipmentAndInstall;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      onClick={() => setEquipExpanded(!equipExpanded)}
                      style={{ cursor: 'pointer', marginBottom: 6 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, alignItems: 'center' }}>
                        <span className="text-gray-700 dark:text-gray-200 font-semibold">
                          {equipExpanded ? '▾' : '▸'} Equipment & Equipment Install
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">${fmt(cat.cost)} ({fmt(cat.pct)}%)</span>
                      </div>
                      <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded-md overflow-hidden">
                        <div style={{ height: '100%', background: '#8b5cf6', width: `${Math.min(cat.pct, 100)}%`, transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                          {cat.pct > 8 && `${fmt(cat.pct)}%`}
                        </div>
                      </div>
                    </div>
                    {equipExpanded && cat.subcategories && (
                      <div style={{ marginLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span>• Equipment</span>
                            <span>${fmt(cat.subcategories.equipment.cost)} ({fmt(cat.subcategories.equipment.pct)}%)</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• Equipment Install Labor</span>
                            <span>${fmt(cat.subcategories.install.cost)} ({fmt(cat.subcategories.install.pct)}%)</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Freight / Handling */}
              {(() => {
                const cat = project.scopeBreakdown.freightHandling;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span className="text-gray-700 dark:text-gray-200 font-semibold">Freight / Handling</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">${fmt(cat.cost)} ({fmt(cat.pct)}%)</span>
                    </div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded-md overflow-hidden">
                      <div style={{ height: '100%', background: '#10b981', width: `${Math.min(cat.pct, 100)}%`, transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                        {cat.pct > 8 && `${fmt(cat.pct)}%`}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Design / Engineering */}
              {(() => {
                const cat = project.scopeBreakdown.designEngineering;
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span className="text-gray-700 dark:text-gray-200 font-semibold">Design / Engineering</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">${fmt(cat.cost)} ({fmt(cat.pct)}%)</span>
                    </div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded-md overflow-hidden">
                      <div style={{ height: '100%', background: '#ef4444', width: `${Math.min(cat.pct, 100)}%`, transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                        {cat.pct > 8 && `${fmt(cat.pct)}%`}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Per-Vessel Breakdown */}
          <div>
            <div className="font-semibold mb-3 text-base dark:text-gray-100">Per-Vessel Breakdown</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th style={thLeft}>Vessel</th>
                    <th style={th}>Vessel & Install</th>
                    <th style={th}>Equipment & Install</th>
                    <th style={th}>Freight/Handling</th>
                    <th style={th}>Design/Eng</th>
                    <th style={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {project.perVesselBreakdown.map((r) => (
                    <tr key={r.id}>
                      <td style={tdLeft}><strong>{r.name}</strong></td>
                      <td style={tdMoney}>${fmt(r.vesselAndInstall)}</td>
                      <td style={tdMoney}>${fmt(r.equipmentAndInstall)}</td>
                      <td style={tdMoney}>${fmt(r.freightHandling)}</td>
                      <td style={tdMoney}>${fmt(r.designEngineering)}</td>
                      <td style={{ ...tdMoney, fontWeight: 700, borderLeft: '2px solid #e5e7eb' }}>${fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-[500px] w-[90%] max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-semibold m-0 dark:text-gray-100">Add {quickAddType}</h2>
              <button onClick={() => setShowQuickAdd(false)} className="bg-transparent border-none text-2xl cursor-pointer p-1 dark:text-gray-300">×</button>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label className="block text-sm font-semibold mb-1.5 dark:text-gray-100">Vessel Name</label>
                <input
                  type="text"
                  value={quickAddName}
                  onChange={e => setQuickAddName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g., CP-1"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 dark:text-gray-100">
                  Bather Capacity <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(1 person = 10 sq ft)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={quickAddBathers}
                  onChange={e => setQuickAddBathers(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Target area: {fmt(quickAddBathers * 10)} sq ft
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <div className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-200">Suggested Dimensions</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Length (ft)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={quickAddLength}
                      onChange={e => setQuickAddLength(Number(e.target.value))}
                      style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Width (ft)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={quickAddWidth}
                      onChange={e => setQuickAddWidth(Number(e.target.value))}
                      style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Depth (ft)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={quickAddDepth}
                      onChange={e => setQuickAddDepth(Number(e.target.value))}
                      style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                  Actual floor area: <strong>{fmt(quickAddLength * quickAddWidth)} sq ft</strong> = <strong>{fmt((quickAddLength * quickAddWidth) / 10)} persons</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setShowQuickAdd(false)}
                  style={{ flex: 1, padding: "10px 16px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={addVesselFromQuickAdd}
                  style={{ flex: 1, padding: "10px 16px", border: "none", borderRadius: 8, background: quickAddType === "Cold Plunge" ? "#3b82f6" : "#ef4444", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                >
                  Add Vessel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <GridCols cols={2}>
        <Card title="Project Summary — Hard Costs vs Client">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <div>
              <div style={row}><span className="l">Finish Surface Area</span><b>{fmt(project.finishSfTotal)} sf</b></div>
              <div style={row}><span className="l">Materials (vessels)</span><b>${fmt(project.materialsTotal)}</b></div>
              <div style={row}><span className="l">Equipment (vessels)</span><b>${fmt(project.equipmentSubtotalVessels)}</b></div>
              <div style={row}><span className="l">Labor (vessels)</span><b>${fmt(project.laborSubtotal)}</b></div>
              <div style={row}><span className="l">Freight / Delivery</span><b>${fmt(project.freightTotal)}</b></div>
              <div style={row}><span className="l">Design & Engineering</span><b>${fmt(project.designEngineering)}</b></div>
              <div style={row}><span className="l">Rep Onsite (project)</span><b>${fmt(project.repFee)}</b></div>
              <div style={row}><span className="l">Startup (project)</span><b>${fmt(project.startup)}</b></div>
              <div style={row}><span className="l">Chem Storage (project)</span><b>${fmt(project.chemStorage)}</b></div>
              <div style={row}><span className="l">Rigging</span><b>${fmt(project.rigging)}</b></div>
              <div className="h-px bg-gray-200 dark:bg-gray-700 my-2.5" />
              <div style={row}><span className="l">Design Contingency</span><b>${fmt(project.designContAmount)}</b></div>
              <div style={row}><span className="l">Waste</span><b>${fmt(project.wasteAmount)}</b></div>
              <div style={row}><span className="l">OH&P</span><b>${fmt(project.ohpAmount)}</b></div>
              <div style={row}><span className="l">Warranty</span><b>${fmt(project.warrantyReserve)}</b></div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div style={rowBig}><span>Client Price</span><b>${fmt(project.clientPrice)}</b></div>
              <div style={row}><span>Profit (≈ OH&P amount)</span><b>${fmt(project.ohpAmount)}</b></div>
              <div style={row}><span>Gross Margin</span><b>{fmt(project.grossMarginPct)}%</b></div>
              <div style={row}><span>Effective $/sf (client)</span><b>${fmt(project.effectivePerSf)}</b></div>
            </div>
          </div>
        </Card>

        <Card title="Per-Vessel Client Totals">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Each vessel includes proportional allocations of project-level items (freight, design/eng, rep onsite, startup, chemical storage, rigging),
            plus its share of design contingency, waste, OH&amp;P, and warranty. Sums match project totals.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th style={th}>Vessel</th>
                  <th style={th}>Type</th>
                  <th style={th}>Finish SF</th>
                  <th style={th}>Pre-Cont Base</th>
                  <th style={th}>Design Cont.</th>
                  <th style={th}>Waste</th>
                  <th style={th}>OH&P</th>
                  <th style={th}>Warranty</th>
                  <th style={th}>Client Total</th>
                </tr>
              </thead>
              <tbody>
                {project.perVesselRows.map((r) => (
                  <tr key={r.id}>
                    <td style={tdLeft}>{r.name}</td>
                    <td style={tdLeft}>{r.type}</td>
                    <td style={td}>{fmt(r.finishSf)}</td>
                    <td style={tdMoney}>${fmt(r.preContBase)}</td>
                    <td style={tdMoney}>${fmt(r.designCont)}</td>
                    <td style={tdMoney}>${fmt(r.waste)}</td>
                    <td style={tdMoney}>${fmt(r.ohp)}</td>
                    <td style={tdMoney}>${fmt(r.warranty)}</td>
                    <td style={{ ...tdMoney, fontWeight: 700 }}>${fmt(r.clientTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </GridCols>
        </div>
      )}

      {/* Weights View */}
      {viewMode === "weights" && (
        <>
          <Card title="Vessel Weights & Loads Calculator">
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
              Weight calculations for {constructionType} construction. Water density = {DENSITY_WATER} lb/ft³, Tile = {TILE_PSF} lb/ft²,
              EPS density = {EPS_DENSITY} lb/ft³, Average bather = {AVG_BATHER_LB} lb.
            </p>

            {vesselCalcs.map((c) => {
              const w = c.weights;
              const v = c.vessel;
              return (
                <div key={v.id} style={{ marginBottom: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{v.name} — {v.type}</h3>

                  {/* Interactive Vessel Visualization */}
                  <VesselVisualization
                    vessel={v}
                    constructionType={constructionType}
                    onVesselUpdate={(updates) => updateVessel(v.id, updates)}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
                    {/* Geometry */}
                    <div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Geometry</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-col gap-1">
                        <div>Plan Area: <strong>{fmt(w.planArea_ft2)} ft²</strong></div>
                        <div>Perimeter: <strong>{fmt(w.perimeter_ft)} ft</strong></div>
                        <div>Interior Area: <strong>{fmt(w.interiorArea_ft2)} ft²</strong></div>
                        <div>Floor Exposed: <strong>{fmt(w.floorExposed_ft2)} ft²</strong></div>
                        <div>Walls Exposed: <strong>{fmt(w.wallsExposed_ft2)} ft²</strong></div>
                      </div>
                    </div>

                    {/* Component Weights */}
                    <div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Component Weights</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-col gap-1">
                        <div>Water: <strong>{fmt(w.water_lb)} lb</strong> ({fmt(w.water_psf)} psf)</div>
                        <div>Tile: <strong>{fmt(w.tile_lb)} lb</strong> ({fmt(w.tile_psf)} psf)</div>
                        {constructionType === "Stainless Steel" && (
                          <div>Stainless Skins: <strong>{fmt(w.stainless_lb)} lb</strong></div>
                        )}
                        {constructionType === "EPS" && (
                          <div>EPS Body: <strong>{fmt(w.eps_lb)} lb</strong></div>
                        )}
                        <div>Bathers ({v.bathers}): <strong>{fmt(w.bathers_lb)} lb</strong></div>
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Total Loads</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-col gap-1">
                        {constructionType === "Stainless Steel" ? (
                          <>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              Stainless Total: {fmt(w.stainless_total_lb)} lb
                            </div>
                            <div>Load: <strong>{fmt(w.stainless_psf)} psf</strong></div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              EPS Total: {fmt(w.eps_total_lb)} lb
                            </div>
                            <div>Load: <strong>{fmt(w.eps_psf)} psf</strong></div>
                          </>
                        )}
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                          <div>Net Water Vol: <strong>{fmt(w.netWaterVol_ft3)} ft³</strong></div>
                          <div>Displaced Vol: <strong>{fmt(w.displacedVol_ft3)} ft³</strong></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Benches & Steps Summary */}
                  {(v.hasBench || v.hasSteps) && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <div className="text-xs font-semibold mb-1 dark:text-yellow-200">Features:</div>
                      <div className="text-[11px] text-yellow-900 dark:text-yellow-200">
                        {v.hasBench && <div>Bench: {(v.benchLength_ft * 12).toFixed(0)}" × {(v.benchDepth_ft * 12).toFixed(0)}" × {(v.benchHeight_ft * 12).toFixed(0)}"</div>}
                        {v.hasSteps && <div>Steps: {v.stepsCount} steps, {(v.stepsWidth_ft * 12).toFixed(0)}" wide</div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

          {/* Weight Assumptions */}
          <details>
            <summary style={summary}>Weight Calculation Assumptions (click to expand)</summary>
            <Card>
              <div className="text-sm text-gray-700 dark:text-gray-300 grid gap-3">
                <div>
                  <div className="font-semibold mb-1 dark:text-gray-200">Material Densities & Weights</div>
                  <ul className="m-0 pl-5 flex flex-col gap-1">
                    <li>Water: {DENSITY_WATER} lb/ft³</li>
                    <li>Tile + Setting: {TILE_PSF} lb/ft² (applied to all exposed interior surfaces)</li>
                    <li>Stainless 12ga (304L): {SS12_PSF} lb/ft² (walls, benches, steps)</li>
                    <li>Stainless 10ga (304L): {SS10_PSF} lb/ft² (floor)</li>
                    <li>EPS Type II: {EPS_DENSITY} lb/ft³ (walls, floor, benches, steps)</li>
                    <li>Average Bather: {AVG_BATHER_LB} lb/person</li>
                  </ul>
                </div>
                <div>
                  <div className="font-semibold mb-1 dark:text-gray-200">Calculation Method</div>
                  <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                    <li>Water volume accounts for displacement from benches and steps</li>
                    <li>Interior surface area calculated for all exposed surfaces (floor, walls, benches, steps)</li>
                    <li>EPS walls include corner posts (4 * wall_thickness²)</li>
                    <li>Overlap corrections can be applied for intersecting features</li>
                  </ul>
                </div>
              </div>
            </Card>
          </details>
        </>
      )}
    </div>
  );
}

/* small reusable styles */
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 10 };
const btn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 10, background: "#fff" };
const iconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" };
const dangerBtn: React.CSSProperties = { padding: "4px 10px", borderRadius: 8, border: "1px solid #ef4444", color: "#ef4444", background: "#fff" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "4px 0" };
const rowBig: React.CSSProperties = { ...row, fontSize: 18 };
const th: React.CSSProperties = { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const thLeft: React.CSSProperties = { ...th, textAlign: "left" };
const td: React.CSSProperties = { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
const tdMoney: React.CSSProperties = td;
const tdLeft: React.CSSProperties = { ...td, textAlign: "left" };
const summary: React.CSSProperties = { cursor: "pointer", userSelect: "none", padding: "10px 0", fontWeight: 600 };
const summarySm: React.CSSProperties = { cursor: "pointer", userSelect: "none", padding: "6px 0", fontWeight: 600 };
