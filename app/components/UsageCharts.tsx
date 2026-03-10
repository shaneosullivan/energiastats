"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { EnergyData, Tariff } from "../lib/types";
import {
  getDailyTotals,
  getWeeklyTotals,
  getMonthlyTotals,
  getHourlyAverage,
  getHalfHourlyForDay,
  getRateInfoForTime,
  getTariffRatePeriods,
} from "../lib/analytics";
import { format, parseISO, isWeekend, getDay } from "date-fns";

interface Props {
  data: EnergyData;
  currentTariff: Tariff;
}

type View = "daily" | "weekly" | "monthly" | "hourly" | "dayDetail";

const TABS: { key: View; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "weekly", label: "Weekly" },
  { key: "daily", label: "Daily" },
  { key: "hourly", label: "Hourly Avg" },
  { key: "dayDetail", label: "Day Detail" },
];

interface DayDetailEntry {
  time: string;
  kwh: number;
  rateLabel: string;
  ratePerKwh: number;
  cost: number;
  color: string;
}

export default function UsageCharts({ data, currentTariff }: Props) {
  const [view, setView] = useState<View>("monthly");
  const [selectedDay, setSelectedDay] = useState(
    data.days[data.days.length - 1]?.date || "",
  );
  const [showTotal, setShowTotal] = useState(true);
  const [showDailyAvg, setShowDailyAvg] = useState(true);

  const daily = getDailyTotals(data);
  const weekly = getWeeklyTotals(data);
  const monthly = getMonthlyTotals(data);
  const hourly = getHourlyAverage(data);
  const dayDetail = data.days.find((d) => d.date === selectedDay);

  // Build day detail data with tariff-based coloring and cost
  const dayDetailData = useMemo((): DayDetailEntry[] => {
    if (!dayDetail) {
      return [];
    }
    const date = parseISO(dayDetail.date);
    const dayOfWeek = getDay(date);

    return getHalfHourlyForDay(dayDetail).map((entry) => {
      const [h, m] = entry.time.split(":").map(Number);
      const rateInfo = getRateInfoForTime(currentTariff, dayOfWeek, h, m);
      const cost = entry.kwh * rateInfo.ratePerKwh; // in cents
      return {
        time: entry.time,
        kwh: entry.kwh,
        rateLabel: rateInfo.label,
        ratePerKwh: rateInfo.ratePerKwh,
        cost: Math.round(cost * 100) / 100,
        color: rateInfo.color,
      };
    });
  }, [dayDetail, currentTariff]);

  // Get legend items from tariff rate periods
  const ratePeriods = useMemo(
    () => getTariffRatePeriods(currentTariff),
    [currentTariff],
  );

  // Custom tooltip for day detail
  const DayDetailTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: DayDetailEntry }>;
  }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const entry = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
        <p className="font-medium text-gray-800">{entry.time}</p>
        <p className="text-gray-600">{entry.kwh} kWh</p>
        <p className="text-gray-600">
          Rate: {entry.rateLabel} ({entry.ratePerKwh} c/kWh)
        </p>
        <p className="font-medium text-gray-800">
          Cost: {(entry.cost / 100).toFixed(4)} €
        </p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Usage Charts</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                ${view === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === "daily" && (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={daily}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{
                value: "kWh",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12 },
              }}
            />
            <Tooltip
              formatter={(value) => [`${value} kWh`, "Usage"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="kwh" radius={[4, 4, 0, 0]}>
              {daily.map((entry, i) => (
                <Cell
                  key={i}
                  fill={isWeekend(parseISO(entry.date)) ? "#818cf8" : "#3b82f6"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === "weekly" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              Compare total weekly usage with the daily average for each week.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTotal((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${showTotal ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ backgroundColor: showTotal ? "#3b82f6" : "#d1d5db" }}
                />
                Week Total
              </button>
              <button
                onClick={() => setShowDailyAvg((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${showDailyAvg ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{
                    backgroundColor: showDailyAvg ? "#93c5fd" : "#d1d5db",
                  }}
                />
                Daily Average
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={weekly}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                label={{
                  value: "Week",
                  position: "insideBottom",
                  offset: -2,
                  style: { fontSize: 12, fill: "#9ca3af" },
                }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: "kWh",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12 },
                }}
              />
              <Tooltip
                formatter={(value, name) => [`${value} kWh`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {showTotal && (
                <Bar
                  dataKey="kwh"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  name="Week Total (kWh)"
                />
              )}
              {showDailyAvg && (
                <Bar
                  dataKey="avgDaily"
                  fill="#93c5fd"
                  radius={[4, 4, 0, 0]}
                  name="Daily Average (kWh)"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "monthly" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              Compare total monthly usage with the daily average for each month.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTotal((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${showTotal ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ backgroundColor: showTotal ? "#3b82f6" : "#d1d5db" }}
                />
                Month Total
              </button>
              <button
                onClick={() => setShowDailyAvg((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${showDailyAvg ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{
                    backgroundColor: showDailyAvg ? "#93c5fd" : "#d1d5db",
                  }}
                />
                Daily Average
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={monthly}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                label={{
                  value: "Month",
                  position: "insideBottom",
                  offset: -2,
                  style: { fontSize: 12, fill: "#9ca3af" },
                }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: "kWh",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12 },
                }}
              />
              <Tooltip
                formatter={(value, name) => [`${value} kWh`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {showTotal && (
                <Bar
                  dataKey="kwh"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  name="Month Total (kWh)"
                />
              )}
              {showDailyAvg && (
                <Bar
                  dataKey="avgDaily"
                  fill="#93c5fd"
                  radius={[4, 4, 0, 0]}
                  name="Daily Average (kWh)"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "hourly" && (
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart
            data={hourly}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <defs>
              <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{
                value: "Avg kWh (per 30min)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11 },
              }}
            />
            <Tooltip
              formatter={(value) => [`${value} kWh`, "Avg per 30-min slot"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Area
              type="monotone"
              dataKey="avgKwh"
              stroke="#3b82f6"
              fill="url(#hourGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {view === "dayDetail" && (
        <div>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div>
              <label className="text-sm text-gray-500 mr-2">Select day:</label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                {data.days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {format(parseISO(d.date), "EEEE, dd MMM yyyy")} —{" "}
                    {d.totalKwh.toFixed(1)} kWh
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-gray-400">
              Colors and costs reflect:{" "}
              <strong className="text-gray-600">{currentTariff.name}</strong>
            </span>
          </div>
          {dayDetail && dayDetailData.length > 0 && (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={dayDetailData}
                margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "kWh",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12 },
                  }}
                />
                <Tooltip content={<DayDetailTooltip />} />
                <Bar dataKey="kwh" radius={[3, 3, 0, 0]}>
                  {dayDetailData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Dynamic legend from tariff rate periods */}
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
            {ratePeriods.map((rp) => (
              <span key={rp.label} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded inline-block"
                  style={{ backgroundColor: rp.color }}
                />
                {rp.label} ({rp.ratePerKwh} c/kWh)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
