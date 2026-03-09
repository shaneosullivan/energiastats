'use client';

import { useMemo } from 'react';
import { EnergyData } from '../lib/types';
import { detectTrends, getTimeOfUseBreakdown } from '../lib/analytics';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Props {
  data: EnergyData;
}

const TOU_COLORS = ['#6366f1', '#f59e0b', '#ef4444'];

export default function InsightsPanel({ data }: Props) {
  const insights = useMemo(() => detectTrends(data), [data]);
  const tou = useMemo(() => getTimeOfUseBreakdown(data), [data]);

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
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Time-of-Use Split</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tou} dataKey="kwh" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                {tou.map((_, i) => (
                  <Cell key={i} fill={TOU_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value} kWh`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {tou.map((t, i) => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TOU_COLORS[i] }} />
                <span className="text-gray-600 flex-1">{t.name}</span>
                <span className="font-medium text-gray-700">{t.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
