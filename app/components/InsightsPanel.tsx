'use client';

import { useMemo } from 'react';
import { EnergyData, Tariff } from '../lib/types';
import { detectTrends, getTariffTimeOfUseBreakdown } from '../lib/analytics';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  data: EnergyData;
  currentTariff: Tariff;
}

export default function InsightsPanel({ data, currentTariff }: Props) {
  const insights = useMemo(() => detectTrends(data), [data]);
  const tou = useMemo(() => getTariffTimeOfUseBreakdown(data, currentTariff), [data, currentTariff]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Insights & Trends</h2>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Insights list */}
        <div className="md:col-span-2 space-y-3">
          {insights.map((insight, i) => (
            <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
              <span className="text-blue-500 shrink-0 mt-0.5 text-sm">&#8226;</span>
              <p className="text-sm text-gray-700">{insight}</p>
            </div>
          ))}
        </div>

        {/* Time-of-use pie */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Usage by Tariff Period</h3>
          <p className="text-[10px] text-gray-400 mb-3">{currentTariff.name}</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tou} dataKey="kwh" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                {tou.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const entry = tou.find(t => t.name === name);
                  const costStr = entry ? ` (€${entry.cost.toFixed(2)})` : '';
                  return [`${value} kWh${costStr}`, name];
                }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {tou.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-gray-600 flex-1">{t.name}</span>
                <span className="text-gray-500">€{t.cost.toFixed(2)}</span>
                <span className="font-medium text-gray-700 w-10 text-right">{t.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
