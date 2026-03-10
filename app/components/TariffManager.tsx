"use client";

import { useState, useMemo } from "react";
import { EnergyData, Tariff, TimePeriodRate, RateTier } from "../lib/types";
import { DEFAULT_TARIFFS, compareTariffs } from "../lib/analytics";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";

interface Props {
  data: EnergyData;
  currentTariff: Tariff;
  onCurrentTariffChange: (tariff: Tariff) => void;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function TierEditor({
  tiers,
  onChange,
}: {
  tiers: RateTier[];
  onChange: (tiers: RateTier[]) => void;
}) {
  const addTier = () => {
    onChange([
      ...tiers,
      { unitLimit: null, ratePerKwh: 10, label: "High Usage" },
    ]);
  };

  const removeTier = (index: number) => {
    onChange(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (
    index: number,
    field: string,
    value: string | number | null,
  ) => {
    const updated = [...tiers];
    if (field === "unitLimit") {
      updated[index] = {
        ...updated[index],
        unitLimit:
          value === "" || value === null
            ? null
            : parseFloat(value as string) || 0,
      };
    } else if (field === "label") {
      updated[index] = { ...updated[index], label: value as string };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: parseFloat(value as string) || 0,
      };
    }
    onChange(updated);
  };

  return (
    <div className="ml-4 pl-3 border-l-2 border-amber-200 space-y-1.5 mt-1.5">
      <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wide">
        Pricing Tiers (across billing period)
      </p>
      {tiers.map((tier, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-400">{i === 0 ? "First" : "Next"}</span>
          <input
            type="text"
            value={tier.unitLimit === null ? "" : tier.unitLimit}
            onChange={(e) => updateTier(i, "unitLimit", e.target.value)}
            className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
            placeholder="∞"
            title="Leave empty for unlimited"
          />
          <span className="text-gray-400">units @</span>
          <input
            type="number"
            value={tier.ratePerKwh}
            onChange={(e) => updateTier(i, "ratePerKwh", e.target.value)}
            className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
            step="0.01"
          />
          <span className="text-gray-400">c/kWh</span>
          <input
            type="text"
            value={tier.label}
            onChange={(e) => updateTier(i, "label", e.target.value)}
            className="w-20 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
            placeholder="Label"
          />
          <button
            onClick={() => removeTier(i)}
            className="text-red-400 hover:text-red-600 text-[10px]"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addTier}
        className="text-[10px] text-amber-600 hover:text-amber-800 font-medium"
      >
        + Add Tier
      </button>
    </div>
  );
}

export function RateEditor({
  rates,
  onChange,
}: {
  rates: TimePeriodRate[];
  onChange: (rates: TimePeriodRate[]) => void;
}) {
  const addRate = () => {
    onChange([
      ...rates,
      {
        startHour: 8,
        startMinute: 0,
        endHour: 23,
        endMinute: 0,
        ratePerKwh: 20,
        label: "New Rate",
      },
    ]);
  };

  const removeRate = (index: number) => {
    onChange(rates.filter((_, i) => i !== index));
  };

  const updateRate = (index: number, field: string, value: string | number) => {
    const updated = [...rates];
    updated[index] = {
      ...updated[index],
      [field]:
        typeof value === "string" && field !== "label"
          ? parseFloat(value) || 0
          : value,
    };
    onChange(updated);
  };

  const toggleTiers = (index: number) => {
    const updated = [...rates];
    if (updated[index].tiers && updated[index].tiers!.length > 0) {
      // Remove tiers
      updated[index] = { ...updated[index], tiers: undefined };
    } else {
      // Add default tiers based on current rate
      updated[index] = {
        ...updated[index],
        tiers: [
          {
            unitLimit: 1000,
            ratePerKwh: updated[index].ratePerKwh,
            label: updated[index].label,
          },
          {
            unitLimit: null,
            ratePerKwh: updated[index].ratePerKwh * 1.2,
            label: `${updated[index].label} High Usage`,
          },
        ],
      };
    }
    onChange(updated);
  };

  const updateTiers = (index: number, tiers: RateTier[]) => {
    const updated = [...rates];
    updated[index] = { ...updated[index], tiers };
    // Keep ratePerKwh synced with first tier for display purposes
    if (tiers.length > 0) {
      updated[index].ratePerKwh = tiers[0].ratePerKwh;
    }
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {rates.map((rate, i) => {
        const hasTiers = rate.tiers && rate.tiers.length > 0;
        return (
          <div key={i} className="p-2 bg-gray-50 rounded-lg text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={rate.label}
                onChange={(e) => updateRate(i, "label", e.target.value)}
                className="w-24 border border-gray-200 rounded px-2 py-1 text-xs"
                placeholder="Label"
              />
              <span className="text-xs text-gray-400">from</span>
              <select
                value={rate.startHour}
                onChange={(e) => updateRate(i, "startHour", e.target.value)}
                className="border border-gray-200 rounded px-1 py-1 text-xs"
              >
                {Array.from({ length: 25 }, (_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">:</span>
              <select
                value={rate.startMinute}
                onChange={(e) => updateRate(i, "startMinute", e.target.value)}
                className="border border-gray-200 rounded px-1 py-1 text-xs"
              >
                <option value={0}>00</option>
                <option value={30}>30</option>
              </select>
              <span className="text-xs text-gray-400">to</span>
              <select
                value={rate.endHour}
                onChange={(e) => updateRate(i, "endHour", e.target.value)}
                className="border border-gray-200 rounded px-1 py-1 text-xs"
              >
                {Array.from({ length: 25 }, (_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">:</span>
              <select
                value={rate.endMinute}
                onChange={(e) => updateRate(i, "endMinute", e.target.value)}
                className="border border-gray-200 rounded px-1 py-1 text-xs"
              >
                <option value={0}>00</option>
                <option value={30}>30</option>
              </select>
              {!hasTiers && (
                <>
                  <span className="text-xs text-gray-400">@</span>
                  <input
                    type="number"
                    value={rate.ratePerKwh}
                    onChange={(e) =>
                      updateRate(i, "ratePerKwh", e.target.value)
                    }
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                    step="0.01"
                  />
                  <span className="text-xs text-gray-400">c/kWh</span>
                </>
              )}
              <div className="flex gap-2 ml-auto items-center">
                <button
                  onClick={() => toggleTiers(i)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasTiers ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-gray-400 hover:text-gray-600"}`}
                  title="Toggle tiered pricing (price changes after a certain number of units)"
                >
                  {hasTiers ? "Tiered ✓" : "Add Tiers"}
                </button>
                <button
                  onClick={() => removeRate(i)}
                  className="text-red-400 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>
            </div>
            {hasTiers && (
              <TierEditor
                tiers={rate.tiers!}
                onChange={(tiers) => updateTiers(i, tiers)}
              />
            )}
          </div>
        );
      })}
      <button
        onClick={addRate}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        + Add Rate Period
      </button>
    </div>
  );
}

export function TariffEditor({
  tariff,
  onChange,
}: {
  tariff: Tariff;
  onChange: (t: Tariff) => void;
}) {
  const update = (field: string, value: unknown) => {
    onChange({ ...tariff, [field]: value });
  };

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-xl bg-white">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Name</label>
          <input
            type="text"
            value={tariff.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Provider</label>
          <input
            type="text"
            value={tariff.provider}
            onChange={(e) => update("provider", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">
            Standing Charge (c/day)
          </label>
          <input
            type="number"
            value={tariff.standingCharge}
            onChange={(e) =>
              update("standingCharge", parseFloat(e.target.value) || 0)
            }
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            step="0.01"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">PSO Levy (c/day)</label>
          <input
            type="number"
            value={tariff.psoLevy}
            onChange={(e) => update("psoLevy", parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            step="0.01"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500">Schedule Type</label>
        <select
          value={tariff.scheduleType}
          onChange={(e) => {
            const type = e.target.value as Tariff["scheduleType"];
            const base: Partial<Tariff> = { scheduleType: type };
            if (type === "uniform" && !tariff.uniformSchedule) {
              base.uniformSchedule = {
                rates: [
                  {
                    startHour: 0,
                    startMinute: 0,
                    endHour: 24,
                    endMinute: 0,
                    ratePerKwh: 24,
                    label: "Standard",
                  },
                ],
              };
            }
            if (type === "weekday_weekend") {
              if (!tariff.weekdaySchedule) {
                base.weekdaySchedule = {
                  rates: [
                    {
                      startHour: 0,
                      startMinute: 0,
                      endHour: 24,
                      endMinute: 0,
                      ratePerKwh: 24,
                      label: "Standard",
                    },
                  ],
                };
              }
              if (!tariff.weekendSchedule) {
                base.weekendSchedule = {
                  rates: [
                    {
                      startHour: 0,
                      startMinute: 0,
                      endHour: 24,
                      endMinute: 0,
                      ratePerKwh: 24,
                      label: "Standard",
                    },
                  ],
                };
              }
            }
            onChange({ ...tariff, ...base });
          }}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="uniform">Same every day</option>
          <option value="weekday_weekend">Weekday / Weekend</option>
          <option value="custom">Custom per day</option>
        </select>
      </div>

      {tariff.scheduleType === "uniform" && tariff.uniformSchedule && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Rate Periods</p>
          <RateEditor
            rates={tariff.uniformSchedule.rates}
            onChange={(rates) => update("uniformSchedule", { rates })}
          />
        </div>
      )}

      {tariff.scheduleType === "weekday_weekend" && (
        <>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Weekday Rates
            </p>
            <RateEditor
              rates={tariff.weekdaySchedule?.rates || []}
              onChange={(rates) => update("weekdaySchedule", { rates })}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Weekend Rates
            </p>
            <RateEditor
              rates={tariff.weekendSchedule?.rates || []}
              onChange={(rates) => update("weekendSchedule", { rates })}
            />
          </div>
        </>
      )}

      {/* Free day */}
      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
        <input
          type="checkbox"
          checked={tariff.freeDay?.enabled || false}
          onChange={(e) =>
            update("freeDay", {
              enabled: e.target.checked,
              dayOfWeek: tariff.freeDay?.dayOfWeek ?? 6,
            })
          }
          className="rounded"
        />
        <span className="text-sm text-gray-700">Free electricity day</span>
        {tariff.freeDay?.enabled && (
          <select
            value={tariff.freeDay.dayOfWeek}
            onChange={(e) =>
              update("freeDay", {
                enabled: true,
                dayOfWeek: parseInt(e.target.value),
              })
            }
            className="border border-gray-200 rounded px-2 py-1 text-xs"
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default function TariffManager({
  data,
  currentTariff,
  onCurrentTariffChange,
}: Props) {
  const setCurrentTariff = onCurrentTariffChange;
  const [altTariff, setAltTariff] = useState<Tariff>(DEFAULT_TARIFFS[1]);
  const [currentPreset, setCurrentPreset] = useState(currentTariff.id);
  const [altPreset, setAltPreset] = useState(DEFAULT_TARIFFS[1].id);

  const comparison = useMemo(
    () => compareTariffs(data, currentTariff, altTariff),
    [data, currentTariff, altTariff],
  );

  const dailyCostComparison = useMemo(() => {
    return comparison.current.dailyCosts.map((c, i) => ({
      date: c.date.substring(5), // "01-15"
      current: c.cost / 100, // convert to euro
      alternative: (comparison.alternative.dailyCosts[i]?.cost || 0) / 100,
    }));
  }, [comparison]);

  const handlePresetChange = (preset: string, which: "current" | "alt") => {
    const found = DEFAULT_TARIFFS.find((t) => t.id === preset);
    if (found) {
      if (which === "current") {
        setCurrentPreset(preset);
        setCurrentTariff(JSON.parse(JSON.stringify(found)));
      } else {
        setAltPreset(preset);
        setAltTariff(JSON.parse(JSON.stringify(found)));
      }
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">
        Tariff Comparison
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Configure your current tariff and compare against alternatives. All
        rates in cent/kWh, charges in cent/day. Use &ldquo;Add Tiers&rdquo; for
        rates that change after a set number of units in the billing period.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Current tariff */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-700">
              Current Tariff
            </h3>
            <select
              value={currentPreset}
              onChange={(e) => handlePresetChange(e.target.value, "current")}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            >
              {DEFAULT_TARIFFS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </div>
          <TariffEditor tariff={currentTariff} onChange={setCurrentTariff} />
        </div>

        {/* Alternative tariff */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-emerald-700">
              Alternative Tariff
            </h3>
            <select
              value={altPreset}
              onChange={(e) => handlePresetChange(e.target.value, "alt")}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            >
              {DEFAULT_TARIFFS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </div>
          <TariffEditor tariff={altTariff} onChange={setAltTariff} />
        </div>
      </div>

      {/* Comparison results */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Cost Comparison ({data.days.length} days of data)
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600 font-medium">
              {currentTariff.name}
            </p>
            <p className="text-xl font-bold text-blue-700">
              &euro;{comparison.current.totalCostEuro.toFixed(2)}
            </p>
            <p className="text-xs text-blue-500">
              &euro;{comparison.current.avgDailyCostEuro.toFixed(2)}/day
            </p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs text-emerald-600 font-medium">
              {altTariff.name}
            </p>
            <p className="text-xl font-bold text-emerald-700">
              &euro;{comparison.alternative.totalCostEuro.toFixed(2)}
            </p>
            <p className="text-xs text-emerald-500">
              &euro;{comparison.alternative.avgDailyCostEuro.toFixed(2)}/day
            </p>
          </div>
          <div
            className={`rounded-lg p-3 ${comparison.savingsEuro > 0 ? "bg-green-50" : comparison.savingsEuro < 0 ? "bg-red-50" : "bg-gray-50"}`}
          >
            <p className="text-xs text-gray-500 font-medium">
              Savings (this period)
            </p>
            <p
              className={`text-xl font-bold ${comparison.savingsEuro > 0 ? "text-green-700" : comparison.savingsEuro < 0 ? "text-red-700" : "text-gray-700"}`}
            >
              &euro;{Math.abs(comparison.savingsEuro).toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">
              {comparison.savingsPercent}%{" "}
              {comparison.savingsEuro > 0 ? "cheaper" : "more expensive"}
            </p>
          </div>
          <div
            className={`rounded-lg p-3 ${comparison.yearlySavingsEuro > 0 ? "bg-green-50" : "bg-red-50"}`}
          >
            <p className="text-xs text-gray-500 font-medium">
              Projected Yearly
            </p>
            <p
              className={`text-xl font-bold ${comparison.yearlySavingsEuro > 0 ? "text-green-700" : "text-red-700"}`}
            >
              &euro;{Math.abs(comparison.yearlySavingsEuro).toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">
              {comparison.yearlySavingsEuro > 0 ? "savings" : "extra cost"}/year
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
          {comparison.recommendation}
        </p>

        {/* Daily cost chart */}
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={dailyCostComparison}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{
                value: "Cost (€)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12 },
              }}
            />
            <Tooltip
              formatter={(value, name) => [
                `€${Number(value).toFixed(2)}`,
                name === "current" ? currentTariff.name : altTariff.name,
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="current"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name={currentTariff.name}
            />
            <Line
              type="monotone"
              dataKey="alternative"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name={altTariff.name}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
