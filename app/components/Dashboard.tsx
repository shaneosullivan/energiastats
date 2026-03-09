'use client';

import { useState } from 'react';
import { EnergyData, Tariff } from '../lib/types';
import { DEFAULT_TARIFFS } from '../lib/analytics';
import OverviewCards from './OverviewCards';
import UsageCharts from './UsageCharts';
import ComparisonView from './ComparisonView';
import HeatmapView from './HeatmapView';
import TariffManager from './TariffManager';
import ApplianceProfiler from './ApplianceProfiler';
import InsightsPanel from './InsightsPanel';

interface Props {
  data: EnergyData;
  fileName: string;
  onReset: () => void;
}

type Tab = 'overview' | 'charts' | 'compare' | 'heatmap' | 'tariffs' | 'appliances' | 'insights';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'charts', label: 'Charts', icon: '📈' },
  { key: 'compare', label: 'Compare', icon: '⚖️' },
  { key: 'heatmap', label: 'Heatmap', icon: '🔥' },
  { key: 'tariffs', label: 'Tariffs', icon: '💰' },
  { key: 'appliances', label: 'Appliances', icon: '🔌' },
  { key: 'insights', label: 'Insights', icon: '💡' },
];

export default function Dashboard({ data, fileName, onReset }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [currentTariff, setCurrentTariff] = useState<Tariff>(DEFAULT_TARIFFS[0]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">Energia Insights</h1>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">{fileName}</span>
          </div>
          <button
            onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            Upload New File
          </button>
        </div>

        {/* Tab navigation */}
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto pb-px -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              >
                <span className="text-xs">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {activeTab === 'overview' && (
          <>
            <OverviewCards data={data} />
            <InsightsPanel data={data} />
          </>
        )}
        {activeTab === 'charts' && <UsageCharts data={data} currentTariff={currentTariff} />}
        {activeTab === 'compare' && <ComparisonView data={data} />}
        {activeTab === 'heatmap' && <HeatmapView data={data} currentTariff={currentTariff} />}
        {activeTab === 'tariffs' && <TariffManager data={data} currentTariff={currentTariff} onCurrentTariffChange={setCurrentTariff} />}
        {activeTab === 'appliances' && <ApplianceProfiler data={data} />}
        {activeTab === 'insights' && <InsightsPanel data={data} />}
      </main>
    </div>
  );
}
