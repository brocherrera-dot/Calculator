import React, { useMemo, useState } from "react";

// EPS Pool Material Cost Calculator – Quality Slider Version
// Notes:
// - TailwindCSS + shadcn/ui styling assumptions.
// - Interpolates between LOW and HIGH material costs with a single global
//   "Quality" slider (0 = economy spec, 100 = premium spec).
// - You can also override individual ranges if you want finer control.
// - All units: sf (square feet), ft³ (cubic feet), and $.
// - Thickness is in feet. Example: 8" = 0.667 ft; 12" = 1.0 ft.

// Lightweight UI primitives (replace with shadcn/ui if available in your stack)
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl shadow-lg border border-gray-200 bg-white p-5">
      {children}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold mb-2">{children}</h2>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm text-gray-600">{children}</label>;
}
function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      className={`w-full rounded-xl border px-3 py-2 ${className}`}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
    />
  );
}
function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="range"
      className="w-full"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function lerp(low: number, high: number, t: number) {
  // t in [0, 1]
  return low + (high - low) * t;
}

export default function MaterialCostCalculator() {
  // === Global Areas & Geometry ===
  const [floorArea, setFloorArea] = useState(200); // sf
  const [wallArea, setWallArea] = useState(240); // sf
  const [benchSurfaceArea, setBenchSurfaceArea] = useState(60); // sf exposed
  const [benchVolume, setBenchVolume] = useState(30); // ft^3 solid

  // Thickness (ft)
  const [floorThicknessFt, setFloorThicknessFt] = useState(0.667); // 8"
  const [wallThicknessFt, setWallThicknessFt] = useState(1.0); // 12"

  // Waste
  const [wastePct, setWastePct] = useState(8);

  // === EPS Pricing (per ft^3) – range ===
  const [epsLow, setEpsLow] = useState(7.5);
  const [epsHigh, setEpsHigh] = useState(9.0);

  // === Finish Material Ranges (all in $/sf) ===
  const [tileLow, setTileLow] = useState(4.8);
  const [tileHigh, setTileHigh] = useState(21);

  const [basecreteLow, setBasecreteLow] = useState(1.6);
  const [basecreteHigh, setBasecreteHigh] = useState(2.4);

  const [thinsetLow, setThinsetLow] = useState(0.45);
  const [thinsetHigh, setThinsetHigh] = useState(0.9);

  const [groutLow, setGroutLow] = useState(0.75);
  const [groutHigh, setGroutHigh] = useState(1.5);

  // === Quality Slider ===
  const [quality, setQuality] = useState(40); // 0 = economy, 100 = premium
  const t = useMemo(() => quality / 100, [quality]);

  // Interpolated material $/sf and EPS $/ft^3
  const epsFt3 = useMemo(() => lerp(epsLow, epsHigh, t), [epsLow, epsHigh, t]);
  const tileSf = useMemo(
    () => lerp(tileLow, tileHigh, t),
    [tileLow, tileHigh, t],
  );
  const basecreteSf = useMemo(
    () => lerp(basecreteLow, basecreteHigh, t),
    [basecreteLow, basecreteHigh, t],
  );
  const thinsetSf = useMemo(
    () => lerp(thinsetLow, thinsetHigh, t),
    [thinsetLow, thinsetHigh, t],
  );
  const groutSf = useMemo(
    () => lerp(groutLow, groutHigh, t),
    [groutLow, groutHigh, t],
  );

  const finishPerSf = useMemo(
    () => tileSf + basecreteSf + thinsetSf + groutSf,
    [tileSf, basecreteSf, thinsetSf, groutSf],
  );

  // EPS per-sf by thickness
  const epsFloorPerSf = useMemo(
    () => epsFt3 * floorThicknessFt,
    [epsFt3, floorThicknessFt],
  );
  const epsWallPerSf = useMemo(
    () => epsFt3 * wallThicknessFt,
    [epsFt3, wallThicknessFt],
  );

  // Per-sf totals (materials only)
  const floorPerSf = useMemo(
    () => epsFloorPerSf + finishPerSf,
    [epsFloorPerSf, finishPerSf],
  );
  const wallPerSf = useMemo(
    () => epsWallPerSf + finishPerSf,
    [epsWallPerSf, finishPerSf],
  );

  // Bench totals: EPS by volume + finishes by surface
  const benchEpsTotal = useMemo(
    () => benchVolume * epsFt3,
    [benchVolume, epsFt3],
  );
  const benchFinishTotal = useMemo(
    () => benchSurfaceArea * finishPerSf,
    [benchSurfaceArea, finishPerSf],
  );
  const benchTotal = benchEpsTotal + benchFinishTotal;

  // Project totals (materials pre-waste)
  const floorTotal = floorArea * floorPerSf;
  const wallTotal = wallArea * wallPerSf;

  // === PRESETS ===
  function applyPreset(
    preset: "Economy" | "Standard" | "Premium" | "Union-Site",
  ) {
    switch (preset) {
      case "Economy":
        setQuality(20);
        setRegionMultiplier(0.95);
        setBaseRatePerMile(3.5);
        setHandlingPerVessel(800);
        setIncludeRigging(false);
        setAvgEquipPlumbing(12000);
        setEpsWpRatePerSf(35);
        setTileTurnkey(true);
        setTileTurnkeyRate(45);
        setAvgTileFinishes(tileTurnkeyRate * (floorArea + wallArea));
        setAvgRefrigLines(1400);
        setStartupLumpSum(2500);
        setDesignMultiplier(0.9);
        setOverheadPct(8);
        break;
      case "Standard":
        setQuality(50);
        setRegionMultiplier(1.0);
        setBaseRatePerMile(4.25);
        setHandlingPerVessel(1000);
        setIncludeRigging(true);
        setAvgEquipPlumbing(15000);
        setEpsWpRatePerSf(40);
        setTileTurnkey(true);
        setTileTurnkeyRate(60);
        setAvgTileFinishes(tileTurnkeyRate * (floorArea + wallArea));
        setAvgRefrigLines(1800);
        setStartupLumpSum(3500);
        setDesignMultiplier(1.0);
        setOverheadPct(10);
        break;
      case "Premium":
        setQuality(80);
        setRegionMultiplier(1.15);
        setBaseRatePerMile(5.0);
        setHandlingPerVessel(1250);
        setIncludeRigging(true);
        setAvgEquipPlumbing(18000);
        setEpsWpRatePerSf(40);
        setTileTurnkey(true);
        setTileTurnkeyRate(75);
        setAvgTileFinishes(tileTurnkeyRate * (floorArea + wallArea));
        setAvgRefrigLines(2400);
        setStartupLumpSum(4500);
        setDesignMultiplier(1.2);
        setOverheadPct(12);
        break;
      case "Union-Site":
        setQuality(60);
        setRegionMultiplier(1.25);
        setBaseRatePerMile(5.25);
        setHandlingPerVessel(1300);
        setIncludeRigging(true);
        setAvgEquipPlumbing(20000);
        setEpsWpRatePerSf(40);
        setTileTurnkey(true);
        setTileTurnkeyRate(85);
        setAvgTileFinishes(tileTurnkeyRate * (floorArea + wallArea));
        setAvgRefrigLines(2600);
        setStartupLumpSum(5200);
        setDesignMultiplier(1.25);
        setOverheadPct(15);
        break;
    }
  }

  // Totals
  const subtotalPreWaste = materialSubtotal + softCostsWithOverhead;
  const totalWithWaste = subtotalPreWaste * (1 + wastePct / 100);

  // Useful KPIs
  const effectivePerSf =
    totalSurfaceArea > 0 ? totalWithWaste / totalSurfaceArea : 0;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          EPS Pool – Material & Soft-Cost Calculator (v2.1)
        </h1>
        <div className="text-sm text-gray-500">All costs in USD</div>
      </div>

      <Card>
        <SectionTitle>Global Spec</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Quality (Economy → Premium): {quality}</Label>
            <Slider value={quality} onChange={setQuality} />
            <div className="text-xs text-gray-500 mt-1">
              Interpolates all low↔high ranges.
            </div>
          </div>
          <div>
            <Label>Waste %</Label>
            <div className="flex gap-3 items-center">
              <Slider
                value={wastePct}
                onChange={setWastePct}
                min={0}
                max={20}
              />
              <NumberInput value={wastePct} onChange={setWastePct} step={0.5} />
            </div>
          </div>
          <div>
            <Label>Region Multiplier</Label>
            <NumberInput
              value={regionMultiplier}
              onChange={setRegionMultiplier}
              step={0.01}
            />
            <div className="text-xs text-gray-500 mt-1">
              e.g., 1.00 = baseline, 1.15 = HCOL market
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <Label>Floor Area (sf)</Label>
            <NumberInput value={floorArea} onChange={setFloorArea} />
          </div>
          <div>
            <Label>Wall Area (sf)</Label>
            <NumberInput value={wallArea} onChange={setWallArea} />
          </div>
          <div>
            <Label>Bench Surface Area (sf)</Label>
            <NumberInput
              value={benchSurfaceArea}
              onChange={setBenchSurfaceArea}
            />
          </div>
          <div>
            <Label>Bench Volume (ft³)</Label>
            <NumberInput value={benchVolume} onChange={setBenchVolume} />
          </div>
          <div>
            <Label>Floor Thickness (ft)</Label>
            <NumberInput
              value={floorThicknessFt}
              onChange={setFloorThicknessFt}
              step={0.001}
            />
            <div className="text-xs text-gray-500 mt-1">8" = 0.667</div>
          </div>
          <div>
            <Label>Wall Thickness (ft)</Label>
            <NumberInput
              value={wallThicknessFt}
              onChange={setWallThicknessFt}
              step={0.001}
            />
            <div className="text-xs text-gray-500 mt-1">12" = 1.0</div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Material Cost Ranges</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="space-y-2">
            <div className="font-medium">EPS ($/ft³)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Low</Label>
                <NumberInput value={epsLow} onChange={setEpsLow} step={0.01} />
              </div>
              <div>
                <Label>High</Label>
                <NumberInput
                  value={epsHigh}
                  onChange={setEpsHigh}
                  step={0.01}
                />
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Interpolated: ${fmt(epsFt3)}/ft³
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Tile ($/sf)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Low</Label>
                <NumberInput
                  value={tileLow}
                  onChange={setTileLow}
                  step={0.01}
                />
              </div>
              <div>
                <Label>High</Label>
                <NumberInput
                  value={tileHigh}
                  onChange={setTileHigh}
                  step={0.01}
                />
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Interpolated: ${fmt(tileSf)}/sf
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">BaseCrete ($/sf)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Low</Label>
                <NumberInput
                  value={basecreteLow}
                  onChange={setBasecreteLow}
                  step={0.01}
                />
              </div>
              <div>
                <Label>High</Label>
                <NumberInput
                  value={basecreteHigh}
                  onChange={setBasecreteHigh}
                  step={0.01}
                />
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Interpolated: ${fmt(basecreteSf)}/sf
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Thinset ($/sf)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Low</Label>
                <NumberInput
                  value={thinsetLow}
                  onChange={setThinsetLow}
                  step={0.01}
                />
              </div>
              <div>
                <Label>High</Label>
                <NumberInput
                  value={thinsetHigh}
                  onChange={setThinsetHigh}
                  step={0.01}
                />
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Interpolated: ${fmt(thinsetSf)}/sf
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Grout ($/sf)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Low</Label>
                <NumberInput
                  value={groutLow}
                  onChange={setGroutLow}
                  step={0.01}
                />
              </div>
              <div>
                <Label>High</Label>
                <NumberInput
                  value={groutHigh}
                  onChange={setGroutHigh}
                  step={0.01}
                />
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Interpolated: ${fmt(groutSf)}/sf
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Tile Setting & Finishes (Turnkey)</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tileTurnkey}
              onChange={(e) => setTileTurnkey(e.target.checked)}
            />{" "}
            Use turnkey rate (materials + labor)
          </label>
          <div>
            <Label>Turnkey Rate ($/sf)</Label>
            <NumberInput
              value={tileTurnkeyRate}
              onChange={setTileTurnkeyRate}
            />
          </div>
          <div className="text-sm text-gray-600">
            Current applied:{" "}
            <span className="font-semibold">${fmt(tileTurnkeyRate)} / sf</span>{" "}
            ×{" "}
            <span className="font-semibold">
              {fmt(floorArea + wallArea)} sf
            </span>{" "}
            ={" "}
            <span className="font-semibold">
              ${fmt(tileTurnkeyRate * (floorArea + wallArea))}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Per‑Square‑Foot (Materials)</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-gray-500">
              Finishes (Tile + BaseCrete + Thinset + Grout)
            </div>
            <div className="text-2xl font-semibold">${fmt(finishPerSf)}/sf</div>
          </div>
          <div className="space-y-1">
            <div className="text-gray-500">EPS – Floor</div>
            <div className="text-2xl font-semibold">
              ${fmt(epsFloorPerSf)}/sf
            </div>
            <div className="text-xs text-gray-400">{`@ ${fmt(epsFt3)} $/ft³ × ${fmt(floorThicknessFt)} ft`}</div>
          </div>
          <div className="space-y-1">
            <div className="text-gray-500">EPS – Wall</div>
            <div className="text-2xl font-semibold">
              ${fmt(epsWallPerSf)}/sf
            </div>
            <div className="text-xs text-gray-400">{`@ ${fmt(epsFt3)} $/ft³ × ${fmt(wallThicknessFt)} ft`}</div>
          </div>
        </div>
      </Card>

      {/* v2 Soft Costs */}
      <Card>
        <SectionTitle>Scope Toggles</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopeVessels}
              onChange={(e) => setScopeVessels(e.target.checked)}
            />{" "}
            Vessels (materials)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopeEquipment}
              onChange={(e) => setScopeEquipment(e.target.checked)}
            />{" "}
            Equipment
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopeInstallation}
              onChange={(e) => setScopeInstallation(e.target.checked)}
            />{" "}
            Installation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopeFreight}
              onChange={(e) => setScopeFreight(e.target.checked)}
            />{" "}
            Freight/Delivery
          </label>
        </div>
      </Card>

      <Card>
        <SectionTitle>Presets</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {(["Economy", "Standard", "Premium", "Union-Site"] as const).map(
            (p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className="px-3 py-2 rounded-xl bg-black text-white text-sm shadow"
              >
                {p}
              </button>
            ),
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>Freight / Handling / Delivery (Combined)</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <Label>Distance (mi)</Label>
            <NumberInput value={shipDistanceMi} onChange={setShipDistanceMi} />
          </div>
          <div>
            <Label>Base Rate ($/mi)</Label>
            <NumberInput
              value={baseRatePerMile}
              onChange={setBaseRatePerMile}
              step={0.01}
            />
          </div>
          <div>
            <Label>Vessel Count</Label>
            <NumberInput value={vesselCount} onChange={setVesselCount} />
          </div>
          <div>
            <Label>Cold Plunge Count</Label>
            <NumberInput
              value={coldPlungeCount}
              onChange={setColdPlungeCount}
            />
          </div>
          <div>
            <Label>Hot Tub Count</Label>
            <NumberInput value={hotTubCount} onChange={setHotTubCount} />
          </div>
          <div>
            <Label>Handling per Vessel ($)</Label>
            <NumberInput
              value={handlingPerVessel}
              onChange={setHandlingPerVessel}
            />
          </div>
        </div>
        {(coldPlungeCount > vesselCount || hotTubCount > vesselCount) && (
          <div className="mt-2 text-xs text-red-600">
            Counts exceed total vessels; using capped values (cold plunges
            capped at {effectiveColdPlungeCount}).
          </div>
        )}

        <div className="mt-3 text-sm text-gray-600">
          Freight Total:{" "}
          <span className="font-semibold">${fmt(freightTotal)}</span>{" "}
          <span className="text-gray-400">
            (Includes curbside delivery + per-vessel handling)
          </span>
        </div>
      </Card>

      <Card>
        <SectionTitle>Handling & Warehouse</SectionTitle>
        <div className="text-sm text-gray-600">
          This cost is consolidated into the{" "}
          <strong>Freight / Handling / Delivery (Combined)</strong> section via
          the per‑vessel handling fee.
        </div>
      </Card>

      <Card>
        <SectionTitle>Delivery (Last Mile)</SectionTitle>
        <div className="text-sm text-gray-600">
          Last‑mile delivery is included in the{" "}
          <strong>Freight / Handling / Delivery (Combined)</strong> model (base
          $/mile covers curbside delivery).
        </div>
      </Card>

      <Card>
        <SectionTitle>Installation</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <Label>Mode</Label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={installMode}
              onChange={(e) =>
                setInstallMode(e.target.value as "productivity" | "hours")
              }
            >
              <option value="productivity">By Productivity</option>
              <option value="hours">By Hours</option>
            </select>
          </div>
          <div>
            <Label>Crew Size</Label>
            <NumberInput value={crewSize} onChange={setCrewSize} />
          </div>
          <div>
            <Label>Labor Rate ($/hr)</Label>
            <NumberInput value={laborRate} onChange={setLaborRate} />
          </div>
          {installMode === "productivity" ? (
            <>
              <div>
                <Label>Productivity (sf / crew‑hr)</Label>
                <NumberInput
                  value={prodSfPerCrewHour}
                  onChange={setProdSfPerCrewHour}
                />
              </div>
              <div>
                <Label>Total Surface Area (sf)</Label>
                <NumberInput value={totalSurfaceArea} onChange={() => {}} />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <Label>Install Hours (override)</Label>
              <NumberInput
                value={installHoursOverride}
                onChange={setInstallHoursOverride}
              />
            </div>
          )}
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Install Labor Total:{" "}
          <span className="font-semibold">${fmt(installLaborTotal)}</span>{" "}
          <span className="text-gray-400">
            (Crew-hours: {fmt(installCrewHours)})
          </span>
        </div>
      </Card>

      <Card>
        <SectionTitle>Applied Install Rates (Readout)</SectionTitle>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">
              Equipment & interconnecting plumbing
            </span>
            <span className="font-semibold">
              ${fmt(avgEquipPlumbing)} / vessel × {vesselCount} = $
              {fmt(avgEquipPlumbing * vesselCount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">EPS assembly & waterproofing</span>
            <span className="font-semibold">
              ${fmt(epsWpRatePerSf)} / sf ×{" "}
              {fmt(floorArea + wallArea + benchSurfaceArea)} sf = $
              {fmt(epsWpRatePerSf * (floorArea + wallArea + benchSurfaceArea))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tile setting (turnkey)</span>
            <span className="font-semibold">
              {tileTurnkey
                ? `$${fmt(tileTurnkeyRate)} / sf × ${fmt(floorArea + wallArea)} sf = $${fmt(tileTurnkeyRate * (floorArea + wallArea))}`
                : `$${fmt(avgTileFinishes)} (custom)`}
            </span>
          </div>
          {instHandrails && (
            <div className="flex justify-between">
              <span className="text-gray-600">Handrails</span>
              <span className="font-semibold">
                ${fmt(avgHandrails)} / vessel × {vesselCount} = $
                {fmt(avgHandrails * vesselCount)}
              </span>
            </div>
          )}
          {instRefrigLines && (
            <div className="flex justify-between">
              <span className="text-gray-600">Refrigeration line sets</span>
              <span className="font-semibold">
                ${fmt(avgRefrigLines)} / cold plunge ×{" "}
                {effectiveColdPlungeCount} = $
                {fmt(avgRefrigLines * effectiveColdPlungeCount)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2">
            <span className="text-gray-600">Rep onsite fee (project)</span>
            <span className="font-semibold">${fmt(repOnsiteFee)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Startup & Commissioning</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <Label>Tech Hours</Label>
            <NumberInput value={techHours} onChange={setTechHours} />
          </div>
          <div>
            <Label>Tech Rate ($/hr)</Label>
            <NumberInput value={techRate} onChange={setTechRate} />
          </div>
          <div>
            <Label>Travel Days</Label>
            <NumberInput value={travelDays} onChange={setTravelDays} />
          </div>
          <div>
            <Label>Per Diem ($/day)</Label>
            <NumberInput value={perDiem} onChange={setPerDiem} />
          </div>
          <div>
            <Label>Flight ($)</Label>
            <NumberInput value={flightCost} onChange={setFlightCost} />
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Startup Total:{" "}
          <span className="font-semibold">${fmt(startupTotal)}</span>
        </div>
      </Card>

      <Card>
        <SectionTitle>Design & Engineering</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <Label>Design Hours</Label>
            <NumberInput value={designHours} onChange={setDesignHours} />
          </div>
          <div>
            <Label>Design Rate ($/hr)</Label>
            <NumberInput value={designRate} onChange={setDesignRate} />
          </div>
          <div>
            <Label>Engineering Hours</Label>
            <NumberInput value={engHours} onChange={setEngHours} />
          </div>
          <div>
            <Label>Engineering Rate ($/hr)</Label>
            <NumberInput value={engRate} onChange={setEngRate} />
          </div>
          <div>
            <Label>Permits / Stamps ($)</Label>
            <NumberInput value={permitFees} onChange={setPermitFees} />
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Design + Engineering Total:{" "}
          <span className="font-semibold">${fmt(designEngineeringTotal)}</span>
        </div>
      </Card>

      <Card>
        <SectionTitle>Warranty Reserve & Overhead</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>Warranty % of Materials</Label>
            <NumberInput
              value={warrantyPctOfMaterials}
              onChange={setWarrantyPctOfMaterials}
              step={0.1}
            />
          </div>
          <div>
            <Label>Overhead % on Soft Costs</Label>
            <NumberInput
              value={overheadPct}
              onChange={setOverheadPct}
              step={0.5}
            />
          </div>
          <div className="col-span-2 text-sm text-gray-600 flex items-end">
            Soft-costs subtotal (pre‑OH):{" "}
            <span className="ml-1 font-semibold">
              ${fmt(softCostsSubtotal)}
            </span>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Soft-costs w/ Overhead:{" "}
          <span className="font-semibold">${fmt(softCostsWithOverhead)}</span>
        </div>
      </Card>

      {/* Totals */}
      <Card>
        <SectionTitle>Scope Summary</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
          <div className="p-3 rounded-xl bg-gray-50">
            <div className="flex justify-between">
              <span className="text-gray-600">Materials (Vessels)</span>
              <span className="font-semibold">${fmt(materialSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Freight/Handling/Delivery</span>
              <span className="font-semibold">${fmt(freightTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Rigging</span>
              <span className="font-semibold">${fmt(riggingTotal)}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-gray-50">
            <div className="flex justify-between">
              <span className="text-gray-600">Installation (subscopes)</span>
              <span className="font-semibold">
                ${fmt(installationSubscopes)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Startup & Commissioning</span>
              <span className="font-semibold">${fmt(startupTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Design & Engineering</span>
              <span className="font-semibold">
                ${fmt(designEngineeringTotal)}
              </span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-gray-50">
            <div className="flex justify-between">
              <span className="text-gray-600">Warranty Reserve</span>
              <span className="font-semibold">${fmt(warrantyReserve)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Overhead on Soft Costs</span>
              <span className="font-semibold">${fmt(overheadAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Waste</span>
              <span className="font-semibold">${fmt(wasteAmount)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Totals</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-gray-500">Materials Subtotal</div>
            <div className="text-3xl font-bold">${fmt(materialSubtotal)}</div>
          </div>
          <div>
            <div className="text-gray-500">Soft Costs (w/ OH)</div>
            <div className="text-3xl font-bold">
              ${fmt(softCostsWithOverhead)}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Waste ({fmt(wastePct)}%)</div>
            <div className="text-3xl font-bold">
              $
              {fmt(
                ((materialSubtotal + softCostsWithOverhead) * wastePct) / 100,
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-gray-500">Grand Total (incl. Waste)</div>
            <div className="text-4xl font-extrabold">
              ${fmt(totalWithWaste)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">Effective $/sf (incl. Waste)</div>
            <div className="text-2xl font-bold">${fmt(effectivePerSf)}</div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Export / Notes</SectionTitle>
        <ul className="list-disc pl-6 text-sm text-gray-600 space-y-1">
          <li>
            Use the global <strong>Quality</strong> slider to move from economy
            to premium specifications.
          </li>
          <li>
            Region multiplier scales freight, handling, delivery, labor,
            startup, and design/engineering.
          </li>
          <li>
            Installation can be computed by productivity (sf/crew‑hour) or
            direct hours.
          </li>
          <li>
            Warranty reserve is applied as a % of materials; overhead is applied
            on soft‑costs.
          </li>
          <li>KPIs: see Effective $/sf and Grand Total for fast quoting.</li>
        </ul>
      </Card>
    </div>
  );
}
