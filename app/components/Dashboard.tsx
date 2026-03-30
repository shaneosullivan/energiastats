"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  EnergyData,
  UserSettings,
  BatterySettings,
  EVSettings,
} from "../lib/types";
import { DEFAULT_TARIFFS } from "../lib/analytics";
import OverviewCards from "./OverviewCards";
import UsageCharts from "./UsageCharts";
import ComparisonView from "./ComparisonView";
import HeatmapView from "./HeatmapView";
import InsightsPanel from "./InsightsPanel";
import SettingsPanel from "./SettingsPanel";
import SimulateTab from "./SimulateTab";

interface Props {
  data: EnergyData;
  fileName: string;
  onReset: () => void;
}

type Tab =
  | "overview"
  | "charts"
  | "compare"
  | "heatmap"
  | "settings"
  | "simulate"
  | "insights";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "settings", label: "My Settings", icon: "⚙️" },
  { key: "charts", label: "Charts", icon: "📈" },
  { key: "compare", label: "Compare", icon: "⚖️" },
  { key: "heatmap", label: "Heatmap", icon: "🔥" },
  { key: "simulate", label: "Simulate", icon: "🔬" },
  { key: "insights", label: "Insights", icon: "💡" },
];

const SETTINGS_KEY = "energia-insights-settings";

const DEFAULT_BATTERY: BatterySettings = {
  hasBattery: false,
  capacityKwh: 10,
  usablePercent: 90,
  chargeStartHour: 2,
  chargeStartMinute: 0,
  chargeEndHour: 6,
  chargeEndMinute: 0,
  autoDetectCheapest: true,
  dischargeWindows: [],
  minChargePercent: 5,
};

const DEFAULT_EV: EVSettings = {
  hasEV: false,
  chargingStartHour: 2,
  chargingStartMinute: 0,
  chargingEndHour: 6,
  chargingEndMinute: 0,
  chargingSpeedKw: 7.4,
};

function loadSettings(): UserSettings {
  if (typeof window === "undefined") {
    return {
      currentTariff: DEFAULT_TARIFFS[0],
      battery: DEFAULT_BATTERY,
      ev: DEFAULT_EV,
    };
  }
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UserSettings;
      // Validate it has the expected shape
      if (parsed.currentTariff && parsed.battery && parsed.ev) {
        return parsed;
      }
    }
  } catch {
    // ignore parse errors
  }
  return {
    currentTariff: DEFAULT_TARIFFS[0],
    battery: DEFAULT_BATTERY,
    ev: DEFAULT_EV,
  };
}

export default function Dashboard({ data, fileName, onReset }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      const validTabs = TABS.map((t) => t.key);
      if (validTabs.includes(hash as Tab)) return hash as Tab;
    }
    return "overview";
  });

  // Sync tab to URL hash
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      const validTabs = TABS.map((t) => t.key);
      if (validTabs.includes(hash as Tab)) setActiveTab(hash as Tab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [userSettings, setUserSettings] = useState<UserSettings>(loadSettings);

  // Persist settings to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
    } catch {
      // ignore quota errors
    }
  }, [userSettings]);

  const currentTariff = userSettings.currentTariff;

  const handleSettingsChange = useCallback((settings: UserSettings) => {
    setUserSettings(settings);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo_500.png"
              alt="Irish Energy Insights"
              width={32}
              height={32}
              className="rounded"
            />
            <h1 className="text-lg font-bold text-gray-900">
              Irish Energy Insights
            </h1>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">
              {fileName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onReset}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              Upload New File
            </button>
            <a
              href="https://github.com/shaneosullivan/energiastats"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="View source code on GitHub"
              title="View source code on GitHub"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto pb-px -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${
                    activeTab === tab.key
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
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
        {activeTab === "overview" && (
          <>
            <OverviewCards data={data} />
            <InsightsPanel data={data} currentTariff={currentTariff} />
          </>
        )}
        {activeTab === "charts" && (
          <UsageCharts data={data} currentTariff={currentTariff} />
        )}
        {activeTab === "compare" && <ComparisonView data={data} />}
        {activeTab === "heatmap" && (
          <HeatmapView data={data} currentTariff={currentTariff} />
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            settings={userSettings}
            onSettingsChange={handleSettingsChange}
          />
        )}
        {activeTab === "simulate" && (
          <SimulateTab data={data} currentSettings={userSettings} />
        )}
        {activeTab === "insights" && (
          <InsightsPanel data={data} currentTariff={currentTariff} />
        )}
      </main>
    </div>
  );
}
