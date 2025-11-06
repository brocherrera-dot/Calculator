// src/components/EpsPoolCalculator.tsx
import React, { useMemo, useState } from "react";

/** ---------- helpers ---------- */
const clampN = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** ---------- types ---------- */
type VesselType = "Cold Plunge" | "Hot Tub";

interface Vessel {
  id: string;
  type: VesselType;
  name: string;
  length_ft: number; // inside water footprint
  width_ft: number;  // inside water footprint
  waterDepth_ft: number;
  benchSf: number;   // optional bench/step surfaces
  extraSf: number;   // any other surfaces you want to add
  handrails: number; // count
  refrigerationLine: boolean; // cold plunge only
  jets: number;      // hot tub: number of jets (install complexity placeholder)
  equipmentPackageKey: string; // key into equipment packages map
}

interface EquipmentLineItem {
  label: string;
  cost: number; // USD
}

interface EquipmentPackage {
  key: string;
  label: string;
  appliesTo: VesselType[];     // which vessel types it fits
  items: EquipmentLineItem[];  // editable line items
}

/** ---------- defaults ---------- */
const DEFAULT_PACKAGES: EquipmentPackage[] = [
  {
    key: "cp-standard",
    label: "CP Standard (1-2 person)",
    appliesTo: ["Cold Plunge"],
    items: [
      { label: "Chiller 1-1.5HP + controller", cost: 5200 },
      { label: "AOP / UV sanitization", cost: 1800 },
      { label: "Pump & filter (cart)", cost: 1500 },
      { label: "Valves, unions, fittings", cost: 900 },
      { label: "Sensors / controls panel", cost: 1300 },
    ],
  },
  {
    key: "cp-pro",
    label: "CP Pro (3-4 person)",
    appliesTo: ["Cold Plunge"],
    items: [
      { label: "Chiller 2-3HP + controller", cost: 8800 },
      { label: "AOP / UV sanitization", cost: 2200 },
      { label: "Pump & filter (cartridge)", cost: 1800 },
      { label: "Valves, unions, fittings", cost: 1200 },
      { label: "Sensors / controls panel", cost: 1600 },
    ],
  },
  {
    key: "ht-standard",
    label: "Hot Tub Standard (6-8 jets)",
    appliesTo: ["Hot Tub"],
    items: [
      { label: "Gas heater (400k BTU) or equiv", cost: 4200 },
      { label: "Jet pump + air blower", cost: 2800 },
      { label: "Sanitization (AOP/UV)", cost: 2000 },
      { label: "Filter/pump", cost: 1600 },
      { label: "Valves, unions, fittings", cost: 1200 },
      { label: "Sensors / controls panel", cost: 1800 },
    ],
  },
];

/** ---------- tiny UI bits ---------- */
const Card: React.FC<{ title?: string }> = ({ title, children }) => (
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
    {title ? <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div> : null}
    {children}
  </div>
);

const GridWrap: React.FC = ({ children }) => (
  <div
    style={{
      display: "grid",
      gap: 16,
      gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
      alignItems: "start",
    }}
  >
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

/** ---------- main ---------- */
export default function EpsPoolCalculator() {
  /** Project-level scopes (Design/Eng is separate from Equipment, as requested) */
  const [scopeMaterials, setScopeMaterials] = useState(true);
  const [scopeInstallation, setScopeInstallation] = useState(true);
  const [scopeEquipment, setScopeEquipment] = useState(true);
  const [scopeFreight, setScopeFreight] = useState(true);
  const [scopeDesignEng, setScopeDesignEng] = useState(true);
  const [scopeWarranty, setScopeWarranty] = useState(true);

  /** Global rates & knobs */
  // SIMPLIFIED: one combined materials rate for tile + membrane + bond ($/sf)
  const [materialsPerSf, setMaterialsPerSf] = useState(16); // e.g., tile+thinset+grout+membrane

  // Installation
  const [repOnsiteFee, setRepOnsiteFee] = useState(4000);           // per project
  const [epsWpPerSf, setEpsWpPerSf] = useState(40);                 // $/sf EPS assembly + waterproofing
  const [tileTurnkeyPerSf, setTileTurnkeyPerSf] = useState(60);     // $/sf (floor+walls) installed, turnkey
  const [useTileTurnkey, setUseTileTurnkey] = useState(true);
  const [equipPlumbPerVessel, setEquipPlumbPerVessel] = useState(15000); // $/vessel (MEP tie-ins)
  const [handrailInstallPerEa, setHandrailInstallPerEa] = useState(400); // per handrail
  const [refrigLinePerCP, setRefrigLinePerCP] = useState(1800);          // cold plunge only
  const [startupLump, setStartupLump] = useState(3500);                  // per project
  const [regionMult, setRegionMult] = useState(1.0);                     // adjusts install & freight

  // Freight
  const [miles, setMiles] = useState(1000);
  const [dollarsPerMile, setDollarsPerMile] = useState(4.25);
  const [handlingPerVessel, setHandlingPerVessel] = useState(1000);

  // Design & Engineering (separate scope)
  const [designBase, setDesignBase] = useState(25000);
  const [designMult, setDesignMult] = useState(1.0);

  // Warranty (on materials subtotal only)
  const [warrantyPctOfMaterials, setWarrantyPctOfMaterials] = useState(1.5);

  // OH&P and Waste
  const [ohpPct, setOhpPct] = useState(10); // applied to full hard-cost base (your markup)
  const [wastePct, setWastePct] = useState(5);

  /** Equipment packages (editable) */
  const [packages, setPackages] = useState<EquipmentPackage[]>(DEFAULT_PACKAGES);

  /** Vessels list */
  const mkId = () => Math.random().toString(36).slice(2, 9);
  const [vessels, setVessels] = useState<Vessel[]>([
    { id: mkId(), type: "Cold Plunge", name: "CP-1", length_ft: 10, width_ft: 3, waterDepth_ft: 3.5, benchSf: 0,  extraSf: 0, handrails: 1, refrigerationLine: true,  jets: 0, equipmentPackageKey: "cp-standard" },
    { id: mkId(), type: "Hot Tub",     name: "HT-1", length_ft: 17.75, width_ft: 5.58, waterDepth_ft: 3.5, benchSf: 60, extraSf: 0, handrails: 2, refrigerationLine: false, jets: 8, equipmentPackageKey: "ht-standard" },
  ]);

  const addVessel = (t: VesselType) => {
    const n = t === "Cold Plunge" ? `CP-${vessels.filter(v => v.type === "Cold Plunge").length + 1}`
                                  : `HT-${vessels.filter(v => v.type === "Hot Tub").length + 1}`;
    const pkg = packages.find(p => p.appliesTo.includes(t))?.key ?? (t === "Cold Plunge" ? "cp-standard" : "ht-standard");
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
    }));
  };
  const removeVessel = (id: string) => setVessels(v => v.filter(x => x.id !== id));
  const updateVessel = (id: string, patch: Partial<Vessel>) =>
    setVessels(v => v.map(x => (x.id === id ? { ...x, ...patch } : x)));

  /** ---- per-vessel derivations & costs ---- */
  const vesselCalcs = useMemo(() => {
    return vessels.map(v => {
      const L = clampN(v.length_ft), W = clampN(v.width_ft), D = clampN(v.waterDepth_ft);
      const floorSf = L * W;
      const wallSf  = 2 * (L + W) * D;
      const benchSf = clampN(v.benchSf);
      const extraSf = clampN(v.extraSf);
      const finishSf = floorSf + wallSf + benchSf + extraSf;

      // Materials (single combined $/sf)
      const materialsSubtotal = scopeMaterials ? clampN(materialsPerSf) * finishSf : 0;

      // Equipment package
      const pkg = packages.find(p => p.key === v.equipmentPackageKey && p.appliesTo.includes(v.type));
      const equipmentSubtotal = scopeEquipment && pkg ? pkg.items.reduce((s, it) => s + clampN(it.cost), 0) : 0;

      // Installation
      let install = 0;
      if (scopeInstallation) {
        install += clampN(epsWpPerSf) * finishSf; // EPS assembly + waterproofing (all finish area)

        // Tile turnkey (floor + walls only)
        if (useTileTurnkey) {
          install += clampN(tileTurnkeyPerSf) * (floorSf + wallSf);
        }

        // Equipment & interconnecting plumbing (per vessel)
        install += clampN(equipPlumbPerVessel);

        // Handrails per EA
        install += clampN(handrailInstallPerEa) * clampN(v.handrails);

        // Refrigeration line set (CP only)
        if (v.type === "Cold Plunge" && v.refrigerationLine) {
          install += clampN(refrigLinePerCP);
        }

        // Jet complexity placeholder (hot tub): +$100 per jet beyond 6
        if (v.type === "Hot Tub" && v.jets > 6) {
          install += (v.jets - 6) * 100;
        }

        install *= clampN(regionMult);
      }

      return {
        vessel: v,
        areas: { floorSf, wallSf, benchSf, extraSf, finishSf },
        materialsSubtotal,
        equipmentSubtotal,
        installSubtotal: install,
      };
    });
  }, [
    vessels, scopeMaterials, scopeEquipment, scopeInstallation,
    materialsPerSf,
    epsWpPerSf, useTileTurnkey, tileTurnkeyPerSf,
    equipPlumbPerVessel, handrailInstallPerEa, refrigLinePerCP, regionMult,
    packages,
  ]);

  /** ---- project totals ---- */
  const project = useMemo(() => {
    const finishSfTotal = vesselCalcs.reduce((s, c) => s + c.areas.finishSf, 0);

    const materialsSubtotal = vesselCalcs.reduce((s, c) => s + c.materialsSubtotal, 0);

    const equipmentSubtotal = vesselCalcs.reduce((s, c) => s + c.equipmentSubtotal, 0);

    const installSubtotal   = vesselCalcs.reduce((s, c) => s + c.installSubtotal, 0);

    const freightTotal = scopeFreight
      ? (clampN(miles) * clampN(dollarsPerMile) + vessels.length * clampN(handlingPerVessel)) * clampN(regionMult)
      : 0;

    const designEngineering = scopeDesignEng ? clampN(designBase) * clampN(designMult) : 0;

    const warrantyReserve = scopeWarranty ? materialsSubtotal * (clampN(warrantyPctOfMaterials) / 100) : 0;

    // HARD COSTS (your cost basis before OH&P & Waste)
    const hardCostsBase =
      materialsSubtotal +
      equipmentSubtotal +
      installSubtotal +
      freightTotal +
      designEngineering +
      warrantyReserve +
      (scopeInstallation ? clampN(repOnsiteFee) * 1 : 0); // project-level rep fee

    // Waste applied to hard costs base
    const wasteAmount = hardCostsBase * (clampN(wastePct) / 100);

    // OHP (your markup) applied to hard costs base
    const ohpAmount = hardCostsBase * (clampN(ohpPct) / 100);

    // Client price
    const clientPrice = hardCostsBase + wasteAmount + ohpAmount;

    // Profit proxy = OHP amount (since OHP includes your profit & overhead)
    const profit = ohpAmount;
    const grossMarginPct = clientPrice > 0 ? (profit / clientPrice) * 100 : 0;

    // Effective $/sf (based on client price)
    const effectivePerSf = finishSfTotal > 0 ? clientPrice / finishSfTotal : 0;

    return {
      finishSfTotal,
      materialsSubtotal,
      equipmentSubtotal,
      installSubtotal,
      freightTotal,
      designEngineering,
      warrantyReserve,
      repOnsiteFee,
      hardCostsBase,
      wasteAmount,
      ohpAmount,
      clientPrice,
      profit,
      grossMarginPct,
      effectivePerSf,
    };
  }, [
    vesselCalcs,
    scopeFreight, miles, dollarsPerMile, handlingPerVessel, regionMult,
    scopeDesignEng, designBase, designMult,
    scopeWarranty, warrantyPctOfMaterials,
    repOnsiteFee, wastePct, ohpPct, vessels.length,
  ]);

  /** ---- Presets (affect rates only) ---- */
  const applyPreset = (p: "Economy" | "Standard" | "Premium" | "Union") => {
    if (p === "Economy") {
      setRegionMult(0.95);
      setDollarsPerMile(3.5);
      setHandlingPerVessel(800);
      setEquipPlumbPerVessel(12000);
      setEpsWpPerSf(35);
      setUseTileTurnkey(true);
      setTileTurnkeyPerSf(45);
      setRefrigLinePerCP(1400);
      setStartupLump(2500);
      setDesignMult(0.9);
      setOhpPct(8);
    } else if (p === "Standard") {
      setRegionMult(1.0);
      setDollarsPerMile(4.25);
      setHandlingPerVessel(1000);
      setEquipPlumbPerVessel(15000);
      setEpsWpPerSf(40);
      setUseTileTurnkey(true);
      setTileTurnkeyPerSf(60);
      setRefrigLinePerCP(1800);
      setStartupLump(3500);
      setDesignMult(1.0);
      setOhpPct(10);
    } else if (p === "Premium") {
      setRegionMult(1.15);
      setDollarsPerMile(5.0);
      setHandlingPerVessel(1250);
      setEquipPlumbPerVessel(18000);
      setEpsWpPerSf(48);
      setUseTileTurnkey(true);
      setTileTurnkeyPerSf(75);
      setRefrigLinePerCP(2400);
      setStartupLump(4500);
      setDesignMult(1.2);
      setOhpPct(12);
    } else {
      setRegionMult(1.25);
      setDollarsPerMile(5.25);
      setHandlingPerVessel(1300);
      setEquipPlumbPerVessel(20000);
      setEpsWpPerSf(55);
      setUseTileTurnkey(true);
      setTileTurnkeyPerSf(85);
      setRefrigLinePerCP(2600);
      setStartupLump(5200);
      setDesignMult(1.25);
      setOhpPct(15);
    }
  };

  /** ---------- UI ---------- */
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Top controls in columns */}
      <GridWrap>
        <Card title="Presets & Scopes">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {(["Economy", "Standard", "Premium", "Union"] as const).map((p) => (
              <button key={p} onClick={() => applyPreset(p)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                {p}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={scopeMaterials}   onChange={e=>setScopeMaterials(e.target.checked)} /> Materials</label>
            <label><input type="checkbox" checked={scopeInstallation} onChange={e=>setScopeInstallation(e.target.checked)} /> Installation</label>
            <label><input type="checkbox" checked={scopeEquipment}    onChange={e=>setScopeEquipment(e.target.checked)} /> Equipment</label>
            <label><input type="checkbox" checked={scopeFreight}      onChange={e=>setScopeFreight(e.target.checked)} /> Freight/Delivery</label>
            <label><input type="checkbox" checked={scopeDesignEng}    onChange={e=>setScopeDesignEng(e.target.checked)} /> Design & Engineering</label>
            <label><input type="checkbox" checked={scopeWarranty}     onChange={e=>setScopeWarranty(e.target.checked)} /> Warranty reserve</label>
          </div>
        </Card>

        <Card title="OH&P + Waste (affect Client Price)">
          <Row label="OH&P (%)"><Num value={ohpPct} onChange={setOhpPct} step={0.5} /></Row>
          <Row label="Waste (%)"><Num value={wastePct} onChange={setWastePct} step={0.5} /></Row>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            OHP is treated as your markup on the full hard-cost base. Waste is applied to the same base.
          </div>
        </Card>
      </GridWrap>

      {/* Vessels panel and global rates side-by-side */}
      <GridWrap>
        {/* Vessels */}
        <Card title="Vessels">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => addVessel("Cold Plunge")} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}>+ Cold Plunge</button>
            <button onClick={() => addVessel("Hot Tub")} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}>+ Hot Tub</button>
          </div>

          {vessels.map((v) => {
            const calc = vesselCalcs.find(c => c.vessel.id === v.id)!;
            const availablePkgs = packages.filter(p => p.appliesTo.includes(v.type));
            return (
              <div key={v.id} style={{ border: "1px dashed #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{v.name} — {v.type}</div>
                  <button onClick={() => removeVessel(v.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #ef4444", color: "#ef4444", background: "#fff" }}>Remove</button>
                </div>

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

                {/* Readout */}
                <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                  <div>Areas — Floor: <b>{fmt(calc.areas.floorSf)} sf</b>, Walls: <b>{fmt(calc.areas.wallSf)} sf</b>, Benches/Steps: <b>{fmt(calc.areas.benchSf)} sf</b>, Extra: <b>{fmt(calc.areas.extraSf)} sf</b>, Finish total: <b>{fmt(calc.areas.finishSf)} sf</b></div>
                  <div>Materials: <b>${fmt(calc.materialsSubtotal)}</b> | Equipment: <b>${fmt(calc.equipmentSubtotal)}</b> | Install: <b>${fmt(calc.installSubtotal)}</b></div>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Global Rates & Freight/Design */}
        <Card title="Global Rates & Assumptions">
          {/* Materials simplified to single line item */}
          <Row label="Materials (tile+membrane) $/sf"><Num value={materialsPerSf} onChange={setMaterialsPerSf} /></Row>

          <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

          <Row label="EPS assembly & waterproofing ($/sf)"><Num value={epsWpPerSf} onChange={setEpsWpPerSf} /></Row>
          <Row label="Tile turnkey rate ($/sf)">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Num value={tileTurnkeyPerSf} onChange={setTileTurnkeyPerSf} />
              <label><input type="checkbox" checked={useTileTurnkey} onChange={e => setUseTileTurnkey(e.target.checked)} /> Use turnkey</label>
            </div>
          </Row>
          <Row label="Equip & interconnect plumbing ($/vessel)"><Num value={equipPlumbPerVessel} onChange={setEquipPlumbPerVessel} /></Row>
          <Row label="Handrail install ($/ea)"><Num value={handrailInstallPerEa} onChange={setHandrailInstallPerEa} /></Row>
          <Row label="Refrigeration line set ($/CP)"><Num value={refrigLinePerCP} onChange={setRefrigLinePerCP} /></Row>
          <Row label="Startup / commissioning (project)"><Num value={startupLump} onChange={setStartupLump} /></Row>
          <Row label="Region multiplier (×)"><Num value={regionMult} onChange={setRegionMult} step={0.01} /></Row>

          <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

          <Row label="Freight: distance (mi)"><Num value={miles} onChange={setMiles} /></Row>
          <Row label="Freight: base rate ($/mi)"><Num value={dollarsPerMile} onChange={setDollarsPerMile} step={0.01} /></Row>
          <Row label="Freight: handling per vessel ($)"><Num value={handlingPerVessel} onChange={setHandlingPerVessel} /></Row>

          <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

          <Row label="Design base ($)"><Num value={designBase} onChange={setDesignBase} /></Row>
          <Row label="Design multiplier (×)"><Num value={designMult} onChange={setDesignMult} step={0.05} /></Row>

          <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

          <Row label="Warranty (% of materials)"><Num value={warrantyPctOfMaterials} onChange={setWarrantyPctOfMaterials} step={0.1} /></Row>
          <Row label="Rep onsite fee (project)"><Num value={repOnsiteFee} onChange={setRepOnsiteFee} /></Row>
        </Card>
      </GridWrap>

      {/* Equipment Packages editor spans full width */}
      <Card title="Equipment Packages (editable)">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
          {packages.map((p, i) => (
            <div key={p.key} style={{ border: "1px dashed #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px", gap: 10, marginBottom: 8 }}>
                <div><b>{p.label}</b> <span style={{ color: "#6b7280" }}>({p.appliesTo.join(" / ")})</span></div>
                <div>Key: <code>{p.key}</code></div>
                <div style={{ textAlign: "right" }}>
                  Total: <b>${fmt(p.items.reduce((s, it) => s + clampN(it.cost), 0))}</b>
                </div>
              </div>
              {p.items.map((it, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10, marginBottom: 6 }}>
                  <input
                    value={it.label}
                    onChange={e => {
                      const next = [...packages];
                      next[i] = { ...next[i], items: next[i].items.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x)) };
                      setPackages(next);
                    }}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}
                  />
                  <Num
                    value={it.cost}
                    onChange={(n) => {
                      const next = [...packages];
                      next[i] = { ...next[i], items: next[i].items.map((x, j) => (j === idx ? { ...x, cost: n } : x)) };
                      setPackages(next);
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      {/* PROJECT SUMMARY — Hard Costs vs Client Cost */}
      <Card title="Project Summary (Hard Costs vs Client Price)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Finish Surface Area</span><b>{fmt(project.finishSfTotal)} sf</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Materials (Vessels)</span><b>${fmt(project.materialsSubtotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Equipment</span><b>${fmt(project.equipmentSubtotal)}</b></div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Installation</span><b>${fmt(project.installSubtotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Freight/Delivery</span><b>${fmt(project.freightTotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Design & Engineering</span><b>${fmt(project.designEngineering)}</b></div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Warranty Reserve</span><b>${fmt(project.warrantyReserve)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Rep Onsite (project)</span><b>${fmt(project.repOnsiteFee)}</b></div>
          </div>
        </div>

        <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>HARD COSTS (base)</span><b>${fmt(project.hardCostsBase)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Waste ({fmt(wastePct)}%)</span><b>${fmt(project.wasteAmount)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>OH&P ({fmt(ohpPct)}%)</span><b>${fmt(project.ohpAmount)}</b></div>
          </div>
          <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18 }}>
              <span>Client Price</span><b>${fmt(project.clientPrice)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span>Profit (≈ OH&P amount)</span><b>${fmt(project.profit)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Gross Margin</span><b>{fmt(project.grossMarginPct)}%</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span>Effective $/sf (client)</span><b>${fmt(project.effectivePerSf)}</b>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
