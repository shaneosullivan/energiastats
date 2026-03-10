"use client";

import {
  Tariff,
  UserSettings,
  BatterySettings,
  EVSettings,
} from "../lib/types";
import { DEFAULT_TARIFFS } from "../lib/analytics";
import { TariffEditor } from "./TariffManager";
import { findCheapestPeriod } from "../lib/simulation";

interface Props {
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
}

export default function SettingsPanel({ settings, onSettingsChange }: Props) {
  const { currentTariff, battery, ev } = settings;

  const setTariff = (t: Tariff) =>
    onSettingsChange({ ...settings, currentTariff: t });
  const setBattery = (b: BatterySettings) =>
    onSettingsChange({ ...settings, battery: b });
  const setEV = (e: EVSettings) => onSettingsChange({ ...settings, ev: e });

  const handlePresetChange = (presetId: string) => {
    const found = DEFAULT_TARIFFS.find((t) => t.id === presetId);
    if (found) {
      setTariff(JSON.parse(JSON.stringify(found)));
    }
  };

  // Auto-detect cheapest period for display
  const cheapest = findCheapestPeriod(currentTariff, 1); // Use Monday as reference

  return (
    <div className="space-y-6">
      {/* Tariff section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">My Tariff</h2>
        <p className="text-xs text-gray-400 mb-4">
          Select your current electricity tariff. All rates in cent/kWh, charges
          in cent/day.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-500">Preset:</label>
          <select
            value={
              DEFAULT_TARIFFS.find((t) => t.id === currentTariff.id)?.id ||
              "custom"
            }
            onChange={(e) => handlePresetChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            {DEFAULT_TARIFFS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>

        <TariffEditor tariff={currentTariff} onChange={setTariff} />
      </div>

      {/* Battery section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Home Battery</h2>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={battery.hasBattery}
              onChange={(e) =>
                setBattery({ ...battery, hasBattery: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>

        {battery.hasBattery && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">
                  Battery Capacity (kWh)
                </label>
                <input
                  type="number"
                  value={battery.capacityKwh}
                  onChange={(e) =>
                    setBattery({
                      ...battery,
                      capacityKwh: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                  min="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">
                  Usable Capacity: {battery.usablePercent}%
                </label>
                <input
                  type="range"
                  value={battery.usablePercent}
                  onChange={(e) =>
                    setBattery({
                      ...battery,
                      usablePercent: parseInt(e.target.value),
                    })
                  }
                  className="w-full mt-1"
                  min="50"
                  max="100"
                  step="1"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>50%</span>
                  <span className="font-medium text-gray-600">
                    {(
                      (battery.capacityKwh * battery.usablePercent) /
                      100
                    ).toFixed(1)}{" "}
                    kWh usable
                  </span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <label className="text-xs text-gray-500">Charging Hours</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={battery.autoDetectCheapest}
                    onChange={(e) =>
                      setBattery({
                        ...battery,
                        autoDetectCheapest: e.target.checked,
                      })
                    }
                    className="rounded"
                  />
                  Auto-detect cheapest period
                </label>
              </div>

              {battery.autoDetectCheapest ? (
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">
                  Will charge during the cheapest tariff period:{" "}
                  {cheapest.startHour.toString().padStart(2, "0")}:
                  {cheapest.startMinute.toString().padStart(2, "0")} &ndash;{" "}
                  {cheapest.endHour.toString().padStart(2, "0")}:
                  {cheapest.endMinute.toString().padStart(2, "0")}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={battery.chargeStartHour}
                    onChange={(e) =>
                      setBattery({
                        ...battery,
                        chargeStartHour: parseInt(e.target.value),
                      })
                    }
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {h.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">:</span>
                  <select
                    value={battery.chargeStartMinute}
                    onChange={(e) =>
                      setBattery({
                        ...battery,
                        chargeStartMinute: parseInt(e.target.value),
                      })
                    }
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    <option value={0}>00</option>
                    <option value={30}>30</option>
                  </select>
                  <span className="text-xs text-gray-400">to</span>
                  <select
                    value={battery.chargeEndHour}
                    onChange={(e) =>
                      setBattery({
                        ...battery,
                        chargeEndHour: parseInt(e.target.value),
                      })
                    }
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    {Array.from({ length: 25 }, (_, h) => (
                      <option key={h} value={h}>
                        {h.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">:</span>
                  <select
                    value={battery.chargeEndMinute}
                    onChange={(e) =>
                      setBattery({
                        ...battery,
                        chargeEndMinute: parseInt(e.target.value),
                      })
                    }
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    <option value={0}>00</option>
                    <option value={30}>30</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-500">
                Minimum Charge: {battery.minChargePercent ?? 5}%
              </label>
              <input
                type="range"
                value={battery.minChargePercent ?? 5}
                onChange={(e) =>
                  setBattery({
                    ...battery,
                    minChargePercent: parseInt(e.target.value),
                  })
                }
                className="w-full mt-1"
                min="0"
                max="50"
                step="1"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>0%</span>
                <span className="font-medium text-gray-600">
                  {(
                    (battery.capacityKwh * (battery.minChargePercent ?? 5)) /
                    100
                  ).toFixed(1)}{" "}
                  kWh reserved
                </span>
                <span>50%</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-500">
                  Forced Discharge / Grid Export
                </label>
                <button
                  onClick={() =>
                    setBattery({
                      ...battery,
                      dischargeWindows: [
                        ...(battery.dischargeWindows ?? []),
                        {
                          startHour: 17,
                          startMinute: 0,
                          endHour: 19,
                          endMinute: 0,
                          exportRatePerKwh: 21,
                        },
                      ],
                    })
                  }
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Add Window
                </button>
              </div>

              {(battery.dischargeWindows ?? []).length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  No forced discharge windows configured.
                </p>
              )}

              {(battery.dischargeWindows ?? []).map((dw, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 mb-2 bg-gray-50 rounded-lg p-2"
                >
                  <select
                    value={dw.startHour}
                    onChange={(e) => {
                      const windows = [...(battery.dischargeWindows ?? [])];
                      windows[idx] = {
                        ...dw,
                        startHour: parseInt(e.target.value),
                      };
                      setBattery({ ...battery, dischargeWindows: windows });
                    }}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {h.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">:</span>
                  <select
                    value={dw.startMinute}
                    onChange={(e) => {
                      const windows = [...(battery.dischargeWindows ?? [])];
                      windows[idx] = {
                        ...dw,
                        startMinute: parseInt(e.target.value),
                      };
                      setBattery({ ...battery, dischargeWindows: windows });
                    }}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    <option value={0}>00</option>
                    <option value={30}>30</option>
                  </select>
                  <span className="text-xs text-gray-400">to</span>
                  <select
                    value={dw.endHour}
                    onChange={(e) => {
                      const windows = [...(battery.dischargeWindows ?? [])];
                      windows[idx] = {
                        ...dw,
                        endHour: parseInt(e.target.value),
                      };
                      setBattery({ ...battery, dischargeWindows: windows });
                    }}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    {Array.from({ length: 25 }, (_, h) => (
                      <option key={h} value={h}>
                        {h.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">:</span>
                  <select
                    value={dw.endMinute}
                    onChange={(e) => {
                      const windows = [...(battery.dischargeWindows ?? [])];
                      windows[idx] = {
                        ...dw,
                        endMinute: parseInt(e.target.value),
                      };
                      setBattery({ ...battery, dischargeWindows: windows });
                    }}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    <option value={0}>00</option>
                    <option value={30}>30</option>
                  </select>
                  <span className="text-xs text-gray-400">@</span>
                  <input
                    type="number"
                    value={dw.exportRatePerKwh}
                    onChange={(e) => {
                      const windows = [...(battery.dischargeWindows ?? [])];
                      windows[idx] = {
                        ...dw,
                        exportRatePerKwh: parseFloat(e.target.value) || 0,
                      };
                      setBattery({ ...battery, dischargeWindows: windows });
                    }}
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                    min="0"
                    step="0.01"
                  />
                  <span className="text-xs text-gray-400">c/kWh</span>
                  <button
                    onClick={() => {
                      const windows = (battery.dischargeWindows ?? []).filter(
                        (_, i) => i !== idx,
                      );
                      setBattery({ ...battery, dischargeWindows: windows });
                    }}
                    className="text-red-400 hover:text-red-600 text-xs ml-auto"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* EV section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">EV Charging</h2>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={ev.hasEV}
              onChange={(e) => setEV({ ...ev, hasEV: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>

        {ev.hasEV && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500">
                Charging Speed (kW)
              </label>
              <input
                type="number"
                value={ev.chargingSpeedKw}
                onChange={(e) =>
                  setEV({
                    ...ev,
                    chargingSpeedKw: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-2 block">
                Charging Hours
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={ev.chargingStartHour}
                  onChange={(e) =>
                    setEV({
                      ...ev,
                      chargingStartHour: parseInt(e.target.value),
                    })
                  }
                  className="border border-gray-200 rounded px-2 py-1 text-xs"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">:</span>
                <select
                  value={ev.chargingStartMinute}
                  onChange={(e) =>
                    setEV({
                      ...ev,
                      chargingStartMinute: parseInt(e.target.value),
                    })
                  }
                  className="border border-gray-200 rounded px-2 py-1 text-xs"
                >
                  <option value={0}>00</option>
                  <option value={30}>30</option>
                </select>
                <span className="text-xs text-gray-400">to</span>
                <select
                  value={ev.chargingEndHour}
                  onChange={(e) =>
                    setEV({ ...ev, chargingEndHour: parseInt(e.target.value) })
                  }
                  className="border border-gray-200 rounded px-2 py-1 text-xs"
                >
                  {Array.from({ length: 25 }, (_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">:</span>
                <select
                  value={ev.chargingEndMinute}
                  onChange={(e) =>
                    setEV({
                      ...ev,
                      chargingEndMinute: parseInt(e.target.value),
                    })
                  }
                  className="border border-gray-200 rounded px-2 py-1 text-xs"
                >
                  <option value={0}>00</option>
                  <option value={30}>30</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
