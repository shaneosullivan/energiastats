'use client';

import { useState, useMemo } from 'react';
import { EnergyData, Appliance } from '../lib/types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  data: EnergyData;
}

const DEFAULT_APPLIANCES: Appliance[] = [
  { id: 'ev', name: 'Electric Car', icon: '🚗', averageKwhPerUse: 30, typicalUsesPerWeek: 3, category: 'transport' },
  { id: 'dryer', name: 'Tumble Dryer', icon: '🌀', averageKwhPerUse: 4.5, typicalUsesPerWeek: 3, category: 'laundry' },
  { id: 'washer', name: 'Washing Machine', icon: '🧺', averageKwhPerUse: 1.5, typicalUsesPerWeek: 5, category: 'laundry' },
  { id: 'dishwasher', name: 'Dishwasher', icon: '🍽️', averageKwhPerUse: 1.8, typicalUsesPerWeek: 5, category: 'cooking' },
  { id: 'oven', name: 'Oven', icon: '🔥', averageKwhPerUse: 2.0, typicalUsesPerWeek: 5, category: 'cooking' },
  { id: 'hob', name: 'Electric Hob', icon: '🫕', averageKwhPerUse: 1.5, typicalUsesPerWeek: 7, category: 'cooking' },
  { id: 'kettle', name: 'Kettle', icon: '☕', averageKwhPerUse: 0.1, typicalUsesPerWeek: 28, category: 'cooking' },
  { id: 'immersion', name: 'Immersion Heater', icon: '🔆', averageKwhPerUse: 3.0, typicalUsesPerWeek: 7, category: 'heating' },
  { id: 'storage_heater', name: 'Storage Heaters', icon: '🌡️', averageKwhPerUse: 10.0, typicalUsesPerWeek: 7, category: 'heating' },
  { id: 'heat_pump', name: 'Heat Pump', icon: '♨️', averageKwhPerUse: 6.0, typicalUsesPerWeek: 7, category: 'heating' },
  { id: 'tv', name: 'TV', icon: '📺', averageKwhPerUse: 0.15, typicalUsesPerWeek: 14, category: 'entertainment' },
  { id: 'gaming', name: 'Gaming Console', icon: '🎮', averageKwhPerUse: 0.2, typicalUsesPerWeek: 7, category: 'entertainment' },
  { id: 'fridge', name: 'Fridge/Freezer', icon: '❄️', averageKwhPerUse: 1.5, typicalUsesPerWeek: 7, category: 'other' },
  { id: 'lighting', name: 'Lighting', icon: '💡', averageKwhPerUse: 0.5, typicalUsesPerWeek: 7, category: 'other' },
];

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

const SUGGESTIONS: Record<string, string[]> = {
  ev: [
    'Charge your EV during night hours (23:00-08:00) to benefit from lower rates.',
    'Use a timer to start charging at 23:00 or later.',
    'A night-rate tariff could significantly reduce your EV charging costs.',
  ],
  dryer: [
    'Run your dryer during off-peak hours or at night if your tariff supports it.',
    'Consider using a clothesline during warmer months to reduce dryer usage.',
    'Heat pump dryers use about 50% less energy than conventional ones.',
  ],
  washer: [
    'Wash at 30°C instead of 40°C to save about 40% of the energy per cycle.',
    'Run full loads to maximise efficiency.',
    'Use delay timer to run during off-peak/night hours.',
  ],
  storage_heater: [
    'Storage heaters are designed for night-rate electricity - make sure you have a night tariff.',
    'Check that your storage heaters are properly insulated and the input/output controls are set correctly.',
    'Consider upgrading to modern storage heaters with better controls.',
  ],
  immersion: [
    'Use a timer to heat water only when needed, typically 1-2 hours before use.',
    'Insulate your hot water cylinder to retain heat longer.',
    'Consider solar thermal or a heat pump water heater for long-term savings.',
  ],
  heat_pump: [
    'Heat pumps are most efficient when run at low, steady temperatures rather than quick bursts.',
    'Keep the thermostat at a consistent temperature rather than turning it on and off.',
    'Ensure your home is well-insulated to maximise heat pump efficiency.',
  ],
  oven: [
    'Use a microwave or air fryer for smaller meals — they use significantly less energy.',
    'Avoid opening the oven door frequently as it loses heat quickly.',
    'Batch cooking can reduce oven usage across the week.',
  ],
};

export default function ApplianceProfiler({ data }: Props) {
  const [selectedAppliances, setSelectedAppliances] = useState<Record<string, { usesPerWeek: number }>>({});

  const totalKwh = data.days.reduce((s, d) => s + d.totalKwh, 0);
  const weeks = data.days.length / 7;

  const toggleAppliance = (id: string) => {
    setSelectedAppliances(prev => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const appliance = DEFAULT_APPLIANCES.find(a => a.id === id)!;
      return { ...prev, [id]: { usesPerWeek: appliance.typicalUsesPerWeek } };
    });
  };

  const updateUses = (id: string, uses: number) => {
    setSelectedAppliances(prev => ({ ...prev, [id]: { usesPerWeek: uses } }));
  };

  const breakdown = useMemo(() => {
    const items: { name: string; kwh: number; percent: number }[] = [];
    let accounted = 0;

    for (const [id, config] of Object.entries(selectedAppliances)) {
      const appliance = DEFAULT_APPLIANCES.find(a => a.id === id);
      if (!appliance) continue;
      const weeklyKwh = appliance.averageKwhPerUse * config.usesPerWeek;
      const totalApplianceKwh = weeklyKwh * weeks;
      accounted += totalApplianceKwh;
      items.push({
        name: appliance.name,
        kwh: Math.round(totalApplianceKwh * 10) / 10,
        percent: Math.round((totalApplianceKwh / totalKwh) * 1000) / 10,
      });
    }

    const unaccounted = Math.max(0, totalKwh - accounted);
    if (unaccounted > 0) {
      items.push({
        name: 'Other / Unaccounted',
        kwh: Math.round(unaccounted * 10) / 10,
        percent: Math.round((unaccounted / totalKwh) * 1000) / 10,
      });
    }

    return items;
  }, [selectedAppliances, totalKwh, weeks]);

  const activeSuggestions = useMemo(() => {
    const tips: string[] = [];
    for (const id of Object.keys(selectedAppliances)) {
      if (SUGGESTIONS[id]) {
        tips.push(...SUGGESTIONS[id]);
      }
    }
    // General suggestions
    tips.push('Consider switching to LED lighting if you haven\'t already — they use 75% less energy.');
    tips.push('Unplug devices on standby. Standby power can account for 5-10% of your bill.');
    return tips;
  }, [selectedAppliances]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Appliance Profiler</h2>
      <p className="text-xs text-gray-400 mb-4">Select the appliances you use to see estimated breakdown and get tailored suggestions.</p>

      {/* Appliance selection grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
        {DEFAULT_APPLIANCES.map(app => {
          const isSelected = !!selectedAppliances[app.id];
          return (
            <div key={app.id} className="flex flex-col">
              <button
                onClick={() => toggleAppliance(app.id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-sm
                  ${isSelected ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <span className="text-lg">{app.icon}</span>
                <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>{app.name}</span>
              </button>
              {isSelected && (
                <div className="flex items-center gap-1 mt-1 px-1">
                  <input
                    type="number"
                    value={selectedAppliances[app.id].usesPerWeek}
                    onChange={(e) => updateUses(app.id, parseFloat(e.target.value) || 0)}
                    className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                    min={0}
                    step={1}
                  />
                  <span className="text-[10px] text-gray-400">uses/wk</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Breakdown */}
      {breakdown.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Estimated Usage Breakdown</h3>
            <div className="space-y-2">
              {breakdown.map((item, i) => (
                <div key={item.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-sm text-gray-700 flex-1">{item.name}</span>
                  <span className="text-sm font-medium text-gray-600">{item.kwh} kWh</span>
                  <span className="text-xs text-gray-400 w-12 text-right">{item.percent}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={breakdown} dataKey="kwh" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} kWh`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {Object.keys(selectedAppliances).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Energy-Saving Suggestions</h3>
          <div className="space-y-2">
            {activeSuggestions.map((tip, i) => (
              <div key={i} className="flex gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <span className="text-amber-500 shrink-0 mt-0.5">&#9889;</span>
                <p className="text-sm text-gray-700">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
