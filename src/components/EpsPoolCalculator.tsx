// src/components/EpsPoolCalculator.tsx
import React, { useMemo, useState } from "react";

// ---------- tiny helpers ----------
const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const Card: React.FC<{ title?: string }> = ({ title, children }) => (
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
    {title ? <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div> : null}
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

// ---------- component ----------
export default function EpsPoolCalculator() {
  // Geometry (sf). Replace with your computed areas later.
  const [floorArea, setFloorArea] = useState(250);
  const [wallArea, setWallArea] = useState(420);
  const [benchArea, setBenchArea] = useState(116);
  const totalSurfaceArea = floorArea + wallArea + benchArea;

  // Counts
  const [vesselCount, setVesselCount] = useState(4);
  const [coldPlungeCount, setColdPlungeCount] = useState(3);
  const [hotTubCount, setHotTubCount] = useState(1);
  const effectiveColdPlungeCount = useMemo(
    () => Math.min(coldPlungeCount, vesselCount),
    [coldPlungeCount, vesselCount]
  );

  // Scope toggles
  const [scopeVessels, setScopeVessels] = useState(true);
  const [scopeEquipment, setScopeEquipment] = useState(true);
  const [scopeInstallation, setScopeInstallation] = useState(true);
  const [scopeFreight, setScopeFreight] = useState(true);

  // Presets
  const applyPreset = (p: "Economy" | "Standard" | "Premium" | "Union") => {
    if (p === "Economy") {
      setRegionMult(0.95);
      setBaseRatePerMile(3.5);
      setHandlingPerVessel(800);
      setEquipPlumbPerVessel(12000);
      setEpsWpPerSf(35);
      setTileTurnkey(true);
      setTileTurnkeyPerSf(45);
      setRefrigLinesPerCold(1400);
      setStartupLump(2500);
      setDesignMult(0.9);
      setOverheadPct(8);
    } else if (p === "Standard") {
      setRegionMult(1.0);
      setBaseRatePerMile(4.25);
      setHandlingPerVessel(1000);
      setEquipPlumbPerVessel(15000);
      setEpsWpPerSf(40);
      setTileTurnkey(true);
      setTileTurnkeyPerSf(60);
      setRefrigLinesPerCold(1800);
      setStartupLump(3500);
      setDesignMult(1.0);
      setOverheadPct(10);
    } else if (p === "Premium") {
      setRegionMult(1.15);
      setBaseRatePerMile(5.0);
      setHandlingPerVessel(1250);
      setEquipPlumbPerVessel(18000);
      setEpsWpPerSf(48);
      setTileTurnkey(true);
      setTileTurnkeyPerSf(75);
      setRefrigLinesPerCold(2400);
      setStartupLump(4500);
      setDesignMult(1.2);
      setOverheadPct(12);
    } else if (p === "Union") {
      setRegionMult(1.25);
      setBaseRatePerMile(5.25);
      setHandlingPerVessel(1300);
      setEquipPlumbPerVessel(20000);
      setEpsWpPerSf(55);
      setTileTurnkey(true);
      setTileTurnkeyPerSf(85);
      setRefrigLinesPerCold(2600);
      setStartupLump(5200);
      setDesignMult(1.25);
      setOverheadPct(15);
    }
  };

  // Freight / Delivery
  const [shipMiles, setShipMiles] = useState(1000);
  const [baseRatePerMile, setBaseRatePerMile] = useState(4.25);
  const [handlingPerVessel, setHandlingPerVessel] = useState(1000);
  const [regionMult, setRegionMult] = useState(1.0);

  const freightTotal = useMemo(() => {
    if (!scopeFreight) return 0;
    const base = Math.max(0, shipMiles) * baseRatePerMile;
    const handling = Math.max(0, vesselCount) * Math.max(0, handlingPerVessel);
    return (base + handling) * regionMult;
  }, [scopeFreight, shipMiles, baseRatePerMile, handlingPerVessel, vesselCount, regionMult]);

  // Installation
  const [repOnsiteFee, setRepOnsiteFee] = useState(4000);              // per project
  const [equipPlumbPerVessel, setEquipPlumbPerVessel] = useState(15000); // per vessel
  const [epsWpPerSf, setEpsWpPerSf] = useState(40);                    // $/sf (EPS assembly + waterproofing)
  const [tileTurnkey, setTileTurnkey] = useState(true);
  const [tileTurnkeyPerSf, setTileTurnkeyPerSf] = useState(60);        // $/sf (materials + labor)
  const [handrailsPerVessel, setHandrailsPerVessel] = useState(1200);  // per vessel
  const [refrigLinesPerCold, setRefrigLinesPerCold] = useState(1800);  // per cold plunge
  const [startupLump, setStartupLump] = useState(3500);                // per project

  // Equipment (placeholder lump sum—wire to your equipment BOM if needed)
  const [equipmentLumpSum, setEquipmentLumpSum] = useState(0);

  // Design & Engineering
  const [designBase, setDesignBase] = useState(25000);
  const [designMult, setDesignMult] = useState(1.0);

  // Materials modeling (only used if scopeVessels = true and you want a materials subtotal)
  const [tileMaterialsPerSf, setTileMaterialsPerSf] = useState(12);
  const [membranePerSf, setMembranePerSf] = useState(4);

  // Warranty / Overhead / Waste
  const [warrantyPctOfMaterials, setWarrantyPctOfMaterials] = useState(1.5);
  const [overheadPct, setOverheadPct] = useState(10);
  const [wastePct, setWastePct] = useState(5);

  // ----------- MATERIALS FIRST (so it exists before use) -----------
  // If scopeVessels is ON, this produces a materials subtotal you can use for warranty reserve.
  // (For turnkey tile, we don't double-count here—we keep this as a "materials-only scenario" path.)
  const materialSubtotal = useMemo(() => {
    if (!scopeVessels) return 0;
    const perSf = Math.max(0, tileMaterialsPerSf) + Math.max(0, membranePerSf);
    const materials =
      Math.max(0, floorArea) * perSf +
      Math.max(0, wallArea) * perSf +
      Math.max(0, benchArea) * perSf;
    return materials;
  }, [scopeVessels, tileMaterialsPerSf, membranePerSf, floorArea, wallArea, benchArea]);

  // Warranty reserve (depends on materialSubtotal)
  const warrantyReserve = useMemo(
    () => materialSubtotal * (Math.max(0, warrantyPctOfMaterials) / 100),
    [materialSubtotal, warrantyPctOfMaterials]
  );

  // Installation subtotal
  const installationSubtotal = useMemo(() => {
    if (!scopeInstallation) return 0;
    let total = 0;
    total += Math.max(0, repOnsiteFee); // project-level
    total += Math.max(0, equipPlumbPerVessel) * Math.max(0, vesselCount); // per vessel
    total += Math.max(0, epsWpPerSf) * (Math.max(0, floorArea) + Math.max(0, wallArea) + Math.max(0, benchArea)); // area-based

    // Turnkey tile replaces granular tile materials (it's an install task with materials baked in)
    if (tileTurnkey) {
      total += Math.max(0, tileTurnkeyPerSf) * (Math.max(0, floorArea) + Math.max(0, wallArea)); // benches usually not tiled; adjust if needed
    }

    total += Math.max(0, handrailsPerVessel) * Math.max(0, vesselCount);
    total += Math.max(0, refrigLinesPerCold) * Math.max(0, effectiveColdPlungeCount); // per cold plunge
    total += Math.max(0, startupLump);

    return total * Math.max(0, regionMult);
  }, [
    scopeInstallation,
    repOnsiteFee,
    equipPlumbPerVessel,
    vesselCount,
    epsWpPerSf,
    floorArea,
    wallArea,
    benchArea,
    tileTurnkey,
    tileTurnkeyPerSf,
    handrailsPerVessel,
    effectiveColdPlungeCount,
    startupLump,
    regionMult,
  ]);

  // Equipment subtotal
  const equipmentSubtotal = scopeEquipment ? Math.max(0, equipmentLumpSum) : 0;

  // Design & Engineering
  const designEngineeringTotal = Math.max(0, designBase) * Math.max(0, designMult);

  // Soft costs (non-material scopes): freight + installation + equipment + design + warranty
  const softCostsSubtotal =
    (scopeFreight ? freightTotal : 0) +
    (scopeInstallation ? installationSubtotal : 0) +
    (scopeEquipment ? equipmentSubtotal : 0) +
    designEngineeringTotal +
    warrantyReserve;

  // Overhead on soft costs
  const overheadAmount = softCostsSubtotal * (Math.max(0, overheadPct) / 100);

  // Totals
  const softCostsWithOverhead = softCostsSubtotal + overheadAmount;
  const subtotalPreWaste = materialSubtotal + softCostsWithOverhead;
  const totalWithWaste = subtotalPreWaste * (1 + Math.max(0, wastePct) / 100);
  const effectivePerSf = totalSurfaceArea > 0 ? totalWithWaste / totalSurfaceArea : 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Presets */}
      <Card title="Presets">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["Economy", "Standard", "Premium", "Union"] as const).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              {p}
            </button>
          ))}
        </div>
      </Card>

      {/* Scopes */}
      <Card title="Scopes">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label><input type="checkbox" checked={scopeVessels} onChange={(e) => setScopeVessels(e.target.checked)} /> Vessels (materials)</label>
          <label><input type="checkbox" checked={scopeEquipment} onChange={(e) => setScopeEquipment(e.target.checked)} /> Equipment</label>
          <label><input type="checkbox" checked={scopeInstallation} onChange={(e) => setScopeInstallation(e.target.checked)} /> Installation</label>
          <label><input type="checkbox" checked={scopeFreight} onChange={(e) => setScopeFreight(e.target.checked)} /> Freight/Delivery</label>
        </div>
      </Card>

      {/* Geometry & Counts */}
      <Card title="Geometry & Counts">
        <Row label="Floor area (sf)"><Num value={floorArea} onChange={setFloorArea} /></Row>
        <Row label="Wall area (sf)"><Num value={wallArea} onChange={setWallArea} /></Row>
        <Row label="Bench area (sf)"><Num value={benchArea} onChange={setBenchArea} /></Row>
        <div style={{ margin: "4px 0 12px", fontSize: 12, color: "#6b7280" }}>
          Total finish area: <b>{fmt(totalSurfaceArea)} sf</b>
        </div>
        <Row label="Vessel count"><Num value={vesselCount} onChange={setVesselCount} /></Row>
        <Row label="Cold plunge count"><Num value={coldPlungeCount} onChange={setColdPlungeCount} /></Row>
        <Row label="Hot tub count"><Num value={hotTubCount} onChange={setHotTubCount} /></Row>
        {(coldPlungeCount > vesselCount || hotTubCount > vesselCount) && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", background: "#fee2e2", padding: 8, borderRadius: 8 }}>
            Counts exceed total vessels; refrigeration line sets will cap at {fmt(effectiveColdPlungeCount)}.
          </div>
        )}
      </Card>

      {/* Freight / Handling / Delivery */}
      <Card title="Freight / Handling / Delivery (Combined)">
        <Row label="Distance (mi)"><Num value={shipMiles} onChange={setShipMiles} /></Row>
        <Row label="Base rate ($/mi)"><Num value={baseRatePerMile} onChange={setBaseRatePerMile} step={0.01} /></Row>
        <Row label="Vessel count"><Num value={vesselCount} onChange={setVesselCount} /></Row>
        <Row label="Cold plunge count"><Num value={coldPlungeCount} onChange={setColdPlungeCount} /></Row>
        <Row label="Handling per vessel ($)"><Num value={handlingPerVessel} onChange={setHandlingPerVessel} /></Row>
        <Row label="Region multiplier (×)"><Num value={regionMult} onChange={setRegionMult} step={0.01} /></Row>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Freight Total: <b>${fmt(freightTotal)}</b>{" "}
          <span style={{ color: "#9ca3af" }}>(includes curbside delivery + per-vessel handling)</span>
        </div>
      </Card>

      {/* Installation */}
      <Card title="Installation">
        <Row label="Rep onsite fee (project)"><Num value={repOnsiteFee} onChange={setRepOnsiteFee} /></Row>
        <Row label="Equip & interconnect plumbing ($/vessel)"><Num value={equipPlumbPerVessel} onChange={setEquipPlumbPerVessel} /></Row>
        <Row label="EPS assembly & waterproofing ($/sf)"><Num value={epsWpPerSf} onChange={setEpsWpPerSf} /></Row>
        <Row label="Tile turnkey rate ($/sf)">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Num value={tileTurnkeyPerSf} onChange={setTileTurnkeyPerSf} />
            <label><input type="checkbox" checked={tileTurnkey} onChange={(e) => setTileTurnkey(e.target.checked)} /> Use turnkey</label>
          </div>
        </Row>
        <Row label="Handrails ($/vessel)"><Num value={handrailsPerVessel} onChange={setHandrailsPerVessel} /></Row>
        <Row label="Refrigeration line sets ($/cold plunge)"><Num value={refrigLinesPerCold} onChange={setRefrigLinesPerCold} /></Row>
        <Row label="Startup / commissioning (project)"><Num value={startupLump} onChange={setStartupLump} /></Row>
      </Card>

      {/* Equipment & Design */}
      <Card title="Equipment & Design">
        <Row label="Equipment lump sum"><Num value={equipmentLumpSum} onChange={setEquipmentLumpSum} /></Row>
        <Row label="Design base ($)"><Num value={designBase} onChange={setDesignBase} /></Row>
        <Row label="Design multiplier (×)"><Num value={designMult} onChange={setDesignMult} step={0.05} /></Row>
      </Card>

      {/* Materials (materials-only scenarios) */}
      <Card title="Materials (for materials-only modeling)">
        <Row label="Tile materials ($/sf)"><Num value={tileMaterialsPerSf} onChange={setTileMaterialsPerSf} /></Row>
        <Row label="Membrane / bond layer ($/sf)"><Num value={membranePerSf} onChange={setMembranePerSf} /></Row>
        <Row label="Warranty (% of materials)"><Num value={warrantyPctOfMaterials} onChange={setWarrantyPctOfMaterials} step={0.1} /></Row>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Materials Subtotal (if enabled): <b>${fmt(materialSubtotal)}</b>
        </div>
      </Card>

      {/* Overhead & Waste */}
      <Card title="Overhead & Waste">
        <Row label="Overhead on soft costs (%)"><Num value={overheadPct} onChange={setOverheadPct} step={0.5} /></Row>
        <Row label="Waste (%)"><Num value={wastePct} onChange={setWastePct} step={0.5} /></Row>
      </Card>

      {/* Readout */}
      <Card title="Applied Install Rates (Readout)">
        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Equipment & interconnecting plumbing</span>
            <span>
              <b>${fmt(equipPlumbPerVessel)}</b> / vessel × {fmt(vesselCount)} ={" "}
              <b>${fmt(equipPlumbPerVessel * vesselCount)}</b>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>EPS assembly & waterproofing</span>
            <span>
              <b>${fmt(epsWpPerSf)}</b> / sf × {fmt(floorArea + wallArea + benchArea)} sf ={" "}
              <b>${fmt(epsWpPerSf * (floorArea + wallArea + benchArea))}</b>
            </span>
          </div>
          {tileTurnkey && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4b5563" }}>Tile setting (turnkey)</span>
              <span>
                <b>${fmt(tileTurnkeyPerSf)}</b> / sf × {fmt(floorArea + wallArea)} sf ={" "}
                <b>${fmt(tileTurnkeyPerSf * (floorArea + wallArea))}</b>
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Handrails</span>
            <span>
              <b>${fmt(handrailsPerVessel)}</b> / vessel × {fmt(vesselCount)} ={" "}
              <b>${fmt(handrailsPerVessel * vesselCount)}</b>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Refrigeration line sets</span>
            <span>
              <b>${fmt(refrigLinesPerCold)}</b> / cold plunge × {fmt(effectiveColdPlungeCount)} ={" "}
              <b>${fmt(refrigLinesPerCold * effectiveColdPlungeCount)}</b>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
            <span style={{ color: "#4b5563" }}>Rep onsite fee (project)</span>
            <span><b>${fmt(repOnsiteFee)}</b></span>
          </div>
        </div>
      </Card>

      {/* Scope Summary */}
      <Card title="Scope Summary">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Materials (Vessels)</span><b>${fmt(materialSubtotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Freight/Delivery</span><b>${fmt(freightTotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Equipment</span><b>${fmt(equipmentSubtotal)}</b></div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Installation</span><b>${fmt(installationSubtotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Design & Engineering</span><b>${fmt(designEngineeringTotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Warranty Reserve</span><b>${fmt(warrantyReserve)}</b></div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Overhead on Soft Costs</span><b>${fmt(overheadAmount)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Waste</span><b>{fmt(wastePct)}%</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
              <span style={{ color: "#6b7280" }}>Effective $/sf</span><b>${fmt(effectivePerSf)}</b>
            </div>
          </div>
        </div>
      </Card>

      {/* Totals */}
      <Card title="Totals">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18 }}>
          <span>Grand Total</span>
          <span><b>${fmt(totalWithWaste)}</b></span>
        </div>
      </Card>
    </div>
  );
}
