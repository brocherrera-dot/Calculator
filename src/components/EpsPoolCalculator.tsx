import React, { useMemo, useState } from "react";

type NumSetter = (n: number) => void;
const Row: React.FC<{ label: string; right?: React.ReactNode; children?: React.ReactNode }> = ({ label, right, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
      <div style={{ fontSize: 12, color: "#4b5563" }}>{label}</div>
      {right}
    </div>
    {children}
  </div>
);
const Card: React.FC<{ title?: string }> = ({ title, children }) => (
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
    {title ? <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div> : null}
    {children}
  </div>
);
const Num = ({ value, onChange, step = 1 }: { value: number; onChange: NumSetter; step?: number }) => (
  <input
    type="number"
    step={step}
    value={Number.isFinite(value) ? value : 0}
    onChange={(e) => onChange(Number(e.target.value))}
    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}
  />
);
const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function EpsPoolCalculator() {
  // ===== Project geometry (very simple demo fields; hook up to your real geometry) =====
  const [floorArea, setFloorArea] = useState(250);        // sf
  const [wallArea, setWallArea] = useState(420);          // sf
  const [benchSurfaceArea, setBenchSurfaceArea] = useState(116); // sf
  const totalSurfaceArea = floorArea + wallArea + benchSurfaceArea;

  // ===== Counts =====
  const [vesselCount, setVesselCount] = useState(4);
  const [coldPlungeCount, setColdPlungeCount] = useState(3);
  const [hotTubCount, setHotTubCount] = useState(1);
  const effectiveColdPlungeCount = useMemo(
    () => Math.min(coldPlungeCount, vesselCount),
    [coldPlungeCount, vesselCount]
  );

  // ===== Scope toggles =====
  const [scopeVessels, setScopeVessels] = useState(true);        // materials for vessels (tile, base materials) — keep for “materials-only” jobs
  const [scopeEquipment, setScopeEquipment] = useState(true);
  const [scopeInstallation, setScopeInstallation] = useState(true);
  const [scopeFreight, setScopeFreight] = useState(true);

  // ===== Presets =====
  const applyPreset = (p: "Economy" | "Standard" | "Premium" | "Union") => {
    if (p === "Economy") {
      setRegionMultiplier(0.95);
      setBaseRatePerMile(3.5);
      setHandlingPerVessel(800);
      setAvgEquipPlumbing(12000);
      setEpsWpRatePerSf(35);
      setTileTurnkey(true);
      setTileTurnkeyRate(45);
      setAvgRefrigLines(1400);
      setStartupLumpSum(2500);
      setDesignMultiplier(0.9);
      setOverheadPct(8);
    } else if (p === "Standard") {
      setRegionMultiplier(1.0);
      setBaseRatePerMile(4.25);
      setHandlingPerVessel(1000);
      setAvgEquipPlumbing(15000);
      setEpsWpRatePerSf(40);
      setTileTurnkey(true);
      setTileTurnkeyRate(60);
      setAvgRefrigLines(1800);
      setStartupLumpSum(3500);
      setDesignMultiplier(1.0);
      setOverheadPct(10);
    } else if (p === "Premium") {
      setRegionMultiplier(1.15);
      setBaseRatePerMile(5.0);
      setHandlingPerVessel(1250);
      setAvgEquipPlumbing(18000);
      setEpsWpRatePerSf(48);
      setTileTurnkey(true);
      setTileTurnkeyRate(75);
      setAvgRefrigLines(2400);
      setStartupLumpSum(4500);
      setDesignMultiplier(1.2);
      setOverheadPct(12);
    } else if (p === "Union") {
      setRegionMultiplier(1.25);
      setBaseRatePerMile(5.25);
      setHandlingPerVessel(1300);
      setAvgEquipPlumbing(20000);
      setEpsWpRatePerSf(55);
      setTileTurnkey(true);
      setTileTurnkeyRate(85);
      setAvgRefrigLines(2600);
      setStartupLumpSum(5200);
      setDesignMultiplier(1.25);
      setOverheadPct(15);
    }
  };

  // ===== Freight / delivery =====
  const [shipDistanceMi, setShipDistanceMi] = useState(1000);
  const [baseRatePerMile, setBaseRatePerMile] = useState(4.25);
  const [handlingPerVessel, setHandlingPerVessel] = useState(1000);
  const [regionMultiplier, setRegionMultiplier] = useState(1.0);

  const freightTotal = useMemo(() => {
    if (!scopeFreight) return 0;
    const miles = Math.max(0, shipDistanceMi);
    const base = miles * baseRatePerMile;
    const handling = vesselCount * handlingPerVessel;
    return (base + handling) * regionMultiplier;
  }, [scopeFreight, shipDistanceMi, baseRatePerMile, vesselCount, handlingPerVessel, regionMultiplier]);

  // ===== Installation sub-scopes =====
  const [repOnsiteFee, setRepOnsiteFee] = useState(4000);
  const [avgEquipPlumbing, setAvgEquipPlumbing] = useState(15000); // per vessel
  const [epsWpRatePerSf, setEpsWpRatePerSf] = useState(40);        // $/sf
  const [tileTurnkey, setTileTurnkey] = useState(true);
  const [tileTurnkeyRate, setTileTurnkeyRate] = useState(60);      // $/sf incl materials
  const [avgHandrails, setAvgHandrails] = useState(1200);          // per vessel
  const [avgRefrigLines, setAvgRefrigLines] = useState(1800);      // per cold plunge
  const [startupLumpSum, setStartupLumpSum] = useState(3500);      // per project

  // ===== Design / Engineering =====
  const [designBase, setDesignBase] = useState(25000);
  const [designMultiplier, setDesignMultiplier] = useState(1.0);

  // ===== Warranty =====
  const [warrantyPctOfMaterials, setWarrantyPctOfMaterials] = useState(1.5);

  // ===== Materials (kept simple; use only for “materials-only” scope) =====
  // These are placeholders so the calculator can produce a materials subtotal if scopeVessels = true.
  const [tileMaterialsPerSf, setTileMaterialsPerSf] = useState(12); // if doing materials-only modeling
  const [membranePerSf, setMembranePerSf] = useState(4);            // primer/bond layer etc.

  // ===== Overhead & waste =====
  const [overheadPct, setOverheadPct] = useState(10);
  const [wastePct, setWastePct] = useState(5);

  // ===== Subtotals =====
  // Materials subtotal (used only if scopeVessels = true and turnkey install is not replacing them)
  const floorTotal = scopeVessels ? floorArea * (tileMaterialsPerSf + membranePerSf) : 0;
  const wallTotal = scopeVessels ? wallArea * (tileMaterialsPerSf + membranePerSf) : 0;
  const benchTotal = scopeVessels ? benchSurfaceArea * (tileMaterialsPerSf + membranePerSf) : 0;
  const materialSubtotal = scopeVessels ? (floorTotal + wallTotal + benchTotal) : 0;

  // Installation subtotal
  const installationSubscopes = useMemo(() => {
    if (!scopeInstallation) return 0;
    let total = 0;
    total += repOnsiteFee; // project-level
    total += avgEquipPlumbing * vesselCount; // per vessel
    total += epsWpRatePerSf * (floorArea + wallArea + benchSurfaceArea); // area-based
    // Tile turnkey replaces granular materials when used
    total += tileTurnkey ? tileTurnkeyRate * (floorArea + wallArea) : 0; // benches typically not tiled; adjust if needed
    total += avgHandrails * vesselCount;
    total += avgRefrigLines * effectiveColdPlungeCount; // per cold plunge
    total += startupLumpSum;
    return total * regionMultiplier;
  }, [
    scopeInstallation, repOnsiteFee, avgEquipPlumbing, vesselCount, epsWpRatePerSf,
    floorArea, wallArea, benchSurfaceArea, tileTurnkey, tileTurnkeyRate, avgHandrails,
    effectiveColdPlungeCount, startupLumpSum, regionMultiplier
  ]);

  // Equipment subtotal (placeholder input to keep parity; you can wire your equipment BOM here)
  const [equipmentLumpSum, setEquipmentLumpSum] = useState(0);
  const equipmentSubtotal = scopeEquipment ? equipmentLumpSum : 0;

  // Design & engineering
  const designEngineeringTotal = designBase * designMultiplier;

  // Warranty reserve on materials
  const warrantyReserve = materialSubtotal * (warrantyPctOfMaterials / 100);

  // Soft costs subtotal (non-material scopes)
  const softCostsSubtotal =
    (scopeFreight ? freightTotal : 0) +
    (scopeInstallation ? installationSubscopes : 0) +
    (scopeEquipment ? equipmentSubtotal : 0) +
    designEngineeringTotal +
    warrantyReserve;

  // Overhead on soft costs
  const overheadAmount = softCostsSubtotal * (overheadPct / 100);

  // Totals
  const softCostsWithOverhead = softCostsSubtotal + overheadAmount;
  const subtotalPreWaste = materialSubtotal + softCostsWithOverhead;
  const totalWithWaste = subtotalPreWaste * (1 + wastePct / 100);
  const effectivePerSf = totalSurfaceArea > 0 ? totalWithWaste / totalSurfaceArea : 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Presets */}
      <Card title="Presets">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Economy", "Standard", "Premium", "Union"].map((p) => (
            <button key={p} onClick={() => applyPreset(p as any)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
              {p}
            </button>
          ))}
        </div>
      </Card>

      {/* Scopes */}
      <Card title="Scopes">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label><input type="checkbox" checked={scopeVessels} onChange={(e)=>setScopeVessels(e.target.checked)} /> Vessels (materials)</label>
          <label><input type="checkbox" checked={scopeEquipment} onChange={(e)=>setScopeEquipment(e.target.checked)} /> Equipment</label>
          <label><input type="checkbox" checked={scopeInstallation} onChange={(e)=>setScopeInstallation(e.target.checked)} /> Installation</label>
          <label><input type="checkbox" checked={scopeFreight} onChange={(e)=>setScopeFreight(e.target.checked)} /> Freight/Delivery</label>
        </div>
      </Card>

      {/* Geometry & Counts */}
      <Card title="Geometry & Counts">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <Row label="Floor area (sf)"><Num value={floorArea} onChange={setFloorArea} /></Row>
          <Row label="Wall area (sf)"><Num value={wallArea} onChange={setWallArea} /></Row>
          <Row label="Bench surface area (sf)"><Num value={benchSurfaceArea} onChange={setBenchSurfaceArea} /></Row>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>Total finish area: <b>{fmt(totalSurfaceArea)} sf</b></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
          <Row label="Vessel count"><Num value={vesselCount} onChange={setVesselCount} /></Row>
          <Row label="Cold plunge count"><Num value={coldPlungeCount} onChange={setColdPlungeCount} /></Row>
          <Row label="Hot tub count"><Num value={hotTubCount} onChange={setHotTubCount} /></Row>
        </div>
        {(coldPlungeCount > vesselCount || hotTubCount > vesselCount) && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", background: "#fee2e2", padding: 8, borderRadius: 8 }}>
            Counts exceed total vessels; refrigeration line sets will cap at {fmt(effectiveColdPlungeCount)}.
          </div>
        )}
      </Card>

      {/* Freight */}
      <Card title="Freight / Handling / Delivery (Combined)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
          <Row label="Distance (mi)"><Num value={shipDistanceMi} onChange={setShipDistanceMi} /></Row>
          <Row label="Base rate ($/mi)"><Num value={baseRatePerMile} onChange={setBaseRatePerMile} step={0.01} /></Row>
          <Row label="Vessel count"><Num value={vesselCount} onChange={setVesselCount} /></Row>
          <Row label="Cold plunge count"><Num value={coldPlungeCount} onChange={setColdPlungeCount} /></Row>
          <Row label="Handling per vessel ($)"><Num value={handlingPerVessel} onChange={setHandlingPerVessel} /></Row>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Freight Total: <b>${fmt(freightTotal)}</b> <span style={{ color: "#9ca3af" }}>(includes curbside delivery + per-vessel handling)</span>
        </div>
      </Card>

      {/* Installation */}
      <Card title="Installation">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <Row label="Rep onsite fee (project)"><Num value={repOnsiteFee} onChange={setRepOnsiteFee} /></Row>
          <Row label="Equip & interconnect plumbing ($/vessel)"><Num value={avgEquipPlumbing} onChange={setAvgEquipPlumbing} /></Row>
          <Row label="EPS assembly & waterproofing ($/sf)"><Num value={epsWpRatePerSf} onChange={setEpsWpRatePerSf} /></Row>
          <Row label="Tile turnkey rate ($/sf)">
            <div style={{ display: "flex", gap: 8 }}>
              <Num value={tileTurnkeyRate} onChange={setTileTurnkeyRate} />
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={tileTurnkey} onChange={(e)=>setTileTurnkey(e.target.checked)} /> Use turnkey
              </label>
            </div>
          </Row>
          <Row label="Handrails ($/vessel)"><Num value={avgHandrails} onChange={setAvgHandrails} /></Row>
          <Row label="Refrigeration line sets ($/cold plunge)"><Num value={avgRefrigLines} onChange={setAvgRefrigLines} /></Row>
          <Row label="Startup / commissioning (project)"><Num value={startupLumpSum} onChange={setStartupLumpSum} /></Row>
          <Row label="Region multiplier (×)"><Num value={regionMultiplier} onChange={setRegionMultiplier} step={0.01} /></Row>
        </div>
      </Card>

      {/* Equipment & Design */}
      <Card title="Equipment & Design">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <Row label="Equipment lump sum (if any)"><Num value={equipmentLumpSum} onChange={setEquipmentLumpSum} /></Row>
          <Row label="Design base ($)"><Num value={designBase} onChange={setDesignBase} /></Row>
          <Row label="Design multiplier (×)"><Num value={designMultiplier} onChange={setDesignMultiplier} step={0.05} /></Row>
        </div>
      </Card>

      {/* Materials (only used if scopeVessels=true and not overridden by turnkey tile) */}
      <Card title="Materials (for materials-only scenarios)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <Row label="Tile materials ($/sf)"><Num value={tileMaterialsPerSf} onChange={setTileMaterialsPerSf} /></Row>
          <Row label="Membrane / bond layer ($/sf)"><Num value={membranePerSf} onChange={setMembranePerSf} /></Row>
          <Row label="Warranty (% of materials)"><Num value={warrantyPctOfMaterials} onChange={setWarrantyPctOfMaterials} step={0.1} /></Row>
        </div>
      </Card>

      {/* Overhead & Waste */}
      <Card title="Overhead & Waste">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <Row label="Overhead on soft costs (%)"><Num value={overheadPct} onChange={setOverheadPct} step={0.5} /></Row>
          <Row label="Waste (%)"><Num value={wastePct} onChange={setWastePct} step={0.5} /></Row>
        </div>
      </Card>

      {/* Readout */}
      <Card title="Applied Install Rates (Readout)">
        <div style={{ fontSize: 14, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Equipment & interconnecting plumbing</span>
            <span><b>${fmt(avgEquipPlumbing)}</b> / vessel × {fmt(vesselCount)} = <b>${fmt(avgEquipPlumbing * vesselCount)}</b></span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>EPS assembly & waterproofing</span>
            <span><b>${fmt(epsWpRatePerSf)}</b> / sf × {fmt(floorArea + wallArea + benchSurfaceArea)} sf = <b>${fmt(epsWpRatePerSf * (floorArea + wallArea + benchSurfaceArea))}</b></span>
          </div>
          {tileTurnkey && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4b5563" }}>Tile setting (turnkey)</span>
              <span><b>${fmt(tileTurnkeyRate)}</b> / sf × {fmt(floorArea + wallArea)} sf = <b>${fmt(tileTurnkeyRate * (floorArea + wallArea))}</b></span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Handrails</span>
            <span><b>${fmt(avgHandrails)}</b> / vessel × {fmt(vesselCount)} = <b>${fmt(avgHandrails * vesselCount)}</b></span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#4b5563" }}>Refrigeration line sets</span>
            <span><b>${fmt(avgRefrigLines)}</b> / cold plunge × {fmt(effectiveColdPlungeCount)} = <b>${fmt(avgRefrigLines * effectiveColdPlungeCount)}</b></span>
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
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Installation</span><b>${fmt(installationSubscopes)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Design & Engineering</span><b>${fmt(designEngineeringTotal)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Warranty Reserve</span><b>${fmt(warrantyReserve)}</b></div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Overhead on Soft Costs</span><b>${fmt(overheadAmount)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#6b7280" }}>Waste</span><b>{fmt(wastePct)}%</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}><span style={{ color: "#6b7280" }}>Effective $/sf</span><b>${fmt(effectivePerSf)}</b></div>
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
