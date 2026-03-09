'use client';

import { useMemo, useState, useCallback } from 'react';
import { EnergyData, Tariff } from '../lib/types';
import { getRateInfoForTime } from '../lib/analytics';
import { format, parseISO, getDay } from 'date-fns';

interface Props {
  data: EnergyData;
  currentTariff: Tariff;
}

interface TooltipData {
  date: string;
  time: string;
  kwh: number;
  cost: number;
  rateLabel: string;
  ratePerKwh: number;
  x: number;
  y: number;
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

export default function HeatmapView({ data, currentTariff }: Props) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const maxKwh = useMemo(() => {
    let max = 0;
    for (const day of data.days) {
      for (const r of day.readings) {
        if (r.kwh > max) max = r.kwh;
      }
    }
    return max;
  }, [data]);

  const handleCellEnter = useCallback((e: React.MouseEvent, date: string, time: string, kwh: number) => {
    const parsed = parseISO(date);
    const dayOfWeek = getDay(parsed);
    const [h, m] = time.split(':').map(Number);
    const rateInfo = getRateInfoForTime(currentTariff, dayOfWeek, h, m);
    const cost = kwh * rateInfo.ratePerKwh; // cents

    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget.closest('.overflow-x-auto')!.getBoundingClientRect();
    setTooltip({
      date: format(parsed, 'EEE dd MMM yyyy'),
      time,
      kwh,
      cost: Math.round(cost * 100) / 100,
      rateLabel: rateInfo.label,
      ratePerKwh: rateInfo.ratePerKwh,
      x: rect.left - container.left + rect.width / 2,
      y: rect.top - container.top,
    });
  }, [currentTariff]);

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Usage Heatmap</h2>
      <p className="text-xs text-gray-400 mb-3">Each cell is a 30-minute slot. Darker = higher usage.</p>

      <div className="overflow-x-auto relative">
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
                    onMouseEnter={(e) => handleCellEnter(e, day.date, r.time, r.kwh)}
                    onMouseLeave={handleCellLeave}
                  />
                ))}
              </div>
              <div className="w-16 shrink-0 text-right text-[10px] text-gray-500 pl-2">
                {day.totalKwh.toFixed(1)}
              </div>
            </div>
          ))}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs -translate-x-1/2 -translate-y-full"
            style={{ left: tooltip.x, top: tooltip.y - 4 }}
          >
            <p className="font-medium text-gray-800">{tooltip.date} — {tooltip.time}</p>
            <p className="text-gray-600">{tooltip.kwh} kWh</p>
            <p className="text-gray-600">
              Rate: {tooltip.rateLabel} ({tooltip.ratePerKwh} c/kWh)
            </p>
            <p className="font-medium text-gray-800">
              Cost: {(tooltip.cost / 100).toFixed(4)} €
            </p>
          </div>
        )}
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
