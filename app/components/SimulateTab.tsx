"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  EnergyData,
  DayData,
  Tariff,
  UserSettings,
  BatterySettings,
  EVSettings,
  SimulationResult,
} from "../lib/types";
import { DEFAULT_TARIFFS, getRateInfoForTime } from "../lib/analytics";
import { runSimulation, findCheapestPeriod } from "../lib/simulation";
import { TariffEditor } from "./TariffManager";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO, getDay, startOfWeek, startOfMonth } from "date-fns";

interface Props {
  data: EnergyData;
  currentSettings: UserSettings;
}

type Granularity = "monthly" | "weekly" | "daily";
type HeatmapView = "current" | "simulated" | "difference";
type HeatmapMode = "usage" | "cost";

const GRANULARITY_TABS: { key: Granularity; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "weekly", label: "Weekly" },
  { key: "daily", label: "Daily" },
];

const TIME_SLOTS = [
  "00:00",
  "00:30",
  "01:00",
  "01:30",
  "02:00",
  "02:30",
  "03:00",
  "03:30",
  "04:00",
  "04:30",
  "05:00",
  "05:30",
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
  "22:00",
  "22:30",
  "23:00",
  "23:30",
];

const USAGE_SCALE = [
  "#f9fafb",
  "#f4f7fc",
  "#eff4fc",
  "#e9f2fd",
  "#e4effd",
  "#dfecfe",
  "#d9e9fe",
  "#cce2fe",
  "#c0dcfe",
  "#b3d6fd",
  "#a7cffd",
  "#9ac9fd",
  "#8dc0fd",
  "#7eb5fb",
  "#6fa9fa",
  "#5f9ef9",
  "#5092f8",
  "#4187f6",
  "#387df3",
  "#3374ee",
  "#2e6be9",
  "#2862e3",
  "#2359de",
  "#1e50d9",
  "#1d4bc7",
  "#1d48b2",
  "#1d449e",
  "#1e4189",
  "#1e3d74",
  "#1e3a5f",
];
const COST_SCALE = [
  "#f9fafb",
  "#f4faf8",
  "#effbf4",
  "#eafbf1",
  "#e5fbed",
  "#e0fcea",
  "#d9fce5",
  "#caf9db",
  "#bbf7d1",
  "#adf5c6",
  "#9ef3bc",
  "#8ff0b2",
  "#7feca7",
  "#6ee599",
  "#5dde8c",
  "#4bd67e",
  "#3acf71",
  "#29c863",
  "#21be5b",
  "#1eb255",
  "#1ca64f",
  "#1a9a4a",
  "#188e44",
  "#15823e",
  "#157a3b",
  "#157238",
  "#156a35",
  "#146333",
  "#145b30",
  "#14532d",
];
const DIFF_SCALE_NEGATIVE = [
  "#14532d",
  "#145b30",
  "#146333",
  "#156a35",
  "#157238",
  "#157a3b",
  "#15823e",
  "#188e44",
  "#1a9a4a",
  "#1ca64f",
  "#1eb255",
  "#21be5b",
  "#29c863",
  "#3acf71",
  "#4bd67e",
  "#5dde8c",
  "#6ee599",
  "#7feca7",
  "#8ff0b2",
  "#9ef3bc",
  "#adf5c6",
  "#bbf7d1",
  "#caf9db",
  "#d9fce5",
  "#dffce9",
  "#e2fceb",
  "#e6fced",
  "#e9fdf0",
  "#edfdf2",
  "#f0fdf4",
]; // savings = green (dark to light)
const DIFF_SCALE_POSITIVE = [
  "#fff1f2",
  "#ffebed",
  "#ffe5e7",
  "#fedee2",
  "#fed8dd",
  "#fed2d7",
  "#fecad0",
  "#fdbabf",
  "#fcaaae",
  "#fb9a9d",
  "#fa8a8c",
  "#f97b7b",
  "#f66c6c",
  "#f15f5f",
  "#ec5252",
  "#e84545",
  "#e33838",
  "#de2b2b",
  "#d52525",
  "#ca2323",
  "#be2121",
  "#b21f1f",
  "#a71d1d",
  "#9b1b1b",
  "#951b1b",
  "#911c1c",
  "#8c1c1c",
  "#881c1c",
  "#831d1d",
  "#7f1d1d",
]; // extra cost = red (light to dark)

function getScaledColor(value: number, max: number, scale: string[]): string {
  if (value === 0) {
    return scale[0];
  }
  const intensity = Math.min(value / max, 1);
  const idx = Math.min(
    Math.ceil(intensity * (scale.length - 1)),
    scale.length - 1,
  );
  return scale[idx];
}

function getDiffColor(value: number, maxAbs: number): string {
  if (maxAbs === 0 || Math.abs(value) < 0.001) {
    return "#f9fafb";
  }
  const intensity = Math.min(Math.abs(value) / maxAbs, 1);
  const scale = value < 0 ? DIFF_SCALE_NEGATIVE : DIFF_SCALE_POSITIVE;
  const idx = Math.min(
    Math.ceil(intensity * (scale.length - 1)),
    scale.length - 1,
  );
  return scale[idx];
}

function aggregateCosts(
  dailyCosts: SimulationResult["dailyCosts"],
  granularity: Granularity,
) {
  if (granularity === "daily") {
    return dailyCosts.map((d) => ({
      label: format(parseISO(d.date), "dd MMM"),
      current: Math.round(d.currentCost) / 100,
      simulated: Math.round(d.simulatedCost) / 100,
    }));
  }

  const groups = new Map<string, { current: number; simulated: number }>();
  for (const d of dailyCosts) {
    const date = parseISO(d.date);
    const key =
      granularity === "weekly"
        ? format(startOfWeek(date, { weekStartsOn: 1 }), "dd MMM")
        : format(startOfMonth(date), "MMM yyyy");
    const g = groups.get(key) || { current: 0, simulated: 0 };
    g.current += d.currentCost;
    g.simulated += d.simulatedCost;
    groups.set(key, g);
  }

  return Array.from(groups.entries()).map(([label, g]) => ({
    label,
    current: Math.round(g.current) / 100,
    simulated: Math.round(g.simulated) / 100,
  }));
}

export default function SimulateTab({ data, currentSettings }: Props) {
  const [simTariff, setSimTariff] = useState<Tariff>(() =>
    JSON.parse(JSON.stringify(currentSettings.currentTariff)),
  );
  const [simBattery, setSimBattery] = useState<BatterySettings>(() =>
    JSON.parse(JSON.stringify(currentSettings.battery)),
  );
  const [simEV, setSimEV] = useState<EVSettings>(() =>
    JSON.parse(JSON.stringify(currentSettings.ev)),
  );
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [stale, setStale] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("difference");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("cost");
  const resultsRef = useRef<HTMLDivElement>(null);

  // Mark results as stale when any simulation parameter changes
  useEffect(() => {
    if (result) {
      setStale(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTariff, simBattery, simEV]);

  const handleSimulate = useCallback(() => {
    const simConfig = {
      tariff: simTariff,
      battery: simBattery,
      ev: simEV,
    };
    const r = runSimulation(data, currentSettings, simConfig);
    console.log(
      "Simulation debug",
      JSON.stringify({
        currentSettings,
        simConfig,
        result: {
          currentTotalCostCents: r.currentTotalCostCents,
          simulatedTotalCostCents: r.simulatedTotalCostCents,
          savingsCents: r.savingsCents,
          savingsPercent: r.savingsPercent,
          yearlySavingsCents: r.yearlySavingsCents,
          exportRevenueCents: r.exportRevenueCents,
          numDays: r.numDays,
        },
      }),
    );
    setResult(r);
    setStale(false);
    // Scroll to results after render
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [data, currentSettings, simTariff, simBattery, simEV]);

  const handlePresetChange = (presetId: string) => {
    const found = DEFAULT_TARIFFS.find((t) => t.id === presetId);
    if (found) {
      setSimTariff(JSON.parse(JSON.stringify(found)));
    }
  };

  const cheapest = findCheapestPeriod(simTariff, 1);

  const chartData = useMemo(() => {
    if (!result) {
      return [];
    }
    return aggregateCosts(result.dailyCosts, granularity);
  }, [result, granularity]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (!result) {
      return null;
    }

    const currentDays = data.days;
    const simDays = result.simulatedDays;
    const tariffForCurrent = currentSettings.currentTariff;
    const tariffForSim = simTariff;

    let maxKwh = 0;
    let maxCost = 0;
    let maxDiffAbs = 0;

    // Compute costs per cell and track maximums
    const currentCells: number[][] = [];
    const simCells: number[][] = [];
    const diffCells: number[][] = [];

    for (let d = 0; d < currentDays.length; d++) {
      const day = currentDays[d];
      const sDay = simDays[d];
      const dayOfWeek = getDay(parseISO(day.date));
      const cRow: number[] = [];
      const sRow: number[] = [];
      const dRow: number[] = [];

      for (let i = 0; i < day.readings.length; i++) {
        const r = day.readings[i];
        const sr = sDay.readings[i];
        const [h, m] = r.time.split(":").map(Number);

        const cRate = getRateInfoForTime(tariffForCurrent, dayOfWeek, h, m);
        const sRate = getRateInfoForTime(tariffForSim, dayOfWeek, h, m);
        const cCost = r.kwh * cRate.ratePerKwh;
        const sCost = sr.kwh * sRate.ratePerKwh;

        if (r.kwh > maxKwh) {
          maxKwh = r.kwh;
        }
        if (sr.kwh > maxKwh) {
          maxKwh = sr.kwh;
        }
        if (cCost > maxCost) {
          maxCost = cCost;
        }
        if (sCost > maxCost) {
          maxCost = sCost;
        }

        const diffKwh = sr.kwh - r.kwh;
        const diffCost = sCost - cCost;
        if (Math.abs(diffKwh) > maxDiffAbs && heatmapMode === "usage") {
          maxDiffAbs = Math.abs(diffKwh);
        }
        if (Math.abs(diffCost) > maxDiffAbs && heatmapMode === "cost") {
          maxDiffAbs = Math.abs(diffCost);
        }

        cRow.push(heatmapMode === "usage" ? r.kwh : cCost);
        sRow.push(heatmapMode === "usage" ? sr.kwh : sCost);
        dRow.push(heatmapMode === "usage" ? diffKwh : diffCost);
      }
      currentCells.push(cRow);
      simCells.push(sRow);
      diffCells.push(dRow);
    }

    // Recompute maxDiffAbs properly
    maxDiffAbs = 0;
    for (const row of diffCells) {
      for (const v of row) {
        if (Math.abs(v) > maxDiffAbs) {
          maxDiffAbs = Math.abs(v);
        }
      }
    }

    return {
      currentCells,
      simCells,
      diffCells,
      maxValue: heatmapMode === "usage" ? maxKwh : maxCost,
      maxDiffAbs,
    };
  }, [result, data, currentSettings.currentTariff, simTariff, heatmapMode]);

  return (
    <div className="space-y-6">
      {/* Config section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Simulation Setup
        </h2>
        <p className="text-xs text-gray-400 mb-5">
          Configure an alternative scenario to see how it would affect your
          costs.
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Tariff */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Simulated Tariff
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <select
                value={
                  DEFAULT_TARIFFS.find((t) => t.id === simTariff.id)?.id ||
                  "custom"
                }
                onChange={(e) => handlePresetChange(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              >
                {DEFAULT_TARIFFS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            <TariffEditor tariff={simTariff} onChange={setSimTariff} />
          </div>

          {/* Battery & EV */}
          <div className="space-y-4">
            {/* Battery */}
            <div className="p-4 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Battery</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simBattery.hasBattery}
                    onChange={(e) =>
                      setSimBattery({
                        ...simBattery,
                        hasBattery: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
              {simBattery.hasBattery && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">
                        Capacity (kWh)
                      </label>
                      <input
                        type="number"
                        value={simBattery.capacityKwh}
                        onChange={(e) =>
                          setSimBattery({
                            ...simBattery,
                            capacityKwh: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">
                        Usable: {simBattery.usablePercent}%
                      </label>
                      <input
                        type="range"
                        value={simBattery.usablePercent}
                        onChange={(e) =>
                          setSimBattery({
                            ...simBattery,
                            usablePercent: parseInt(e.target.value),
                          })
                        }
                        className="w-full mt-1"
                        min="50"
                        max="100"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-xs text-gray-500">
                        Charge Hours
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simBattery.autoDetectCheapest}
                          onChange={(e) =>
                            setSimBattery({
                              ...simBattery,
                              autoDetectCheapest: e.target.checked,
                            })
                          }
                          className="rounded"
                        />
                        Auto cheapest
                      </label>
                    </div>
                    {simBattery.autoDetectCheapest ? (
                      <p className="text-[10px] text-blue-600 bg-blue-50 rounded p-1.5">
                        {cheapest.startHour.toString().padStart(2, "0")}:
                        {cheapest.startMinute.toString().padStart(2, "0")}{" "}
                        &ndash; {cheapest.endHour.toString().padStart(2, "0")}:
                        {cheapest.endMinute.toString().padStart(2, "0")}
                      </p>
                    ) : (
                      <div className="flex items-center gap-1 text-xs">
                        <select
                          value={simBattery.chargeStartHour}
                          onChange={(e) =>
                            setSimBattery({
                              ...simBattery,
                              chargeStartHour: parseInt(e.target.value),
                            })
                          }
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {h.toString().padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        :
                        <select
                          value={simBattery.chargeStartMinute}
                          onChange={(e) =>
                            setSimBattery({
                              ...simBattery,
                              chargeStartMinute: parseInt(e.target.value),
                            })
                          }
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          <option value={0}>00</option>
                          <option value={30}>30</option>
                        </select>
                        <span className="text-gray-400">to</span>
                        <select
                          value={simBattery.chargeEndHour}
                          onChange={(e) =>
                            setSimBattery({
                              ...simBattery,
                              chargeEndHour: parseInt(e.target.value),
                            })
                          }
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          {Array.from({ length: 25 }, (_, h) => (
                            <option key={h} value={h}>
                              {h.toString().padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        :
                        <select
                          value={simBattery.chargeEndMinute}
                          onChange={(e) =>
                            setSimBattery({
                              ...simBattery,
                              chargeEndMinute: parseInt(e.target.value),
                            })
                          }
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          <option value={0}>00</option>
                          <option value={30}>30</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">
                      Min Charge: {simBattery.minChargePercent ?? 5}%
                    </label>
                    <input
                      type="range"
                      value={simBattery.minChargePercent ?? 5}
                      onChange={(e) =>
                        setSimBattery({
                          ...simBattery,
                          minChargePercent: parseInt(e.target.value),
                        })
                      }
                      className="w-full mt-1"
                      min="0"
                      max="50"
                      step="1"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>0%</span>
                      <span className="font-medium text-gray-600">
                        {(
                          (simBattery.capacityKwh *
                            (simBattery.minChargePercent ?? 5)) /
                          100
                        ).toFixed(1)}{" "}
                        kWh reserved
                      </span>
                      <span>50%</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-500">
                        Forced Discharge / Export
                      </label>
                      <button
                        onClick={() =>
                          setSimBattery({
                            ...simBattery,
                            dischargeWindows: [
                              ...(simBattery.dischargeWindows ?? []),
                              {
                                startHour: 17,
                                startMinute: 0,
                                endHour: 19,
                                endMinute: 0,
                                exportRatePerKwh: 21,
                              },
                            ],
                          })
                        }
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        + Add
                      </button>
                    </div>

                    {(simBattery.dischargeWindows ?? []).length === 0 && (
                      <p className="text-xs text-gray-400 italic">
                        No forced discharge windows.
                      </p>
                    )}

                    {(simBattery.dischargeWindows ?? []).map((dw, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 mb-2 bg-gray-50 rounded-lg p-1.5"
                      >
                        <select
                          value={dw.startHour}
                          onChange={(e) => {
                            const windows = [
                              ...(simBattery.dischargeWindows ?? []),
                            ];
                            windows[idx] = {
                              ...dw,
                              startHour: parseInt(e.target.value),
                            };
                            setSimBattery({
                              ...simBattery,
                              dischargeWindows: windows,
                            });
                          }}
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {h.toString().padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-gray-400">:</span>
                        <select
                          value={dw.startMinute}
                          onChange={(e) => {
                            const windows = [
                              ...(simBattery.dischargeWindows ?? []),
                            ];
                            windows[idx] = {
                              ...dw,
                              startMinute: parseInt(e.target.value),
                            };
                            setSimBattery({
                              ...simBattery,
                              dischargeWindows: windows,
                            });
                          }}
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          <option value={0}>00</option>
                          <option value={30}>30</option>
                        </select>
                        <span className="text-xs text-gray-400">-</span>
                        <select
                          value={dw.endHour}
                          onChange={(e) => {
                            const windows = [
                              ...(simBattery.dischargeWindows ?? []),
                            ];
                            windows[idx] = {
                              ...dw,
                              endHour: parseInt(e.target.value),
                            };
                            setSimBattery({
                              ...simBattery,
                              dischargeWindows: windows,
                            });
                          }}
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          {Array.from({ length: 25 }, (_, h) => (
                            <option key={h} value={h}>
                              {h.toString().padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-gray-400">:</span>
                        <select
                          value={dw.endMinute}
                          onChange={(e) => {
                            const windows = [
                              ...(simBattery.dischargeWindows ?? []),
                            ];
                            windows[idx] = {
                              ...dw,
                              endMinute: parseInt(e.target.value),
                            };
                            setSimBattery({
                              ...simBattery,
                              dischargeWindows: windows,
                            });
                          }}
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                        >
                          <option value={0}>00</option>
                          <option value={30}>30</option>
                        </select>
                        <span className="text-[10px] text-gray-400">@</span>
                        <input
                          type="number"
                          value={dw.exportRatePerKwh}
                          onChange={(e) => {
                            const windows = [
                              ...(simBattery.dischargeWindows ?? []),
                            ];
                            windows[idx] = {
                              ...dw,
                              exportRatePerKwh: parseFloat(e.target.value) || 0,
                            };
                            setSimBattery({
                              ...simBattery,
                              dischargeWindows: windows,
                            });
                          }}
                          className="w-14 border border-gray-200 rounded px-1 py-0.5 text-xs"
                          min="0"
                          step="0.01"
                        />
                        <span className="text-[10px] text-gray-400">c</span>
                        <button
                          onClick={() => {
                            const windows = (
                              simBattery.dischargeWindows ?? []
                            ).filter((_, i) => i !== idx);
                            setSimBattery({
                              ...simBattery,
                              dischargeWindows: windows,
                            });
                          }}
                          className="text-red-400 hover:text-red-600 text-xs ml-auto"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* EV */}
            <div className="p-4 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  EV Charging
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simEV.hasEV}
                    onChange={(e) =>
                      setSimEV({ ...simEV, hasEV: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
              {simEV.hasEV && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500">
                      Charging Speed (kW)
                    </label>
                    <input
                      type="number"
                      value={simEV.chargingSpeedKw}
                      onChange={(e) =>
                        setSimEV({
                          ...simEV,
                          chargingSpeedKw: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                      min="0"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Charging Hours
                    </label>
                    <div className="flex items-center gap-1 text-xs">
                      <select
                        value={simEV.chargingStartHour}
                        onChange={(e) =>
                          setSimEV({
                            ...simEV,
                            chargingStartHour: parseInt(e.target.value),
                          })
                        }
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {h.toString().padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                      :
                      <select
                        value={simEV.chargingStartMinute}
                        onChange={(e) =>
                          setSimEV({
                            ...simEV,
                            chargingStartMinute: parseInt(e.target.value),
                          })
                        }
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                      >
                        <option value={0}>00</option>
                        <option value={30}>30</option>
                      </select>
                      <span className="text-gray-400">to</span>
                      <select
                        value={simEV.chargingEndHour}
                        onChange={(e) =>
                          setSimEV({
                            ...simEV,
                            chargingEndHour: parseInt(e.target.value),
                          })
                        }
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                      >
                        {Array.from({ length: 25 }, (_, h) => (
                          <option key={h} value={h}>
                            {h.toString().padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                      :
                      <select
                        value={simEV.chargingEndMinute}
                        onChange={(e) =>
                          setSimEV({
                            ...simEV,
                            chargingEndMinute: parseInt(e.target.value),
                          })
                        }
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs"
                      >
                        <option value={0}>00</option>
                        <option value={30}>30</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSimulate}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              Run Simulation
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div ref={resultsRef} className="relative space-y-6">
          {stale && (
            <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[2px] rounded-xl flex items-center justify-center">
              <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-6 py-4 text-center">
                <p className="text-sm font-medium text-gray-700">
                  Parameters have changed
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Click <strong>Run Simulation</strong> to update results
                </p>
              </div>
            </div>
          )}
          {/* Cost summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Cost Comparison ({result.numDays} days)
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 font-medium">Current</p>
                <p className="text-xl font-bold text-blue-700">
                  &euro;{(result.currentTotalCostCents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-blue-500">
                  &euro;
                  {(
                    result.currentTotalCostCents /
                    100 /
                    result.numDays
                  ).toFixed(2)}
                  /day
                </p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-emerald-600 font-medium">
                  Simulated
                </p>
                <p className="text-xl font-bold text-emerald-700">
                  &euro;{(result.simulatedTotalCostCents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-emerald-500">
                  &euro;
                  {(
                    result.simulatedTotalCostCents /
                    100 /
                    result.numDays
                  ).toFixed(2)}
                  /day
                </p>
              </div>
              <div
                className={`rounded-lg p-3 ${result.savingsCents > 0 ? "bg-green-50" : result.savingsCents < 0 ? "bg-red-50" : "bg-gray-50"}`}
              >
                <p className="text-xs text-gray-500 font-medium">
                  Savings (period)
                </p>
                <p
                  className={`text-xl font-bold ${result.savingsCents > 0 ? "text-green-700" : result.savingsCents < 0 ? "text-red-700" : "text-gray-700"}`}
                >
                  &euro;{(Math.abs(result.savingsCents) / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">
                  {result.savingsPercent}%{" "}
                  {result.savingsCents > 0 ? "cheaper" : "more expensive"}
                </p>
              </div>
              <div
                className={`rounded-lg p-3 ${result.yearlySavingsCents > 0 ? "bg-green-50" : "bg-red-50"}`}
              >
                <p className="text-xs text-gray-500 font-medium">
                  Projected Yearly
                </p>
                <p
                  className={`text-xl font-bold ${result.yearlySavingsCents > 0 ? "text-green-700" : "text-red-700"}`}
                >
                  &euro;{(Math.abs(result.yearlySavingsCents) / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">
                  {result.yearlySavingsCents > 0 ? "savings" : "extra cost"}
                  /year
                </p>
              </div>
              {result.exportRevenueCents > 0 && (
                <div className="rounded-lg p-3 bg-purple-50">
                  <p className="text-xs text-gray-500 font-medium">
                    Grid Export Revenue
                  </p>
                  <p className="text-xl font-bold text-purple-700">
                    &euro;
                    {(result.exportRevenueCents / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">
                    over {result.numDays} day
                    {result.numDays !== 1 ? "s" : ""} (&euro;
                    {(
                      (result.exportRevenueCents / result.numDays / 100) *
                      365
                    ).toFixed(2)}
                    /year)
                  </p>
                </div>
              )}
            </div>

            {/* Bar chart */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Cost Over Time
              </h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {GRANULARITY_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setGranularity(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                      ${granularity === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Cost (\u20ac)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12 },
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `\u20ac${Number(value).toFixed(2)}`,
                    name === "current" ? "Current" : "Simulated",
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend />
                <Bar
                  dataKey="current"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  name="Current"
                />
                <Bar
                  dataKey="simulated"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  name="Simulated"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Heatmaps */}
          {heatmapData && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  Usage Heatmaps
                </h3>
                <div className="flex gap-2">
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    {(
                      ["current", "simulated", "difference"] as HeatmapView[]
                    ).map((v) => (
                      <button
                        key={v}
                        onClick={() => setHeatmapView(v)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize
                          ${heatmapView === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    {(["usage", "cost"] as HeatmapMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setHeatmapMode(m)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize
                          ${heatmapMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {m === "usage" ? "kWh" : "Cost"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Time header */}
                  <div className="flex items-center mb-1">
                    <div className="w-24 shrink-0" />
                    <div className="flex-1 flex">
                      {TIME_SLOTS.map((t, i) => (
                        <div
                          key={t}
                          className="flex-1 text-center"
                          style={{ minWidth: 14 }}
                        >
                          {i % 4 === 0 ? (
                            <span className="text-[9px] text-gray-400">
                              {t}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rows */}
                  {(() => {
                    let lastYear = "";
                    return data.days.map((day, dayIdx) => {
                      const cells =
                        heatmapView === "current"
                          ? heatmapData.currentCells[dayIdx]
                          : heatmapView === "simulated"
                            ? heatmapData.simCells[dayIdx]
                            : heatmapData.diffCells[dayIdx];
                      const date = parseISO(day.date);
                      const year = format(date, "yyyy");
                      const showYear = year !== lastYear;
                      if (showYear) {
                        lastYear = year;
                      }

                      return (
                        <div key={day.date} className="flex items-center mb-px">
                          <div className="w-24 shrink-0 text-[10px] text-gray-500 pr-2 text-right truncate">
                            {showYear
                              ? format(date, "EEE dd MMM yyyy")
                              : format(date, "EEE dd MMM")}
                          </div>
                          <div className="flex-1 flex">
                            {cells.map((val, i) => {
                              const color =
                                heatmapView === "difference"
                                  ? getDiffColor(val, heatmapData.maxDiffAbs)
                                  : getScaledColor(
                                      val,
                                      heatmapData.maxValue,
                                      heatmapMode === "usage"
                                        ? USAGE_SCALE
                                        : COST_SCALE,
                                    );
                              return (
                                <div
                                  key={i}
                                  className="flex-1 h-[18px] border-r border-b border-white/50"
                                  style={{
                                    backgroundColor: color,
                                    minWidth: 14,
                                  }}
                                  title={
                                    heatmapView === "difference"
                                      ? `${day.readings[i]?.time}: ${heatmapMode === "usage" ? `${val.toFixed(3)} kWh` : `${(val / 100).toFixed(4)} \u20ac`} ${val > 0 ? "(more)" : val < 0 ? "(less)" : ""}`
                                      : `${day.readings[i]?.time}: ${heatmapMode === "usage" ? `${val.toFixed(3)} kWh` : `${(val / 100).toFixed(4)} \u20ac`}`
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 mt-4 text-[10px] text-gray-500">
                {heatmapView === "difference" ? (
                  <>
                    <span>Cheaper</span>
                    <div className="flex h-3">
                      {[...DIFF_SCALE_NEGATIVE]
                        .reverse()
                        .concat(["#f9fafb"], DIFF_SCALE_POSITIVE)
                        .map((c, i) => (
                          <div
                            key={i}
                            className="w-4 h-full"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                    </div>
                    <span>More Expensive</span>
                  </>
                ) : (
                  <>
                    <span>Low</span>
                    <div className="flex h-3">
                      {(heatmapMode === "usage" ? USAGE_SCALE : COST_SCALE).map(
                        (c) => (
                          <div
                            key={c}
                            className="w-6 h-full"
                            style={{ backgroundColor: c }}
                          />
                        ),
                      )}
                    </div>
                    <span>High</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
