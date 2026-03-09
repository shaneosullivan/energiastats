'use client';

import { useMemo } from 'react';
import { EnergyData } from '../lib/types';
import { format, parseISO } from 'date-fns';

interface Props {
  data: EnergyData;
}

const TIME_SLOTS = [
  '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30',
  '04:00', '04:30', '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
];

function getColor(kwh: number, maxKwh: number): string {
  if (kwh === 0) return '#f9fafb';
  const intensity = Math.min(kwh / maxKwh, 1);
  if (intensity < 0.2) return '#dbeafe';
  if (intensity < 0.4) return '#93c5fd';
  if (intensity < 0.6) return '#3b82f6';
  if (intensity < 0.8) return '#1d4ed8';
  return '#1e3a5f';
}

export default function HeatmapView({ data }: Props) {
  const maxKwh = useMemo(() => {
    let max = 0;
    for (const day of data.days) {
      for (const r of day.readings) {
        if (r.kwh > max) max = r.kwh;
      }
    }
    return max;
  }, [data]);

  // Show only every other time label for readability
  const timeLabels = TIME_SLOTS.filter((_, i) => i % 4 === 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Usage Heatmap</h2>
      <p className="text-xs text-gray-400 mb-3">Each cell is a 30-minute slot. Darker = higher usage.</p>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Time header */}
          <div className="flex items-center mb-1">
            <div className="w-24 shrink-0" />
            <div className="flex-1 flex">
              {TIME_SLOTS.map((t, i) => (
                <div key={t} className="flex-1 text-center" style={{ minWidth: 14 }}>
                  {i % 4 === 0 ? (
                    <span className="text-[9px] text-gray-400">{t.substring(0, 5)}</span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="w-16 shrink-0 text-right">
              <span className="text-[9px] text-gray-400 font-medium">Total</span>
            </div>
          </div>

          {/* Rows */}
          {data.days.map(day => (
            <div key={day.date} className="flex items-center mb-px">
              <div className="w-24 shrink-0 text-[10px] text-gray-500 pr-2 text-right truncate">
                {format(parseISO(day.date), 'EEE dd MMM')}
              </div>
              <div className="flex-1 flex">
                {day.readings.map((r, i) => (
                  <div
                    key={i}
                    className="flex-1 h-[18px] border-r border-b border-white/50"
                    style={{ backgroundColor: getColor(r.kwh, maxKwh), minWidth: 14 }}
                    title={`${day.date} ${r.time}: ${r.kwh} kWh`}
                  />
                ))}
              </div>
              <div className="w-16 shrink-0 text-right text-[10px] text-gray-500 pl-2">
                {day.totalKwh.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 text-[10px] text-gray-500">
        <span>Low</span>
        <div className="flex h-3">
          {['#f9fafb', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a5f'].map(c => (
            <div key={c} className="w-6 h-full" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
