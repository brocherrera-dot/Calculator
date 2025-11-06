import React, { useMemo, useState } from "react";

// === Quick Notes ===
// - This is a single-file React app you can deploy to Vercel/Netlify and embed in Notion via /embed.
// - No external data; Tailwind classes used (Notion embed doesn't require Tailwind runtime).
// - All numbers USD. Percent inputs accept e.g. 7.5 for 7.5%.
// - Geometry multiplier = Π(1 + adder) for each selected feature.
// - Freight is allocated by Adjusted SA share; Rigging split evenly; MEP hours split evenly.
// - Equipment packages use editable per-vessel-type totals for simplicity (you can expand to line-item BOMs later).

// -------- Types --------
interface Rates {
  shellPerSqft: number; // EPS + membrane + tile
  tileLaborPerSqft: number; // optional (set 0 if included in shell)
  mepLaborPerHr: number;
  riggingSet: number;
  freightPerMile: number;
  freightFixed: number;
  controlsPanelEach: number;
  contingencyPct: number; // e.g., 7.5 => 7.5%
  ohpPct: number; // Overhead & Profit
  regionalLaborMult: number; // 1.00 default
  regionalMaterialMult: number; // 1.00 default
}

interface EquipmentPackage {
  name: string;
  totals: { [vesselType: string]: number };
}

type VesselType = "Cold Plunge" | "Hot Tub";

interface VesselRow {
  id: string;
  name: string;
  type: VesselType;
  lengthFt: number;
  widthFt: number;
  depthFt: number;
  hasSteps: boolean;
  hasBench: boolean;
  hasLevels: boolean;
  hasRadius: boolean;
  hasNiches: boolean;
  hasPattern: boolean;
  packageName: string; // High-End | Mid-Tier
}

interface Inputs {
  projectName: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  crewHoursMEP: number; // total for project
  installDaysTotal: number;
}

// -------- Defaults --------
const DEFAULT_RATES: Rates = {
  shellPerSqft: 325,
  tileLaborPerSqft: 0, // baked into shell by default
  mepLaborPerHr: 125,
  riggingSet: 4500,
  freightPerMile: 3.75,
  freightFixed: 1200,
  controlsPanelEach: 7500,
  contingencyPct: 7.5,
  ohpPct: 15,
  regionalLaborMult: 1.0,
  regionalMaterialMult: 1.0,
};

const EQUIPMENT_PACKAGES: EquipmentPackage[] = [
  {
    name: "High-End",
    totals: {
      "Cold Plunge":
        2400 + 1450 + 8500 + 18500 + 5000 + 1200 + 1200 + 2 * 450 + 900,
      "Hot Tub": 2750 + 1450 + 3800 + 8500 + 5000 + 1200 + 1200 + 2 * 450 + 900,
    },
  },
  {
    name: "Mid-Tier",
    totals: {
      "Cold Plunge":
        1300 + 850 + 3200 + 8900 + 750 + 1200 + 950 + 2 * 450 + 700,
      "Hot Tub": 1650 + 1100 + 3200 + 3200 + 750 + 1200 + 950 + 2 * 450 + 700,
    },
  },
];

const GEOMETRY_ADDERS = {
  steps: 0.08,
  bench: 0.1,
  levels: 0.05,
  radius: 0.03,
  niches: 0.02,
  pattern: 0.05,
};

const DEFAULT_INPUTS: Inputs = {
  projectName: "Boca Raton – Geometry Test",
  origin: "Phoenix, AZ",
  destination: "Boca Raton, FL",
  distanceMiles: 2300,
  crewHoursMEP: 120,
  installDaysTotal: 10,
};

const DEFAULT_VESSELS: VesselRow[] = [
  {
    id: "v1",
    name: "Cold Plunge 1",
    type: "Cold Plunge",
    lengthFt: 3,
    widthFt: 10,
    depthFt: 3.5,
    hasSteps: false,
    hasBench: false,
    hasLevels: false,
    hasRadius: false,
    hasNiches: false,
    hasPattern: false,
    packageName: "High-End",
  },
  {
    id: "v2",
    name: "Cold Plunge 2",
    type: "Cold Plunge",
    lengthFt: 5 + 9 / 12,
    widthFt: 4 + 7 / 12,
    depthFt: 3.5,
    hasSteps: false,
    hasBench: false,
    hasLevels: false,
    hasRadius: false,
    hasNiches: false,
    hasPattern: false,
    packageName: "High-End",
  },
  {
    id: "v3",
    name: "Cold Plunge 3",
    type: "Cold Plunge",
    lengthFt: 3 + 3 / 12,
    widthFt: 5 + 9 / 12,
    depthFt: 3.5,
    hasSteps: false,
    hasBench: false,
    hasLevels: false,
    hasRadius: false,
    hasNiches: false,
    hasPattern: false,
    packageName: "High-End",
  },
  {
    id: "v4",
    name: "Hot Tub",
    type: "Hot Tub",
    lengthFt: 17 + 9 / 12,
    widthFt: 5 + 7 / 12,
    depthFt: 3.5,
    hasSteps: true,
    hasBench: true,
    hasLevels: false,
    hasRadius: false,
    hasNiches: false,
    hasPattern: false,
    packageName: "High-End",
  },
];

// -------- Helpers --------
function round(v: number, d = 2) {
  return Math.round(v * 10 ** d) / 10 ** d;
}

function totalInternalSA(lengthFt: number, widthFt: number, depthFt: number) {
  const floor = lengthFt * widthFt;
  const walls = 2 * (lengthFt + widthFt) * depthFt;
  return { floor, walls, total: floor + walls };
}

function geometryMultiplier(v: VesselRow) {
  let mult = 1;
  if (v.hasSteps) mult *= 1 + GEOMETRY_ADDERS.steps;
  if (v.hasBench) mult *= 1 + GEOMETRY_ADDERS.bench;
  if (v.hasLevels) mult *= 1 + GEOMETRY_ADDERS.levels;
  if (v.hasRadius) mult *= 1 + GEOMETRY_ADDERS.radius;
  if (v.hasNiches) mult *= 1 + GEOMETRY_ADDERS.niches;
  if (v.hasPattern) mult *= 1 + GEOMETRY_ADDERS.pattern;
  return mult;
}

function getPackageTotal(
  pkgName: string,
  vesselType: VesselType,
  packages: EquipmentPackage[]
) {
  const pkg = packages.find((p) => p.name === pkgName);
  return pkg?.totals[vesselType] ?? 0;
}

// -------- Main Component --------
export default function App() {
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [packages, setPackages] =
    useState<EquipmentPackage[]>(EQUIPMENT_PACKAGES);
  const [rows, setRows] = useState<VesselRow[]>(DEFAULT_VESSELS);

  // Derived calcs per vessel
  const vesselCalcs = useMemo(() => {
    const totalAdjSA = rows.reduce((acc, v) => {
      const sa = totalInternalSA(v.lengthFt, v.widthFt, v.depthFt).total;
      const mult = geometryMultiplier(v);
      return acc + sa * mult;
    }, 0);

    const vcount = rows.length || 1;

    return rows.map((v) => {
      const sa = totalInternalSA(v.lengthFt, v.widthFt, v.depthFt);
      const gMult = geometryMultiplier(v);
      const adjustedSA = sa.total * gMult;

      const shellCost =
        adjustedSA *
        (rates.shellPerSqft + rates.tileLaborPerSqft) *
        rates.regionalMaterialMult;
      const equipBase =
        getPackageTotal(v.packageName, v.type, packages) *
        rates.regionalMaterialMult;

      const mepLabor =
        (inputs.crewHoursMEP / vcount) *
        rates.mepLaborPerHr *
        rates.regionalLaborMult;
      const controls = rates.controlsPanelEach * rates.regionalMaterialMult;

      const freightTotal =
        rates.freightPerMile * inputs.distanceMiles + rates.freightFixed;
      const freight =
        totalAdjSA > 0 ? freightTotal * (adjustedSA / totalAdjSA) : 0;

      const rigging = rates.riggingSet / vcount;

      const directs =
        shellCost + equipBase + mepLabor + controls + freight + rigging;
      const contingency = directs * (rates.contingencyPct / 100);
      const subtotalWithCont = directs + contingency;

      return {
        v,
        floor: sa.floor,
        walls: sa.walls,
        totalSA: sa.total,
        geomMult: gMult,
        adjustedSA,
        shellCost,
        equipBase,
        mepLabor,
        controls,
        freight,
        rigging,
        directs,
        contingency,
        subtotalWithCont,
      };
    });
  }, [rows, rates, inputs, packages]);

  const summary = useMemo(() => {
    const directs = vesselCalcs.reduce((a, x) => a + x.directs, 0);
    const contingency = vesselCalcs.reduce((a, x) => a + x.contingency, 0);
    const subtotal = directs + contingency;
    const ohp = subtotal * (rates.ohpPct / 100);
    const grand = subtotal + ohp;
    return { directs, contingency, subtotal, ohpPct: rates.ohpPct, ohp, grand };
  }, [vesselCalcs, rates.ohpPct]);

  // -------- UI helpers --------
  const NumberInput = ({
    label,
    value,
    onChange,
    step = 0.01,
    min = 0,
    suffix = "",
  }: any) => (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-gray-700">{label}</span>
      <input
        type="number"
        className="w-36 rounded border px-2 py-1"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
      />
      {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
    </label>
  );

  const Checkbox = ({ label, checked, onChange }: any) => (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">{label}</span>
    </label>
  );

  const Money = ({ v }: { v: number }) => (
    <span>${round(v).toLocaleString()}</span>
  );

  // -------- Render --------
  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Commercial Pool Estimator
            </h1>
            <p className="text-sm text-gray-600">
              Total internal surface area + geometry multipliers • Package-based
              equipment • Separate contingency & OH&P
            </p>
          </div>
        </header>

        {/* Project Inputs */}
        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-medium">Project</h2>
            <label className="block py-1 text-sm">
              Name
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={inputs.projectName}
                onChange={(e) =>
                  setInputs({ ...inputs, projectName: e.target.value })
                }
              />
            </label>
            <label className="block py-1 text-sm">
              Origin
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={inputs.origin}
                onChange={(e) =>
                  setInputs({ ...inputs, origin: e.target.value })
                }
              />
            </label>
            <label className="block py-1 text-sm">
              Destination
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={inputs.destination}
                onChange={(e) =>
                  setInputs({ ...inputs, destination: e.target.value })
                }
              />
            </label>
            <NumberInput
              label="Distance (mi)"
              value={inputs.distanceMiles}
              onChange={(v) => setInputs({ ...inputs, distanceMiles: v })}
            />
            <NumberInput
              label="Crew Hours (MEP) — total"
              value={inputs.crewHoursMEP}
              onChange={(v) => setInputs({ ...inputs, crewHoursMEP: v })}
            />
            <NumberInput
              label="Install Days (plan)"
              value={inputs.installDaysTotal}
              onChange={(v) => setInputs({ ...inputs, installDaysTotal: v })}
            />
          </div>

          <div className="rounded-2xl border p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-medium">Rates & Markups</h2>
            <NumberInput
              label="Shell (EPS+membrane+tile) $/ft²"
              value={rates.shellPerSqft}
              onChange={(v) => setRates({ ...rates, shellPerSqft: v })}
            />
            <NumberInput
              label="Tile Labor $/ft² (extra)"
              value={rates.tileLaborPerSqft}
              onChange={(v) => setRates({ ...rates, tileLaborPerSqft: v })}
            />
            <NumberInput
              label="MEP Labor $/hr"
              value={rates.mepLaborPerHr}
              onChange={(v) => setRates({ ...rates, mepLaborPerHr: v })}
            />
            <NumberInput
              label="Controls Panel $/ea"
              value={rates.controlsPanelEach}
              onChange={(v) => setRates({ ...rates, controlsPanelEach: v })}
            />
            <NumberInput
              label="Rigging (set) $"
              value={rates.riggingSet}
              onChange={(v) => setRates({ ...rates, riggingSet: v })}
            />
            <NumberInput
              label="Freight $/mile"
              value={rates.freightPerMile}
              onChange={(v) => setRates({ ...rates, freightPerMile: v })}
            />
            <NumberInput
              label="Freight fixed $"
              value={rates.freightFixed}
              onChange={(v) => setRates({ ...rates, freightFixed: v })}
            />
            <NumberInput
              label="Contingency %"
              value={rates.contingencyPct}
              onChange={(v) => setRates({ ...rates, contingencyPct: v })}
            />
            <NumberInput
              label="OH&P %"
              value={rates.ohpPct}
              onChange={(v) => setRates({ ...rates, ohpPct: v })}
            />
            <NumberInput
              label="Labor Multiplier"
              value={rates.regionalLaborMult}
              onChange={(v) => setRates({ ...rates, regionalLaborMult: v })}
            />
            <NumberInput
              label="Material Multiplier"
              value={rates.regionalMaterialMult}
              onChange={(v) => setRates({ ...rates, regionalMaterialMult: v })}
            />
          </div>

          <div className="rounded-2xl border p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-medium">
              Equipment Packages (editable totals)
            </h2>
            {packages.map((p, idx) => (
              <div key={p.name} className="mb-2 rounded-lg border p-2">
                <div className="mb-1 text-sm font-medium">{p.name}</div>
                {(Object.keys(p.totals) as VesselType[]).map((vt) => (
                  <label
                    key={vt}
                    className="flex items-center justify-between gap-3 py-1 text-sm"
                  >
                    <span>{vt}</span>
                    <input
                      type="number"
                      className="w-32 rounded border px-2 py-1"
                      value={p.totals[vt]}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value || "0");
                        setPackages((prev) =>
                          prev.map((pp) =>
                            pp.name === p.name
                              ? { ...pp, totals: { ...pp.totals, [vt]: v } }
                              : pp
                          )
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Vessels table */}
        <section className="mb-6 rounded-2xl border p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">Vessels</h2>
            <button
              onClick={() => {
                const next: VesselRow = {
                  id: Math.random().toString(36).slice(2),
                  name: `Vessel ${rows.length + 1}`,
                  type: "Cold Plunge",
                  lengthFt: 6,
                  widthFt: 4,
                  depthFt: 3,
                  hasSteps: false,
                  hasBench: false,
                  hasLevels: false,
                  hasRadius: false,
                  hasNiches: false,
                  hasPattern: false,
                  packageName: packages[0]?.name || "High-End",
                };
                setRows([...rows, next]);
              }}
              className="rounded-xl border px-3 py-1 text-sm"
            >
              + Add Vessel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">L (ft)</th>
                  <th className="py-2 pr-3">W (ft)</th>
                  <th className="py-2 pr-3">D (ft)</th>
                  <th className="py-2 pr-3">Steps</th>
                  <th className="py-2 pr-3">Bench</th>
                  <th className="py-2 pr-3">Levels</th>
                  <th className="py-2 pr-3">Radius</th>
                  <th className="py-2 pr-3">Niches</th>
                  <th className="py-2 pr-3">Pattern</th>
                  <th className="py-2 pr-3">Package</th>
                  <th className="py-2 pr-3">Adj SA (ft²)</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const calc = vesselCalcs[i];
                  return (
                    <tr key={r.id} className="border-b align-top">
                      <td className="py-1 pr-3">
                        <input
                          className="w-40 rounded border px-2 py-1"
                          value={r.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows(
                              rows.map((x) =>
                                x.id === r.id ? { ...x, name: v } : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <select
                          className="rounded border px-2 py-1"
                          value={r.type}
                          onChange={(e) => {
                            const v = e.target.value as VesselType;
                            setRows(
                              rows.map((x) =>
                                x.id === r.id ? { ...x, type: v } : x
                              )
                            );
                          }}
                        >
                          <option>Cold Plunge</option>
                          <option>Hot Tub</option>
                        </select>
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1"
                          value={r.lengthFt}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value || "0");
                            setRows(
                              rows.map((x) =>
                                x.id === r.id ? { ...x, lengthFt: v } : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1"
                          value={r.widthFt}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value || "0");
                            setRows(
                              rows.map((x) =>
                                x.id === r.id ? { ...x, widthFt: v } : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1"
                          value={r.depthFt}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value || "0");
                            setRows(
                              rows.map((x) =>
                                x.id === r.id ? { ...x, depthFt: v } : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="checkbox"
                          checked={r.hasSteps}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.id === r.id
                                  ? { ...x, hasSteps: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="checkbox"
                          checked={r.hasBench}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.id === r.id
                                  ? { ...x, hasBench: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="checkbox"
                          checked={r.hasLevels}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.id === r.id
                                  ? { ...x, hasLevels: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="checkbox"
                          checked={r.hasRadius}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.id === r.id
                                  ? { ...x, hasRadius: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="checkbox"
                          checked={r.hasNiches}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.id === r.id
                                  ? { ...x, hasNiches: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <input
                          type="checkbox"
                          checked={r.hasPattern}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.id === r.id
                                  ? { ...x, hasPattern: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="py-1 pr-3">
                        <select
                          className="rounded border px-2 py-1"
                          value={r.packageName}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows(
                              rows.map((x) =>
                                x.id === r.id ? { ...x, packageName: v } : x
                              )
                            );
                          }}
                        >
                          {packages.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-3">
                        {calc ? round(calc.adjustedSA) : 0}
                      </td>
                      <td className="py-1">
                        <button
                          onClick={() =>
                            setRows(rows.filter((x) => x.id !== r.id))
                          }
                          className="rounded border px-2 py-1"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Per-vessel cost breakdown */}
        <section className="mb-6 rounded-2xl border p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Per‑Vessel Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-3">Vessel</th>
                  <th className="py-2 pr-3">Adj SA (ft²)</th>
                  <th className="py-2 pr-3">Shell $</th>
                  <th className="py-2 pr-3">Equip $</th>
                  <th className="py-2 pr-3">MEP $</th>
                  <th className="py-2 pr-3">Controls $</th>
                  <th className="py-2 pr-3">Freight $</th>
                  <th className="py-2 pr-3">Rigging $</th>
                  <th className="py-2 pr-3">Directs $</th>
                  <th className="py-2 pr-3">Contingency $</th>
                  <th className="py-2 pr-3">Subtotal $</th>
                </tr>
              </thead>
              <tbody>
                {vesselCalcs.map((c) => (
                  <tr key={c.v.id} className="border-b">
                    <td className="py-1 pr-3">{c.v.name}</td>
                    <td className="py-1 pr-3">{round(c.adjustedSA)}</td>
                    <td className="py-1 pr-3">
                      <Money v={c.shellCost} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.equipBase} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.mepLabor} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.controls} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.freight} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.rigging} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.directs} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.contingency} />
                    </td>
                    <td className="py-1 pr-3">
                      <Money v={c.subtotalWithCont} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Summary */}
        <section className="rounded-2xl border p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Summary</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-500">Directs (All Vessels)</div>
              <div className="text-xl font-semibold">
                <Money v={summary.directs} />
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-500">
                Design Development Contingency
              </div>
              <div className="text-xl font-semibold">
                <Money v={summary.contingency} />
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-500">
                Subtotal (w/ Contingency)
              </div>
              <div className="text-xl font-semibold">
                <Money v={summary.subtotal} />
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-500">Overhead & Profit (%)</div>
              <div className="text-xl font-semibold">
                {round(summary.ohpPct, 2)}%
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-500">Overhead & Profit ($)</div>
              <div className="text-xl font-semibold">
                <Money v={summary.ohp} />
              </div>
            </div>
            <div className="rounded-xl border p-4 bg-slate-50">
              <div className="text-sm text-gray-500">
                Grand Total (Excl. Taxes)
              </div>
              <div className="text-2xl font-bold">
                <Money v={summary.grand} />
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-6 text-center text-xs text-gray-500">
          Built for rapid conceptual estimating. Verify equipment, code
          requirements, and local labor with stamped engineering.
        </footer>
      </div>
    </div>
  );
}
