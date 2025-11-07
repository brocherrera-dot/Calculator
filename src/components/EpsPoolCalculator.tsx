// src/components/EpsPoolCalculator.tsx
import React, { useMemo, useState } from "react";

/* ----------------------------- helpers ----------------------------- */
const clampN = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/* ------------------------------ types ------------------------------ */
type VesselType = "Cold Plunge" | "Hot Tub";

interface Vessel {
  id: string;
  type: VesselType;
  name: string;
  length_ft: number;
  width_ft: number;
  waterDepth_ft: number;
  benchSf: number;      // extra finish surface for benches/steps
  extraSf: number;      // any other finish surface
  handrails: number;
  refrigerationLine: boolean; // CP only
  jets: number;               // Hot tub complexity hint
  equipmentPackageKey: string;
  collapsed?: boolean;        // UI only
}

interface EquipmentLineItem { label: string; cost: number; }
interface EquipmentPackage {
  key: string;
  label: string;
  appliesTo: VesselType[];
  items: EquipmentLineItem[];
}

/* -------- latest equipment pricing (as requested: keep these) ------- */
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
const Card: React.FC<{ title?: string }> = ({ title, children }) => (
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
    {title ? <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div> : null}
    {children}
  </div>
);
const GridWrap: React.FC = ({ children }) => (
  <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", alignItems: "start" }}>
    {children}
  </div>
);
const Row: React.FC<{ label: string }> = ({ label, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", alignItems: "center", gap: 10, marginBottom: 10 }}>
    <div style={{ fontSize: 12, color: "#4b5563" }}>{label}</div>
    <div>{children}</div>
  </div>
);
const Num: React.FC<{ value: number; onChange: (n: number) => void; step?: number }> = ({ value, onChange, step = 1 }) => (
  <input
    type="number"
    step={step}
    value={Number.isFinite(value) ? value : 0}
    onChange={(e) => onChange(Number(e.target.value))}
    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}
  />
);

/* ------------------------------- main ------------------------------- */
export default function EpsPoolCalculator() {
  /* Scopes */
  const [scopeMaterials, setScopeMaterials] = useState(true);
  const [scopeLabor, setScopeLabor] = useState(true);
  const [scopeEquipment, setScopeEquipment] = useState(true);
  const [scopeFreight, setScopeFreight] = useState(true);
  const [scopeDesignEng, setScopeDesignEng] = useState(true);
  const [scopeDesignCont, setScopeDesignCont] = useState(true);
  const [scopeWarranty, setScopeWarranty] = useState(true);

  /* MATERIALS — per SF & per vessel bundles */
  const [epsBundlePerSf, setEpsBundlePerSf] = useState(6);     // EPS foam + adhesives + mesh + Basecrete/membrane
  const [tileMaterialsPerSf, setTileMaterialsPerSf] = useState(20); // Tile + thinset + grout + sundries
  const [ffeMaterialsPerVessel, setFfeMaterialsPerVessel] = useState(2000); // handrails, markers, DOH safety kit

  /* LABOR — per SF & per vessel */
  const [epsWpLaborPerSf, setEpsWpLaborPerSf] = useState(40);  // EPS assembly + waterproofing labor
  const [tileLaborPerSf, setTileLaborPerSf] = useState(40);    // tile setting labor
  const [ffeLaborPerVessel, setFfeLaborPerVessel] = useState(600); // FF&E install
  const [equipPlumbPerVessel, setEquipPlumbPerVessel] = useState(15000); // interconnect & equipment setting (CP baseline; HT 1.5×)
  const [handrailInstallPerEa, setHandrailInstallPerEa] = useState(0);   // if you want handrail labor apart from FF&E, leave 0 otherwise
  const [refrigLinePerCP, setRefrigLinePerCP] = useState(1800);          // CP only
  const [startupLump, setStartupLump] = useState(3500);                  // project
  const [repOnsiteFee, setRepOnsiteFee] = useState(4000);                // project
  const [includeRigging, setIncludeRigging] = useState(true);
  const [riggingPerVessel, setRiggingPerVessel] = useState(2000);
  const [regionMult, setRegionMult] = useState(1.0);

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
  const [ohpPct, setOhpPct] = useState(12);
  const [wastePct, setWastePct] = useState(7.5);

  /* Equipment packages (editable if you want later) */
  const [packages, setPackages] = useState<EquipmentPackage[]>(DEFAULT_PACKAGES);

  /* Project chemical storage */
  const [useProjectChemicalStorage, setUseProjectChemicalStorage] = useState(true);
  const [projectChemicalStorageCost, setProjectChemicalStorageCost] = useState(1200);

  /* Vessels */
  const mkId = () => Math.random().toString(36).slice(2, 9);
  const [vessels, setVessels] = useState<Vessel[]>([
    { id: mkId(), type: "Cold Plunge", name: "CP-1", length_ft: 10, width_ft: 3, waterDepth_ft: 3.5, benchSf: 0,  extraSf: 0, handrails: 1, refrigerationLine: true,  jets: 0, equipmentPackageKey: "cp-1-2",   collapsed: false },
    { id: mkId(), type: "Hot Tub",     name: "HT-1", length_ft: 17.75, width_ft: 5.58, waterDepth_ft: 3.5, benchSf: 60, extraSf: 0, handrails: 2, refrigerationLine: false, jets: 8, equipmentPackageKey: "ht-standard", collapsed: true },
  ]);

  const addVessel = (t: VesselType) => {
    const n = t === "Cold Plunge" ? `CP-${vessels.filter(v => v.type === "Cold Plunge").length + 1}`
                                  : `HT-${vessels.filter(v => v.type === "Hot Tub").length + 1}`;
    const fallBack = t === "Cold Plunge" ? "cp-1-2" : "ht-standard";
    const pkg = packages.find(p => p.appliesTo.includes(t))?.key ?? fallBack;
    setVessels(v => v.concat({
      id: mkId(), type: t, name: n,
      length_ft: t === "Cold Plunge" ? 10 : 8,
      width_ft : t === "Cold Plunge" ? 3  : 8,
      waterDepth_ft: 3.5,
      benchSf: t === "Hot Tub" ? 40 : 0,
      extraSf: 0,
      handrails: 1,
      refrigerationLine: t === "Cold Plunge",
      jets: t === "Hot Tub" ? 6 : 0,
      equipmentPackageKey: pkg,
      collapsed: true,
    }));
  };
  const removeVessel = (id: string) => setVessels(v => v.filter(x => x.id !== id));
  const updateVessel = (id: string, patch: Partial<Vessel>) =>
    setVessels(v => v.map(x => (x.id === id ? { ...x, ...patch } : x)));

  /* ---------------------- per-vessel calculations ---------------------- */
  const vesselCalcs = useMemo(() => {
    return vessels.map(v => {
      const L = clampN(v.length_ft), W = clampN(v.width_ft), D = clampN(v.waterDepth_ft);
      const floorSf = L * W;
      const wallSf  = 2 * (L + W) * D;
      const benchSf = clampN(v.benchSf);
      const extraSf = clampN(v.extraSf);
      const finishSf = floorSf + wallSf + benchSf + extraSf;

      // MATERIALS:
      const materialsEpsBundle = scopeMaterials ? clampN(epsBundlePerSf) * finishSf : 0;
      const materialsTile      = scopeMaterials ? clampN(tileMaterialsPerSf) * (floorSf + wallSf) : 0;
      const materialsFfe       = scopeMaterials ? clampN(ffeMaterialsPerVessel) : 0;

      // EQUIPMENT:
      const pkg = packages.find(p => p.key === v.equipmentPackageKey && p.appliesTo.includes(v.type));
      const equipmentSubtotal = scopeEquipment && pkg ? pkg.items.reduce((s, it) => s + clampN(it.cost), 0) : 0;

      // LABOR:
      let labor = 0;
      if (scopeLabor) {
        // EPS + waterproofing labor on all finish surfaces
        labor += clampN(epsWpLaborPerSf) * finishSf;
        // Tile install labor on floor + walls
        labor += clampN(tileLaborPerSf) * (floorSf + wallSf);
        // FF&E install per vessel
        labor += clampN(ffeLaborPerVessel);
        // Interconnect & equipment setting — +50% for hot tubs
        const interconnect = (v.type === "Hot Tub")
          ? clampN(equipPlumbPerVessel) * 1.5
          : clampN(equipPlumbPerVessel);
        labor += interconnect;
        // Optional handrail labor if used independently
        labor += clampN(handrailInstallPerEa) * clampN(v.handrails);
        // CP refrigeration line set if selected
        if (v.type === "Cold Plunge" && v.refrigerationLine) labor += clampN(refrigLinePerCP);
        // Simple hot tub jet adder beyond baseline 6
        if (v.type === "Hot Tub" && v.jets > 6) labor += (v.jets - 6) * 100;

        // Region multiplier on labor
        labor *= clampN(regionMult);
      }

      const materialsSubtotal = materialsEpsBundle + materialsTile + materialsFfe;
      const perVesselDirect   = materialsSubtotal + equipmentSubtotal + labor;

      return {
        vessel: v,
        areas: { floorSf, wallSf, benchSf, extraSf, finishSf },
        materials: { materialsEpsBundle, materialsTile, materialsFfe },
        equipmentSubtotal,
        laborSubtotal: labor,
        perVesselDirect,
      };
    });
  }, [
    vessels,
    scopeMaterials, scopeLabor, scopeEquipment,
    epsBundlePerSf, tileMaterialsPerSf, ffeMaterialsPerVessel,
    epsWpLaborPerSf, tileLaborPerSf, ffeLaborPerVessel, equipPlumbPerVessel, handrailInstallPerEa, refrigLinePerCP, regionMult,
    packages
  ]);

  /* ------------------------ project roll-up math ----------------------- */
  const project = useMemo(() => {
    // Direct vessel sums
    const finishSfTotal = vesselCalcs.reduce((s, c) => s + c.areas.finishSf, 0);
    const materialsTotal = vesselCalcs.reduce((s, c) => s + (c.materials.materialsEpsBundle + c.materials.materialsTile + c.materials.materialsFfe), 0);
    const equipmentSubtotalVessels = vesselCalcs.reduce((s, c) => s + c.equipmentSubtotal, 0);
    const laborSubtotal = vesselCalcs.reduce((s, c) => s + c.laborSubtotal, 0);
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

    // Allocate project-level softs proportionally to vessels
    const allocShares = vesselCalcs.map(c => c.perVesselDirect / sumPreAllocBase);
    const perVesselPreContBase = vesselCalcs.map((c, i) =>
      c.perVesselDirect +
      allocShares[i] * (freightTotal + designEngineering + repFee + startup + chemStorage + rigging)
    );

    // Design Development Contingency
    const baseBeforeCont = perVesselPreContBase.reduce((s, n) => s + n, 0);
    const contRate = scopeDesignCont ? clampN(designContPct) / 100 : 0;
    const designContAmount = baseBeforeCont * contRate;
    const perVesselCont = perVesselPreContBase.map(b => (b / (baseBeforeCont || 1)) * designContAmount);

    // Waste & OH&P
    const wasteRate = clampN(wastePct) / 100;
    const ohpRate   = clampN(ohpPct) / 100;
    const perVesselBasePlusCont = perVesselPreContBase.map((b, i) => b + perVesselCont[i]);
    const perVesselWaste = perVesselBasePlusCont.map(b => b * wasteRate);
    const perVesselOhp   = perVesselBasePlusCont.map(b => b * ohpRate);

    // Pre-warranty & client total (warranty as % of client)
    const preWarranty = perVesselBasePlusCont.map((b, i) => b + perVesselWaste[i] + perVesselOhp[i]);
    const wRate = scopeWarranty ? clampN(warrantyPctOfClient) / 100 : 0;
    const perVesselClient = preWarranty.map(n => (wRate < 1 ? n / (1 - wRate) : Infinity));
    const perVesselWarranty = perVesselClient.map(n => (scopeWarranty ? n * wRate : 0));

    // Rollups
    const basePlusContProject = perVesselBasePlusCont.reduce((s, n) => s + n, 0);
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
      preContBase: perVesselPreContBase[i],
      designCont: perVesselCont[i],
      waste: perVesselWaste[i],
      ohp: perVesselOhp[i],
      warranty: perVesselWarranty[i],
      clientTotal: perVesselClient[i],
    }));

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
      hardCostsBase: basePlusContProject,
      wasteAmount, ohpAmount, warrantyReserve,
      clientPrice, profit, grossMarginPct, effectivePerSf,
      // per-vessel
      perVesselRows,
    };
  }, [
    vesselCalcs, vessels.length,
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
      <GridWrap>
        <Card title="Scopes">
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={scopeMaterials} onChange={e=>setScopeMaterials(e.target.checked)} /> Materials</label>
            <label><input type="checkbox" checked={scopeLabor}     onChange={e=>setScopeLabor(e.target.checked)} /> Labor</label>
            <label><input type="checkbox" checked={scopeEquipment} onChange={e=>setScopeEquipment(e.target.checked)} /> Equipment</label>
            <label><input type="checkbox" checked={scopeFreight}   onChange={e=>setScopeFreight(e.target.checked)} /> Freight/Delivery</label>
            <label><input type="checkbox" checked={scopeDesignEng} onChange={e=>setScopeDesignEng(e.target.checked)} /> Design & Engineering</label>
            <label><input type="checkbox" checked={scopeDesignCont} onChange={e=>setScopeDesignCont(e.target.checked)} /> Design Contingency</label>
            <label><input type="checkbox" checked={scopeWarranty}  onChange={e=>setScopeWarranty(e.target.checked)} /> Warranty reserve</label>
          </div>
        </Card>

        <Card title="OH&P, Waste, Warranty & Contingency">
          <Row label="OH&P (%)"><Num value={ohpPct} onChange={setOhpPct} step={0.5} /></Row>
          <Row label="Waste (%)"><Num value={wastePct} onChange={setWastePct} step={0.5} /></Row>
          <Row label="Warranty (% of client)"><Num value={warrantyPctOfClient} onChange={setWarrantyPctOfClient} step={0.1} /></Row>
          <Row label="Design development contingency (%)"><Num value={designContPct} onChange={setDesignContPct} step={0.5} /></Row>
        </Card>
      </GridWrap>

      <GridWrap>
        <Card title="Materials (per-SF / per-vessel)">
          <Row label="EPS Vessel Materials ($/sf)">
            <Num value={epsBundlePerSf} onChange={setEpsBundlePerSf} step={0.25} />
          </Row>
          <Row label="Tile & Setting Materials ($/sf)">
            <Num value={tileMaterialsPerSf} onChange={setTileMaterialsPerSf} step={0.5} />
          </Row>
          <Row label="FF&E Materials ($/vessel)">
            <Num value={ffeMaterialsPerVessel} onChange={setFfeMaterialsPerVessel} step={50} />
          </Row>
        </Card>

        <Card title="Labor (per-SF / per-vessel)">
          <Row label="EPS + Waterproofing Labor ($/sf)">
            <Num value={epsWpLaborPerSf} onChange={setEpsWpLaborPerSf} step={1} />
          </Row>
          <Row label="Tile Install Labor ($/sf)">
            <Num value={tileLaborPerSf} onChange={setTileLaborPerSf} step={1} />
          </Row>
          <Row label="FF&E Labor ($/vessel)">
            <Num value={ffeLaborPerVessel} onChange={setFfeLaborPerVessel} step={50} />
          </Row>
          <Row label="Equip & Interconnect ($/vessel — HT = 1.5×)">
            <Num value={equipPlumbPerVessel} onChange={setEquipPlumbPerVessel} step={250} />
          </Row>
          <Row label="Refrigeration Line (CP only)">
            <Num value={refrigLinePerCP} onChange={setRefrigLinePerCP} step={50} />
          </Row>
          <Row label="Rep Onsite (project)">
            <Num value={repOnsiteFee} onChange={setRepOnsiteFee} step={100} />
          </Row>
          <Row label="Startup / Commissioning (project)">
            <Num value={startupLump} onChange={setStartupLump} step={100} />
          </Row>
          <Row label="Include Rigging?">
            <label><input type="checkbox" checked={includeRigging} onChange={e=>setIncludeRigging(e.target.checked)} /> Yes</label>
          </Row>
          <Row label="Rigging ($/vessel)">
            <Num value={riggingPerVessel} onChange={setRiggingPerVessel} step={100} />
          </Row>
          <Row label="Region multiplier (×)">
            <Num value={regionMult} onChange={setRegionMult} step={0.01} />
          </Row>
        </Card>
      </GridWrap>

      <GridWrap>
        <Card title="Freight / Delivery">
          <Row label="Distance (mi)"><Num value={miles} onChange={setMiles} /></Row>
          <Row label="Rate ($/mi)"><Num value={dollarsPerMile} onChange={setDollarsPerMile} step={0.05} /></Row>
          <Row label="Handling per vessel ($)"><Num value={handlingPerVessel} onChange={setHandlingPerVessel} step={50} /></Row>
        </Card>

        <Card title="Design & Engineering">
          <Row label="Design base ($)"><Num value={designBase} onChange={setDesignBase} step={500} /></Row>
          <Row label="Complexity multiplier (×)"><Num value={designMult} onChange={setDesignMult} step={0.05} /></Row>
        </Card>
      </GridWrap>

      <Card title="Vessels">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => addVessel("Cold Plunge")} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}>+ Cold Plunge</button>
          <button onClick={() => addVessel("Hot Tub")} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}>+ Hot Tub</button>
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
                    style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
                  >
                    {v.collapsed ? "▸" : "▾"}
                  </button>
                  <div style={{ fontWeight: 600 }}>{v.name} — {v.type}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {headerRight}
                  <button onClick={() => removeVessel(v.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #ef4444", color: "#ef4444", background: "#fff" }}>Remove</button>
                </div>
              </div>

              {!v.collapsed && (
                <div style={{ marginTop: 12 }}>
                  <Row label="Name">
                    <input value={v.name} onChange={e => updateVessel(v.id, { name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 10 }} />
                  </Row>
                  <Row label="Inside length (ft)"><Num value={v.length_ft} onChange={n => updateVessel(v.id, { length_ft: n })} step={0.1} /></Row>
                  <Row label="Inside width (ft)"><Num value={v.width_ft} onChange={n => updateVessel(v.id, { width_ft: n })} step={0.1} /></Row>
                  <Row label="Water depth (ft)"><Num value={v.waterDepth_ft} onChange={n => updateVessel(v.id, { waterDepth_ft: n })} step={0.1} /></Row>
                  <Row label="Bench / steps surface (sf)"><Num value={v.benchSf} onChange={n => updateVessel(v.id, { benchSf: n })} /></Row>
                  <Row label="Extra surface (sf)"><Num value={v.extraSf} onChange={n => updateVessel(v.id, { extraSf: n })} /></Row>
                  <Row label="Handrails (ea)"><Num value={v.handrails} onChange={n => updateVessel(v.id, { handrails: n })} /></Row>

                  {v.type === "Cold Plunge" && (
                    <Row label="Refrigeration line set">
                      <label><input type="checkbox" checked={v.refrigerationLine} onChange={e => updateVessel(v.id, { refrigerationLine: e.target.checked })} /> Include</label>
                    </Row>
                  )}
                  {v.type === "Hot Tub" && (
                    <Row label="Jets (install complexity)">
                      <Num value={v.jets} onChange={n => updateVessel(v.id, { jets: n })} />
                    </Row>
                  )}

                  <Row label="Equipment package">
                    <select
                      value={v.equipmentPackageKey}
                      onChange={e => updateVessel(v.id, { equipmentPackageKey: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #d1d5db" }}
                    >
                      {availablePkgs.map(p => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                  </Row>

                  <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                    <div>Areas — Floor: <b>{fmt(c.areas.floorSf)} sf</b>, Walls: <b>{fmt(c.areas.wallSf)} sf</b>, Benches/Steps: <b>{fmt(c.areas.benchSf)} sf</b>, Extra: <b>{fmt(c.areas.extraSf)} sf</b>, Finish total: <b>{fmt(c.areas.finishSf)} sf</b></div>
                    <div>Materials: <b>${fmt(c.materials.materialsEpsBundle + c.materials.materialsTile + c.materials.materialsFfe)}</b> | Equipment: <b>${fmt(c.equipmentSubtotal)}</b> | Labor: <b>${fmt(c.laborSubtotal)}</b></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Summary */}
      <Card title="Project Summary — Hard Costs vs Client">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div>
            <div style={row}><span className="l">Finish Surface Area</span><b>{fmt(project.finishSfTotal)} sf</b></div>
            <div style={row}><span className="l">Materials (vessels)</span><b>${fmt(project.materialsTotal)}</b></div>
            <div style={row}><span className="l">Equipment (vessels)</span><b>${fmt(project.equipmentSubtotalVessels)}</b></div>
            <div style={row}><span className="l">Labor (vessels)</span><b>${fmt(project.laborSubtotal)}</b></div>
          </div>
          <div>
            <div style={row}><span className="l">Freight / Delivery</span><b>${fmt(project.freightTotal)}</b></div>
            <div style={row}><span className="l">Design & Engineering</span><b>${fmt(project.designEngineering)}</b></div>
            <div style={row}><span className="l">Rep Onsite (project)</span><b>${fmt(project.repFee)}</b></div>
            <div style={row}><span className="l">Startup (project)</span><b>${fmt(project.startup)}</b></div>
            <div style={row}><span className="l">Chem Storage (project)</span><b>${fmt(project.chemStorage)}</b></div>
            <div style={row}><span className="l">Rigging</span><b>${fmt(project.rigging)}</b></div>
          </div>
          <div>
            <div style={row}><span className="l">Design Contingency</span><b>${fmt(project.designContAmount)}</b></div>
            <div style={row}><span className="l">Waste</span><b>${fmt(project.wasteAmount)}</b></div>
            <div style={row}><span className="l">OH&P</span><b>${fmt(project.ohpAmount)}</b></div>
            <div style={row}><span className="l">Warranty</span><b>${fmt(project.warrantyReserve)}</b></div>
          </div>
        </div>

        <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: 12 }}>
            <div style={rowBig}><span>Client Price</span><b>${fmt(project.clientPrice)}</b></div>
            <div style={row}><span>Profit (≈ OH&P amount)</span><b>${fmt(project.ohpAmount)}</b></div>
            <div style={row}><span>Gross Margin</span><b>{fmt(project.grossMarginPct)}%</b></div>
            <div style={row}><span>Effective $/sf (client)</span><b>${fmt(project.effectivePerSf)}</b></div>
          </div>
        </div>
      </Card>

      {/* Per-vessel client totals */}
      <Card title="Per-Vessel Client Totals">
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Each vessel includes proportional allocations of project-level items (freight, design/eng, rep onsite, startup, chemical storage, rigging),
          plus its share of design contingency, waste, OH&amp;P, and warranty. Sums match project totals.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
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
    </div>
  );
}

/* small table styles */
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "4px 0" };
const rowBig: React.CSSProperties = { ...row, fontSize: 18 };
const th: React.CSSProperties = { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
const tdMoney: React.CSSProperties = td;
const tdLeft: React.CSSProperties = { ...td, textAlign: "left" };
