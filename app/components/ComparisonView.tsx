'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { EnergyData } from '../lib/types';
import {
  getWeeklyTotals, getWeekComparison, getMonthComparison, getMonthlyTotals,
  getWeekYearAgoComparison, getMonthYearAgoComparison,
} from '../lib/analytics';

interface Props {
  data: EnergyData;
}

type CompareMode = 'week_prev' | 'week_year' | 'month_prev' | 'month_year';

function ChangeCard({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return null;
  return (
    <div className={`rounded-lg p-3 ${changePercent > 0 ? 'bg-red-50' : changePercent < 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
      <p className="text-xs font-medium text-gray-500">Change</p>
      <p className={`text-xl font-bold ${changePercent > 0 ? 'text-red-600' : changePercent < 0 ? 'text-green-600' : 'text-gray-600'}`}>
        {changePercent > 0 ? '+' : ''}{changePercent}%
      </p>
      <p className="text-xs text-gray-400">{changePercent > 0 ? 'more usage' : changePercent < 0 ? 'less usage' : 'no change'}</p>
    </div>
  );
}

function NoDataCard({ label }: { label: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className="text-sm font-medium text-gray-400 mt-1">No data available</p>
    </div>
  );
}

export default function ComparisonView({ data }: Props) {
  const [mode, setMode] = useState<CompareMode>('week_prev');
  const weeks = useMemo(() => getWeeklyTotals(data), [data]);
  const months = useMemo(() => getMonthlyTotals(data), [data]);

  const [selectedWeek, setSelectedWeek] = useState(weeks.length > 1 ? weeks[weeks.length - 1].weekKey : weeks[0]?.weekKey || '');
  const [selectedMonth, setSelectedMonth] = useState(months.length > 1 ? months[months.length - 1].monthKey : months[0]?.monthKey || '');

  const weekPrevComp = useMemo(() => selectedWeek ? getWeekComparison(data, selectedWeek) : null, [data, selectedWeek]);
  const weekYearComp = useMemo(() => selectedWeek ? getWeekYearAgoComparison(data, selectedWeek) : null, [data, selectedWeek]);
  const monthPrevComp = useMemo(() => selectedMonth ? getMonthComparison(data, selectedMonth) : null, [data, selectedMonth]);
  const monthYearComp = useMemo(() => selectedMonth ? getMonthYearAgoComparison(data, selectedMonth) : null, [data, selectedMonth]);

  // Build comparison bar data for week vs previous
  const weekPrevBarData = useMemo(() => {
    if (!weekPrevComp) return [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return dayNames.map((name, i) => {
      const currentDay = weekPrevComp.current.days[i];
      const prevDay = weekPrevComp.previous?.days[i];
      return {
        day: name,
        current: currentDay ? Math.round(currentDay.totalKwh * 100) / 100 : 0,
        comparison: prevDay ? Math.round(prevDay.totalKwh * 100) / 100 : 0,
      };
    });
  }, [weekPrevComp]);

  // Build comparison bar data for week vs year ago
  const weekYearBarData = useMemo(() => {
    if (!weekYearComp) return [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return dayNames.map((name, i) => {
      const currentDay = weekYearComp.current.days[i];
      const yearAgoDay = weekYearComp.yearAgo?.days[i];
      return {
        day: name,
        current: currentDay ? Math.round(currentDay.totalKwh * 100) / 100 : 0,
        comparison: yearAgoDay ? Math.round(yearAgoDay.totalKwh * 100) / 100 : 0,
      };
    });
  }, [weekYearComp]);

  const isWeekMode = mode === 'week_prev' || mode === 'week_year';
  const isMonthMode = mode === 'month_prev' || mode === 'month_year';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Period Comparison</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 flex-wrap">
          <button
            onClick={() => setMode('week_prev')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'week_prev' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Week vs Previous
          </button>
          <button
            onClick={() => setMode('week_year')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'week_year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Week vs Year Ago
          </button>
          <button
            onClick={() => setMode('month_prev')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'month_prev' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Month vs Previous
          </button>
          <button
            onClick={() => setMode('month_year')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'month_year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Month vs Year Ago
          </button>
        </div>
      </div>

      {/* Week selector (shared by both week modes) */}
      {isWeekMode && (
        <div className="mb-4">
          <label className="text-sm text-gray-500 mr-2">Select week:</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {weeks.map(w => (
              <option key={w.weekKey} value={w.weekKey}>{w.label} ({w.kwh} kWh)</option>
            ))}
          </select>
        </div>
      )}

      {/* Month selector (shared by both month modes) */}
      {isMonthMode && (
        <div className="mb-4">
          <label className="text-sm text-gray-500 mr-2">Select month:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {months.map(m => (
              <option key={m.monthKey} value={m.monthKey}>{m.label} ({m.kwh} kWh)</option>
            ))}
          </select>
        </div>
      )}

      {/* Week vs Previous */}
      {mode === 'week_prev' && weekPrevComp && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium">Selected Week</p>
              <p className="text-xl font-bold text-blue-700">{weekPrevComp.current.total} kWh</p>
              <p className="text-xs text-blue-500">{weekPrevComp.current.label}</p>
            </div>
            {weekPrevComp.previous ? (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium">Previous Week</p>
                <p className="text-xl font-bold text-gray-700">{weekPrevComp.previous.total} kWh</p>
                <p className="text-xs text-gray-400">{weekPrevComp.previous.label}</p>
              </div>
            ) : (
              <NoDataCard label="Previous Week" />
            )}
            <ChangeCard changePercent={weekPrevComp.changePercent} />
          </div>

          {weekPrevBarData.length > 0 && weekPrevComp.previous && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weekPrevBarData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'kWh', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="current" fill="#3b82f6" name="Selected Week" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comparison" fill="#d1d5db" name="Previous Week" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}

      {/* Week vs Year Ago */}
      {mode === 'week_year' && weekYearComp && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium">Selected Week</p>
              <p className="text-xl font-bold text-blue-700">{weekYearComp.current.total} kWh</p>
              <p className="text-xs text-blue-500">{weekYearComp.current.label}</p>
            </div>
            {weekYearComp.yearAgo ? (
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600 font-medium">Same Week Last Year</p>
                <p className="text-xl font-bold text-amber-700">{weekYearComp.yearAgo.total} kWh</p>
                <p className="text-xs text-amber-500">{weekYearComp.yearAgo.label}</p>
              </div>
            ) : (
              <NoDataCard label="Same Week Last Year" />
            )}
            {weekYearComp.yearAgo ? (
              <ChangeCard changePercent={weekYearComp.changePercent} />
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
                <p className="text-xs text-gray-400 font-medium">Year-over-Year</p>
                <p className="text-xs text-gray-400 mt-1">Upload data from last year to see this comparison.</p>
              </div>
            )}
          </div>

          {weekYearBarData.length > 0 && weekYearComp.yearAgo && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weekYearBarData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'kWh', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="current" fill="#3b82f6" name="Selected Week" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comparison" fill="#f59e0b" name="Same Week Last Year" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}

      {/* Month vs Previous */}
      {mode === 'month_prev' && monthPrevComp && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600 font-medium">{monthPrevComp.current.label}</p>
            <p className="text-xl font-bold text-blue-700">{monthPrevComp.current.total} kWh</p>
            <p className="text-xs text-blue-500">{monthPrevComp.current.avgDaily} kWh/day avg</p>
          </div>
          {monthPrevComp.previous ? (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium">{monthPrevComp.previous.label}</p>
              <p className="text-xl font-bold text-gray-700">{monthPrevComp.previous.total} kWh</p>
              <p className="text-xs text-gray-400">{monthPrevComp.previous.avgDaily} kWh/day avg</p>
            </div>
          ) : (
            <NoDataCard label="Previous Month" />
          )}
          <ChangeCard changePercent={monthPrevComp.changePercent} />
        </div>
      )}

      {/* Month vs Year Ago */}
      {mode === 'month_year' && monthYearComp && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600 font-medium">{monthYearComp.current.label}</p>
            <p className="text-xl font-bold text-blue-700">{monthYearComp.current.total} kWh</p>
            <p className="text-xs text-blue-500">{monthYearComp.current.avgDaily} kWh/day avg</p>
          </div>
          {monthYearComp.yearAgo ? (
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-amber-600 font-medium">{monthYearComp.yearAgo.label}</p>
              <p className="text-xl font-bold text-amber-700">{monthYearComp.yearAgo.total} kWh</p>
              <p className="text-xs text-amber-500">{monthYearComp.yearAgo.avgDaily} kWh/day avg</p>
            </div>
          ) : (
            <NoDataCard label="Same Month Last Year" />
          )}
          {monthYearComp.yearAgo ? (
            <ChangeCard changePercent={monthYearComp.changePercent} />
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
              <p className="text-xs text-gray-400 font-medium">Year-over-Year</p>
              <p className="text-xs text-gray-400 mt-1">Upload data from last year to see this comparison.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
