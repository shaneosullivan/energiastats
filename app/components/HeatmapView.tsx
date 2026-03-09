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

type HeatmapMode = 'usage' | 'cost';

const TIME_SLOTS = [
  '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30',
  '04:00', '04:30', '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
];

const USAGE_SCALE = ['#f9fafb', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a5f'];
const COST_SCALE = ['#f9fafb', '#dcfce7', '#86efac', '#22c55e', '#15803d', '#14532d'];

function getScaledColor(value: number, max: number, scale: string[]): string {
  if (value === 0) return scale[0];
  const intensity = Math.min(value / max, 1);
  if (intensity < 0.2) return scale[1];
  if (intensity < 0.4) return scale[2];
  if (intensity < 0.6) return scale[3];
  if (intensity < 0.8) return scale[4];
  return scale[5];
}

export default function HeatmapView({ data, currentTariff }: Props) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [mode, setMode] = useState<HeatmapMode>('usage');

  // Pre-compute cost for every cell and track maximums
  const { costGrid, maxKwh, maxCost } = useMemo(() => {
    let mKwh = 0;
    let mCost = 0;
    const grid: number[][] = [];

    for (const day of data.days) {
      const parsed = parseISO(day.date);
      const dayOfWeek = getDay(parsed);
      const dayCosts: number[] = [];

      for (const r of day.readings) {
        if (r.kwh > mKwh) mKwh = r.kwh;
        const [h, m] = r.time.split(':').map(Number);
        const rateInfo = getRateInfoForTime(currentTariff, dayOfWeek, h, m);
        const cost = r.kwh * rateInfo.ratePerKwh; // cents
        if (cost > mCost) mCost = cost;
        dayCosts.push(cost);
      }
      grid.push(dayCosts);
    }

    return { costGrid: grid, maxKwh: mKwh, maxCost: mCost };
  }, [data, currentTariff]);

  const handleCellEnter = useCallback((e: React.MouseEvent, date: string, time: string, kwh: number, costCents: number) => {
    const parsed = parseISO(date);
    const dayOfWeek = getDay(parsed);
    const [h, m] = time.split(':').map(Number);
    const rateInfo = getRateInfoForTime(currentTariff, dayOfWeek, h, m);

    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget.closest('.overflow-x-auto')!.getBoundingClientRect();
    setTooltip({
      date: format(parsed, 'EEE dd MMM yyyy'),
      time,
      kwh,
      cost: Math.round(costCents * 100) / 100,
      rateLabel: rateInfo.label,
      ratePerKwh: rateInfo.ratePerKwh,
      x: rect.left - container.left + rect.width / 2,
      y: rect.top - container.top,
    });
  }, [currentTariff]);

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  const scale = mode === 'usage' ? USAGE_SCALE : COST_SCALE;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Usage Heatmap</h2>
          <p className="text-xs text-gray-400 mt-0.5">Each cell is a 30-minute slot. Darker = higher {mode === 'usage' ? 'usage' : 'cost'}.</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode('usage')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
              ${mode === 'usage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Usage (kWh)
          </button>
          <button
            onClick={() => setMode('cost')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
              ${mode === 'cost' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Cost ({currentTariff.name})
          </button>
        </div>
      </div>

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
          {data.days.map((day, dayIdx) => {
            const dayCosts = costGrid[dayIdx];
            const dayTotalCost = dayCosts ? dayCosts.reduce((s, c) => s + c, 0) : 0;
            return (
              <div key={day.date} className="flex items-center mb-px">
                <div className="w-24 shrink-0 text-[10px] text-gray-500 pr-2 text-right truncate">
                  {format(parseISO(day.date), 'EEE dd MMM')}
                </div>
                <div className="flex-1 flex">
                  {day.readings.map((r, i) => {
                    const costCents = dayCosts?.[i] ?? 0;
                    const cellValue = mode === 'usage' ? r.kwh : costCents;
                    const cellMax = mode === 'usage' ? maxKwh : maxCost;
                    return (
                      <div
                        key={i}
                        className="flex-1 h-[18px] border-r border-b border-white/50"
                        style={{ backgroundColor: getScaledColor(cellValue, cellMax, scale), minWidth: 14 }}
                        onMouseEnter={(e) => handleCellEnter(e, day.date, r.time, r.kwh, costCents)}
                        onMouseLeave={handleCellLeave}
                      />
                    );
                  })}
                </div>
                <div className="w-16 shrink-0 text-right text-[10px] text-gray-500 pl-2">
                  {mode === 'usage'
                    ? day.totalKwh.toFixed(1)
                    : `€${(dayTotalCost / 100).toFixed(2)}`}
                </div>
              </div>
            );
          })}
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
          {scale.map(c => (
            <div key={c} className="w-6 h-full" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
