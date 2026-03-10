"use client";

import { EnergyData } from "../lib/types";
import { getWeekdayVsWeekend, getTimeOfUseBreakdown } from "../lib/analytics";

interface Props {
  data: EnergyData;
}

function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function OverviewCards({ data }: Props) {
  const totalKwh = data.days.reduce((s, d) => s + d.totalKwh, 0);
  const avgDaily = totalKwh / data.days.length;
  const weekdayWeekend = getWeekdayVsWeekend(data);
  const tou = getTimeOfUseBreakdown(data);

  const sorted = [...data.days].sort((a, b) => b.totalKwh - a.totalKwh);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  const dateRange = `${data.days[0]?.date} to ${data.days[data.days.length - 1]?.date}`;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Overview</h2>
        <p className="text-sm text-gray-400">
          {dateRange} &middot; {data.days.length} days &middot; MPRN:{" "}
          {data.mprn}
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Usage"
          value={`${totalKwh.toFixed(1)} kWh`}
          subtitle={`${data.days.length} days`}
        />
        <StatCard
          title="Daily Average"
          value={`${avgDaily.toFixed(1)} kWh`}
          subtitle="per day"
        />
        <StatCard
          title="Weekday Avg"
          value={`${weekdayWeekend.weekday.avgKwh} kWh`}
          subtitle={`${weekdayWeekend.weekday.count} days`}
        />
        <StatCard
          title="Weekend Avg"
          value={`${weekdayWeekend.weekend.avgKwh} kWh`}
          subtitle={`${weekdayWeekend.weekend.count} days`}
        />
        <StatCard
          title="Night Usage"
          value={`${tou[0].percent}%`}
          subtitle={`${tou[0].kwh} kWh`}
          color="text-indigo-600"
        />
        <StatCard
          title="Day Usage"
          value={`${tou[1].percent}%`}
          subtitle={`${tou[1].kwh} kWh`}
          color="text-amber-600"
        />
        <StatCard
          title="Peak Usage"
          value={`${tou[2].percent}%`}
          subtitle={`${tou[2].kwh} kWh`}
          color="text-red-600"
        />
        <StatCard
          title="Highest Day"
          value={`${highest.totalKwh.toFixed(1)} kWh`}
          subtitle={highest.date}
          color="text-red-500"
        />
      </div>
    </div>
  );
}
