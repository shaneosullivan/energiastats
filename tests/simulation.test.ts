import { describe, it, expect } from "bun:test";
import { findCheapestPeriod, runSimulation } from "../app/lib/simulation";
import {
  calculateTariffCost,
  DEFAULT_TARIFFS,
  getScheduleForDay,
} from "../app/lib/analytics";
import type {
  Tariff,
  EnergyData,
  DayData,
  HalfHourReading,
  BatterySettings,
  EVSettings,
  UserSettings,
  SimulationConfig,
} from "../app/lib/types";

// ─── Test helpers ───

/** Create 48 half-hour readings for a day, all with the same kWh value. */
function makeUniformReadings(kwhPerSlot: number): HalfHourReading[] {
  const readings: HalfHourReading[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      readings.push({
        time: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
        kwh: kwhPerSlot,
      });
    }
  }
  return readings;
}

/** Create a day with uniform readings. */
function makeDay(date: string, kwhPerSlot: number): DayData {
  const readings = makeUniformReadings(kwhPerSlot);
  return { date, readings, totalKwh: readings.reduce((s, r) => s + r.kwh, 0) };
}

/** Create EnergyData with multiple days of uniform readings. */
function makeEnergyData(dates: string[], kwhPerSlot: number): EnergyData {
  return {
    mprn: "TEST-001",
    days: dates.map((d) => makeDay(d, kwhPerSlot)),
  };
}

const NO_BATTERY: BatterySettings = {
  hasBattery: false,
  capacityKwh: 0,
  usablePercent: 90,
  chargeStartHour: 2,
  chargeStartMinute: 0,
  chargeEndHour: 6,
  chargeEndMinute: 0,
  autoDetectCheapest: false,
  dischargeWindows: [],
  minChargePercent: 5,
};

const NO_EV: EVSettings = {
  hasEV: false,
  chargingStartHour: 2,
  chargingStartMinute: 0,
  chargingEndHour: 6,
  chargingEndMinute: 0,
  chargingSpeedKw: 0,
};

// Simple flat-rate tariff for predictable cost calculations
const FLAT_TARIFF: Tariff = {
  id: "test-flat",
  name: "Test Flat",
  provider: "Test",
  standingCharge: 0,
  psoLevy: 0,
  scheduleType: "uniform",
  uniformSchedule: {
    rates: [
      {
        startHour: 0,
        startMinute: 0,
        endHour: 24,
        endMinute: 0,
        ratePerKwh: 40,
        label: "Standard",
      },
    ],
  },
};

// Day/Night tariff: Night (23-8) = 20 c/kWh, Day (8-23) = 40 c/kWh
const DAY_NIGHT_TARIFF: Tariff = {
  id: "test-day-night",
  name: "Test Day Night",
  provider: "Test",
  standingCharge: 0,
  psoLevy: 0,
  scheduleType: "uniform",
  uniformSchedule: {
    rates: [
      {
        startHour: 8,
        startMinute: 0,
        endHour: 23,
        endMinute: 0,
        ratePerKwh: 40,
        label: "Day",
      },
      {
        startHour: 23,
        startMinute: 0,
        endHour: 8,
        endMinute: 0,
        ratePerKwh: 20,
        label: "Night",
      },
    ],
  },
};

// 3-period tariff: Night (23-8)=15, Day (8-17)=40, Peak (17-23)=55
const THREE_PERIOD_TARIFF: Tariff = {
  id: "test-three-period",
  name: "Test Three Period",
  provider: "Test",
  standingCharge: 50, // 50c/day
  psoLevy: 5, // 5c/day
  scheduleType: "uniform",
  uniformSchedule: {
    rates: [
      {
        startHour: 8,
        startMinute: 0,
        endHour: 17,
        endMinute: 0,
        ratePerKwh: 40,
        label: "Day",
      },
      {
        startHour: 17,
        startMinute: 0,
        endHour: 23,
        endMinute: 0,
        ratePerKwh: 55,
        label: "Peak",
      },
      {
        startHour: 23,
        startMinute: 0,
        endHour: 8,
        endMinute: 0,
        ratePerKwh: 15,
        label: "Night",
      },
    ],
  },
};

// ─── findCheapestPeriod ───

describe("findCheapestPeriod", () => {
  it("returns the period with the lowest rate for a flat tariff", () => {
    const result = findCheapestPeriod(FLAT_TARIFF, 1);
    expect(result.startHour).toBe(0);
    expect(result.endHour).toBe(24);
  });

  it("returns the night period for a day/night tariff", () => {
    const result = findCheapestPeriod(DAY_NIGHT_TARIFF, 1); // Monday
    expect(result.startHour).toBe(23);
    expect(result.endHour).toBe(8);
    expect(result.startMinute).toBe(0);
    expect(result.endMinute).toBe(0);
  });

  it("returns the cheapest among three periods", () => {
    const result = findCheapestPeriod(THREE_PERIOD_TARIFF, 1);
    expect(result.startHour).toBe(23);
    expect(result.endHour).toBe(8);
  });

  it("uses first tier rate when tiers are present", () => {
    const evTariff = DEFAULT_TARIFFS.find(
      (t) => t.id === "energia-ev-smart-drive",
    )!;
    const result = findCheapestPeriod(evTariff, 1);
    // EV period (2-6am, 10.47c) is cheapest
    expect(result.startHour).toBe(2);
    expect(result.endHour).toBe(6);
  });

  it("falls back to 2-6am when schedule is empty", () => {
    const emptyTariff: Tariff = {
      id: "empty",
      name: "Empty",
      provider: "Test",
      standingCharge: 0,
      psoLevy: 0,
      scheduleType: "uniform",
    };
    const result = findCheapestPeriod(emptyTariff, 1);
    expect(result.startHour).toBe(2);
    expect(result.endHour).toBe(6);
  });

  it("works with weekday/weekend schedule types", () => {
    const weekdayWeekendTariff: Tariff = {
      id: "test-wdwe",
      name: "Test WD/WE",
      provider: "Test",
      standingCharge: 0,
      psoLevy: 0,
      scheduleType: "weekday_weekend",
      weekdaySchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 8,
            endMinute: 0,
            ratePerKwh: 10,
            label: "Night",
          },
          {
            startHour: 8,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 50,
            label: "Day",
          },
        ],
      },
      weekendSchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 5,
            label: "Weekend",
          },
        ],
      },
    };
    // Saturday (6) should use weekend schedule
    const weekendResult = findCheapestPeriod(weekdayWeekendTariff, 6);
    expect(weekendResult.startHour).toBe(0);
    expect(weekendResult.endHour).toBe(24);

    // Monday (1) should use weekday schedule
    const weekdayResult = findCheapestPeriod(weekdayWeekendTariff, 1);
    expect(weekdayResult.startHour).toBe(0);
    expect(weekdayResult.endHour).toBe(8);
  });
});

// ─── runSimulation — no battery/EV (tariff-only comparison) ───

describe("runSimulation — tariff-only (no battery/EV)", () => {
  const settings: UserSettings = {
    currentTariff: FLAT_TARIFF,
    battery: NO_BATTERY,
    ev: NO_EV,
  };

  it("returns zero savings when current and sim tariffs are identical", () => {
    // 2026-01-05 is a Monday
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const simConfig: SimulationConfig = {
      tariff: FLAT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, simConfig);
    expect(result.savingsCents).toBe(0);
    expect(result.savingsPercent).toBe(0);
    expect(result.numDays).toBe(1);
    expect(result.simulatedDays.length).toBe(1);
  });

  it("calculates savings when switching to a cheaper flat tariff", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5); // 48 slots × 0.5 = 24 kWh/day
    const cheaperTariff: Tariff = {
      ...FLAT_TARIFF,
      id: "test-cheaper",
      uniformSchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 30, // 30 vs 40 c/kWh
            label: "Standard",
          },
        ],
      },
    };

    const result = runSimulation(data, settings, {
      tariff: cheaperTariff,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    // 24 kWh × (40 - 30) c/kWh = 240 cents savings
    expect(result.savingsCents).toBeGreaterThan(0);
    expect(result.currentTotalCostCents).toBeGreaterThan(
      result.simulatedTotalCostCents,
    );
    expect(result.dailyCosts.length).toBe(1);
  });

  it("reports negative savings when switching to a more expensive tariff", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const expensiveTariff: Tariff = {
      ...FLAT_TARIFF,
      id: "test-expensive",
      uniformSchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 60,
            label: "Standard",
          },
        ],
      },
    };

    const result = runSimulation(data, settings, {
      tariff: expensiveTariff,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    expect(result.savingsCents).toBeLessThan(0);
    expect(result.savingsPercent).toBeLessThan(0);
  });

  it("correctly handles standing charges and PSO levy", () => {
    const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);
    const settingsWithCharges: UserSettings = {
      currentTariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settingsWithCharges, {
      tariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    // Standing + PSO = 55c/day × 2 days = 110c in fixed charges
    expect(result.savingsCents).toBe(0);
    expect(result.numDays).toBe(2);
  });

  it("extrapolates yearly savings correctly", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const cheaperTariff: Tariff = {
      ...FLAT_TARIFF,
      id: "test-cheaper",
      uniformSchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 30,
            label: "Standard",
          },
        ],
      },
    };

    const result = runSimulation(data, settings, {
      tariff: cheaperTariff,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    // Yearly savings = (savingsCents / numDays) * 365
    const expectedYearly = (result.savingsCents / result.numDays) * 365;
    expect(result.yearlySavingsCents).toBeCloseTo(expectedYearly, 2);
  });

  it("preserves original data readings (no mutation)", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const originalFirstReading = data.days[0].readings[0].kwh;

    runSimulation(data, settings, {
      tariff: FLAT_TARIFF,
      battery: { ...NO_BATTERY, hasBattery: true, capacityKwh: 10 },
      ev: NO_EV,
    });

    expect(data.days[0].readings[0].kwh).toBe(originalFirstReading);
  });
});

// ─── runSimulation — battery simulation ───

describe("runSimulation — battery", () => {
  // 2026-01-05 is a Monday
  const data = makeEnergyData(["2026-01-05"], 0.5); // 24 kWh/day

  const settingsNoBattery: UserSettings = {
    currentTariff: DAY_NIGHT_TARIFF,
    battery: NO_BATTERY,
    ev: NO_EV,
  };

  it("adding a battery reduces total cost on a day/night tariff", () => {
    const simBattery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 10,
      usablePercent: 100,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const result = runSimulation(data, settingsNoBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: simBattery,
      ev: NO_EV,
    });

    // Battery charges at night (20c) and discharges during day (40c)
    // Should reduce cost
    expect(result.simulatedTotalCostCents).toBeLessThan(
      result.currentTotalCostCents,
    );
    expect(result.savingsCents).toBeGreaterThan(0);
  });

  it("battery with auto-detect charges during the cheapest period", () => {
    const simBattery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 5,
      usablePercent: 90,
      chargeStartHour: 0,
      chargeStartMinute: 0,
      chargeEndHour: 0,
      chargeEndMinute: 0,
      autoDetectCheapest: true, // should auto-detect night (23-8) as cheapest
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const result = runSimulation(data, settingsNoBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: simBattery,
      ev: NO_EV,
    });

    // With auto-detect, should still save money
    expect(result.savingsCents).toBeGreaterThan(0);
  });

  it("battery with 0 capacity has no effect", () => {
    const simBattery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 0,
      usablePercent: 90,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const result = runSimulation(data, settingsNoBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: simBattery,
      ev: NO_EV,
    });

    expect(result.savingsCents).toBe(0);
  });

  it("usable percent reduces effective battery capacity", () => {
    const battery100: BatterySettings = {
      hasBattery: true,
      capacityKwh: 10,
      usablePercent: 100,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const battery50: BatterySettings = {
      ...battery100,
      usablePercent: 50,
    };

    const result100 = runSimulation(data, settingsNoBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: battery100,
      ev: NO_EV,
    });

    const result50 = runSimulation(data, settingsNoBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: battery50,
      ev: NO_EV,
    });

    // 50% usable should save less than 100% usable
    expect(result100.savingsCents).toBeGreaterThan(result50.savingsCents);
    expect(result50.savingsCents).toBeGreaterThan(0);
  });

  it("simulated readings never go negative", () => {
    const simBattery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 100, // huge battery
      usablePercent: 100,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const result = runSimulation(data, settingsNoBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: simBattery,
      ev: NO_EV,
    });

    for (const day of result.simulatedDays) {
      for (const r of day.readings) {
        expect(r.kwh).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("removing a current battery and adding a different one works correctly", () => {
    const currentBattery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 5,
      usablePercent: 100,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const settingsWithBattery: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: currentBattery,
      ev: NO_EV,
    };

    const biggerBattery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 15,
      usablePercent: 100,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const result = runSimulation(data, settingsWithBattery, {
      tariff: DAY_NIGHT_TARIFF,
      battery: biggerBattery,
      ev: NO_EV,
    });

    // Bigger battery should save more vs the current battery
    expect(result.savingsCents).toBeGreaterThan(0);
    expect(result.simulatedDays.length).toBe(1);
  });
});

// ─── runSimulation — EV simulation ───

describe("runSimulation — EV", () => {
  // 2026-01-05 is a Monday
  const data = makeEnergyData(["2026-01-05"], 0.5);

  const settingsNoEV: UserSettings = {
    currentTariff: DAY_NIGHT_TARIFF,
    battery: NO_BATTERY,
    ev: NO_EV,
  };

  it("moving EV charging from day to night saves money", () => {
    // Build data that already includes EV load during day (8-12am)
    // Base usage 0.5 kWh per slot, plus 3.7 kWh EV during 8 slots (8am-12pm)
    const evDay: DayData = {
      date: "2026-01-05", // Monday
      readings: [],
      totalKwh: 0,
    };
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const base = 0.5;
        const evLoad = h >= 8 && h < 12 ? 3.7 : 0; // 7.4 kW × 0.5h
        evDay.readings.push({
          time: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
          kwh: base + evLoad,
        });
      }
    }
    evDay.totalKwh = evDay.readings.reduce((s, r) => s + r.kwh, 0);
    const evData: EnergyData = { mprn: "TEST", days: [evDay] };

    // Current: EV charges during day (8am-12pm = 8 slots)
    const currentEV: EVSettings = {
      hasEV: true,
      chargingStartHour: 8,
      chargingStartMinute: 0,
      chargingEndHour: 12,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const settingsWithDayEV: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: currentEV,
    };

    // Simulate: move EV charging to night, same window length (23-3am = 8 slots)
    const nightEV: EVSettings = {
      hasEV: true,
      chargingStartHour: 23,
      chargingStartMinute: 0,
      chargingEndHour: 3,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const result = runSimulation(evData, settingsWithDayEV, {
      tariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: nightEV,
    });

    // Same EV load moved from day rate (40c) to night rate (20c) — should save
    expect(result.savingsCents).toBeGreaterThan(0);
  });

  it("EV with 0 charging speed has no effect", () => {
    const zeroEV: EVSettings = {
      hasEV: true,
      chargingStartHour: 2,
      chargingStartMinute: 0,
      chargingEndHour: 6,
      chargingEndMinute: 0,
      chargingSpeedKw: 0,
    };

    const result = runSimulation(data, settingsNoEV, {
      tariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: zeroEV,
    });

    expect(result.savingsCents).toBe(0);
  });

  it("EV charging adds load to the simulated readings", () => {
    const simEV: EVSettings = {
      hasEV: true,
      chargingStartHour: 2,
      chargingStartMinute: 0,
      chargingEndHour: 6,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const result = runSimulation(data, settingsNoEV, {
      tariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: simEV,
    });

    // Simulated total should be higher (more load added)
    const simTotal = result.simulatedDays[0].totalKwh;
    const origTotal = data.days[0].totalKwh;
    expect(simTotal).toBeGreaterThan(origTotal);
  });
});

// ─── runSimulation — battery + EV combined ───

describe("runSimulation — battery + EV combined", () => {
  const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);

  it("battery + EV together produce different results than either alone", () => {
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const battery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 10,
      usablePercent: 90,
      chargeStartHour: 23,
      chargeStartMinute: 0,
      chargeEndHour: 8,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const ev: EVSettings = {
      hasEV: true,
      chargingStartHour: 23,
      chargingStartMinute: 0,
      chargingEndHour: 6,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const batteryOnly = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery,
      ev: NO_EV,
    });

    const evOnly = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev,
    });

    const both = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery,
      ev,
    });

    // Combined should be different from each alone
    expect(both.simulatedTotalCostCents).not.toBe(
      batteryOnly.simulatedTotalCostCents,
    );
    expect(both.simulatedTotalCostCents).not.toBe(
      evOnly.simulatedTotalCostCents,
    );
  });
});

// ─── runSimulation — multi-day consistency ───

describe("runSimulation — multi-day", () => {
  it("daily costs array matches the number of input days", () => {
    const dates = [
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ];
    const data = makeEnergyData(dates, 0.3);
    const settings: UserSettings = {
      currentTariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    expect(result.dailyCosts.length).toBe(5);
    expect(result.simulatedDays.length).toBe(5);
    expect(result.numDays).toBe(5);
  });

  it("total cost equals sum of daily costs", () => {
    const data = makeEnergyData(
      ["2026-01-05", "2026-01-06", "2026-01-07"],
      0.4,
    );
    const settings: UserSettings = {
      currentTariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    const sumCurrent = result.dailyCosts.reduce((s, d) => s + d.currentCost, 0);
    const sumSim = result.dailyCosts.reduce((s, d) => s + d.simulatedCost, 0);

    // Allow small floating point tolerance
    expect(Math.abs(result.currentTotalCostCents - sumCurrent)).toBeLessThan(1);
    expect(Math.abs(result.simulatedTotalCostCents - sumSim)).toBeLessThan(1);
  });

  it("simulated readings maintain 48 slots per day", () => {
    const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: {
        ...NO_BATTERY,
        hasBattery: true,
        capacityKwh: 10,
        usablePercent: 90,
        chargeStartHour: 0,
        chargeEndHour: 6,
        autoDetectCheapest: false,
      },
      ev: NO_EV,
    });

    for (const day of result.simulatedDays) {
      expect(day.readings.length).toBe(48);
    }
  });
});

// ─── runSimulation — with real Energia tariffs ───

describe("runSimulation — real Energia tariffs", () => {
  const evTariff = DEFAULT_TARIFFS.find(
    (t) => t.id === "energia-ev-smart-drive",
  )!;
  const flatTariff = DEFAULT_TARIFFS.find(
    (t) => t.id === "energia-smart-24-hour",
  )!;

  it("EV tariff is cheaper than flat tariff for night-heavy usage", () => {
    // Create data with heavy night usage (high 2-6am usage)
    const day: DayData = {
      date: "2026-01-05", // Monday
      readings: [],
      totalKwh: 0,
    };
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const kwh = h >= 2 && h < 6 ? 2.0 : 0.2;
        day.readings.push({
          time: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
          kwh,
        });
      }
    }
    day.totalKwh = day.readings.reduce((s, r) => s + r.kwh, 0);

    const data: EnergyData = { mprn: "TEST", days: [day] };

    const evCost = calculateTariffCost(data, evTariff);
    const flatCost = calculateTariffCost(data, flatTariff);

    // EV tariff should be cheaper for night-heavy usage
    expect(evCost.totalCost).toBeLessThan(flatCost.totalCost);
  });

  it("switching from flat to EV tariff with same data produces consistent simulation", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: flatTariff,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: evTariff,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    expect(result.currentTotalCostCents).toBeGreaterThan(0);
    expect(result.simulatedTotalCostCents).toBeGreaterThan(0);
    expect(typeof result.savingsPercent).toBe("number");
  });
});

// ─── Edge cases ───

describe("runSimulation — edge cases", () => {
  it("handles empty energy data", () => {
    const data: EnergyData = { mprn: "TEST", days: [] };
    const settings: UserSettings = {
      currentTariff: FLAT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: FLAT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    expect(result.numDays).toBe(0);
    expect(result.dailyCosts.length).toBe(0);
    expect(result.savingsCents).toBe(0);
  });

  it("handles a day with zero usage", () => {
    const data = makeEnergyData(["2026-01-05"], 0);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: {
        ...NO_BATTERY,
        hasBattery: true,
        capacityKwh: 10,
        usablePercent: 90,
        chargeStartHour: 23,
        chargeEndHour: 8,
        autoDetectCheapest: false,
      },
      ev: NO_EV,
    });

    // Should not crash, readings should still be non-negative
    for (const day of result.simulatedDays) {
      for (const r of day.readings) {
        expect(r.kwh).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("handles very large battery relative to daily usage", () => {
    const data = makeEnergyData(["2026-01-05"], 0.1); // 4.8 kWh/day
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: {
        hasBattery: true,
        capacityKwh: 100, // way larger than daily usage
        usablePercent: 100,
        chargeStartHour: 23,
        chargeStartMinute: 0,
        chargeEndHour: 8,
        chargeEndMinute: 0,
        autoDetectCheapest: false,
        dischargeWindows: [],
        minChargePercent: 5,
      },
      ev: NO_EV,
    });

    // Should still work, readings non-negative
    for (const day of result.simulatedDays) {
      for (const r of day.readings) {
        expect(r.kwh).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("readings are rounded to 4 decimal places", () => {
    const data = makeEnergyData(["2026-01-05"], 0.3333);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: {
        ...NO_BATTERY,
        hasBattery: true,
        capacityKwh: 5,
        usablePercent: 100,
        chargeStartHour: 23,
        chargeEndHour: 8,
        autoDetectCheapest: false,
      },
      ev: NO_EV,
    });

    for (const day of result.simulatedDays) {
      for (const r of day.readings) {
        const decimals = r.kwh.toString().split(".")[1]?.length ?? 0;
        expect(decimals).toBeLessThanOrEqual(4);
      }
    }
  });
});

// ─── getScheduleForDay — free day support ───

describe("getScheduleForDay — free day", () => {
  it("returns a free day schedule when freeDay is enabled for that day", () => {
    const tariff: Tariff = {
      ...FLAT_TARIFF,
      freeDay: { enabled: true, dayOfWeek: 0 }, // Sunday
    };

    const schedule = getScheduleForDay(tariff, 0);
    expect(schedule).not.toBeNull();
    expect(schedule!.rates.length).toBe(1);
    expect(schedule!.rates[0].ratePerKwh).toBe(0);
    expect(schedule!.rates[0].label).toBe("Free Day");
  });

  it("returns normal schedule for non-free days", () => {
    const tariff: Tariff = {
      ...FLAT_TARIFF,
      freeDay: { enabled: true, dayOfWeek: 0 }, // Sunday
    };

    const schedule = getScheduleForDay(tariff, 1); // Monday
    expect(schedule).not.toBeNull();
    expect(schedule!.rates[0].ratePerKwh).toBe(40); // normal rate
  });

  it("free day simulation shows savings", () => {
    const tariffWithFreeDay: Tariff = {
      ...FLAT_TARIFF,
      id: "free-sunday",
      freeDay: { enabled: true, dayOfWeek: 0 }, // Sunday
    };

    // 2026-01-04 is a Sunday
    const data = makeEnergyData(["2026-01-04"], 0.5);
    const settings: UserSettings = {
      currentTariff: FLAT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: tariffWithFreeDay,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    // Free day means simulated cost should be much lower
    expect(result.savingsCents).toBeGreaterThan(0);
    expect(result.simulatedTotalCostCents).toBeLessThan(
      result.currentTotalCostCents,
    );
  });
});

// ─── Battery discharge ordering ───

describe("runSimulation — battery discharge only after charge window", () => {
  // Day/Night: Night (23-8) = 20c, Day (8-23) = 40c
  // Battery charges 2-6am (4 hours = 8 slots)

  const makeBattery = (capacityKwh: number): BatterySettings => ({
    hasBattery: true,
    capacityKwh,
    usablePercent: 90,
    chargeStartHour: 2,
    chargeStartMinute: 0,
    chargeEndHour: 6,
    chargeEndMinute: 0,
    autoDetectCheapest: false,
    dischargeWindows: [],
    minChargePercent: 5,
  });

  it("larger battery saves more than smaller battery on same tariff", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5); // Monday
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    };

    const sim10 = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    });

    const sim15 = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(15),
      ev: NO_EV,
    });

    // 15 kWh battery should cost less or equal to 10 kWh battery
    expect(sim15.simulatedTotalCostCents).toBeLessThanOrEqual(
      sim10.simulatedTotalCostCents,
    );
  });

  it("increasing battery from current saves money (not costs more) with sufficient usage", () => {
    // Use higher base usage (1.5 kWh/slot = 72 kWh/day) so discharge is not
    // capped by per-slot consumption limits
    const data = makeEnergyData(["2026-01-05"], 1.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(15),
      ev: NO_EV,
    });

    // Should save money or break even, never cost more
    expect(result.savingsCents).toBeGreaterThanOrEqual(0);
  });

  it("battery does not discharge into pre-charge slots (00:00-02:00)", () => {
    // With charging 2-6am, slots at 00:00 and 00:30 are before the charge window.
    // The battery should NOT discharge into these slots.
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    });

    // Slots 00:00, 00:30, 01:00, 01:30 (indices 0-3) should NOT be reduced
    // by battery discharge. They should remain at original kWh (0.5).
    const preChargeSlots = result.simulatedDays[0].readings.slice(0, 4);
    for (const slot of preChargeSlots) {
      expect(slot.kwh).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("battery discharge occurs in expensive slots after charge window", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    });

    // Day slots (8-23) are expensive at 40c vs night 20c.
    // Battery should discharge here, reducing some readings below 0.5.
    const daySlots = result.simulatedDays[0].readings.filter((r) => {
      const h = parseInt(r.time.split(":")[0]);
      return h >= 8 && h < 23;
    });

    const someReduced = daySlots.some((r) => r.kwh < 0.5);
    expect(someReduced).toBe(true);
  });

  it("removing current battery undoes its effect symmetrically", () => {
    // If current has a 10kWh battery and sim has no battery,
    // the simulation should reverse the battery effect and cost more
    // (since the battery was saving money).
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    // Removing the battery should cost more (negative savings)
    expect(result.savingsCents).toBeLessThan(0);
  });

  it("works correctly with three-period tariff and auto-detect cheapest", () => {
    // Night (23-8)=15c is cheapest. Battery should charge there and discharge at peak (17-23)=55c.
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: THREE_PERIOD_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const sim10 = runSimulation(data, settings, {
      tariff: THREE_PERIOD_TARIFF,
      battery: {
        ...makeBattery(10),
        autoDetectCheapest: true,
      },
      ev: NO_EV,
    });

    const sim15 = runSimulation(data, settings, {
      tariff: THREE_PERIOD_TARIFF,
      battery: {
        ...makeBattery(15),
        autoDetectCheapest: true,
      },
      ev: NO_EV,
    });

    // Both should save money vs no battery
    expect(sim10.savingsCents).toBeGreaterThan(0);
    expect(sim15.savingsCents).toBeGreaterThan(0);
    // Larger battery should save at least as much
    expect(sim15.savingsCents).toBeGreaterThanOrEqual(sim10.savingsCents);
  });

  it("upgrading from 10 kWh to 15 kWh battery with 2-6am cheap rate is cheaper", () => {
    // Simulate a realistic scenario: user currently has a 10 kWh battery
    // charging 2-6am on a day/night tariff. They upgrade to 15 kWh.
    // The extra 4.5 kWh usable (at 90%) charges at the cheap night rate
    // and offsets expensive daytime usage, so the sim must be cheaper.
    const data = makeEnergyData(
      ["2026-01-05", "2026-01-06", "2026-01-07"],
      0.8,
    );
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(10),
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: makeBattery(15),
      ev: NO_EV,
    });

    // Must save money — strictly cheaper, not just break-even
    expect(result.savingsCents).toBeGreaterThan(0);
    expect(result.simulatedTotalCostCents).toBeLessThan(
      result.currentTotalCostCents,
    );
  });
});

// ─── Real sample CSV data with Energia EV tariff ───

describe("runSimulation — real sample CSV with Energia EV tariff", () => {
  const evTariff = DEFAULT_TARIFFS.find(
    (t) => t.id === "energia-ev-smart-drive",
  )!;

  // First row from sample CSV: 2024-04-01 (Monday)
  const sampleReadings: HalfHourReading[] = [
    { time: "00:00", kwh: 0 },
    { time: "00:30", kwh: 0 },
    { time: "01:00", kwh: 0 },
    { time: "01:30", kwh: 0.0575 },
    { time: "02:00", kwh: 1.644 },
    { time: "02:30", kwh: 1.6555 },
    { time: "03:00", kwh: 1.657 },
    { time: "03:30", kwh: 1.663 },
    { time: "04:00", kwh: 1.671 },
    { time: "04:30", kwh: 1.675 },
    { time: "05:00", kwh: 1.124 },
    { time: "05:30", kwh: 0.227 },
    { time: "06:00", kwh: 0.0105 },
    { time: "06:30", kwh: 0.008 },
    { time: "07:00", kwh: 0.01 },
    { time: "07:30", kwh: 0.0085 },
    { time: "08:00", kwh: 0 },
    { time: "08:30", kwh: 0 },
    { time: "09:00", kwh: 0.0075 },
    { time: "09:30", kwh: 0.009 },
    { time: "10:00", kwh: 0.0095 },
    { time: "10:30", kwh: 0.009 },
    { time: "11:00", kwh: 0.0095 },
    { time: "11:30", kwh: 0.0085 },
    { time: "12:00", kwh: 0.009 },
    { time: "12:30", kwh: 0.01 },
    { time: "13:00", kwh: 0.009 },
    { time: "13:30", kwh: 0.01 },
    { time: "14:00", kwh: 0.009 },
    { time: "14:30", kwh: 0 },
    { time: "15:00", kwh: 0 },
    { time: "15:30", kwh: 0.013 },
    { time: "16:00", kwh: 0.0095 },
    { time: "16:30", kwh: 0.011 },
    { time: "17:00", kwh: 0.0105 },
    { time: "17:30", kwh: 0.0125 },
    { time: "18:00", kwh: 0.009 },
    { time: "18:30", kwh: 0.0095 },
    { time: "19:00", kwh: 0.009 },
    { time: "19:30", kwh: 0.0085 },
    { time: "20:00", kwh: 0.0085 },
    { time: "20:30", kwh: 0.0075 },
    { time: "21:00", kwh: 0.008 },
    { time: "21:30", kwh: 0.01 },
    { time: "22:00", kwh: 0.0085 },
    { time: "22:30", kwh: 0.0085 },
    { time: "23:00", kwh: 0.009 },
    { time: "23:30", kwh: 0.0085 },
  ];

  const sampleDay: DayData = {
    date: "2024-04-01",
    readings: sampleReadings,
    totalKwh: sampleReadings.reduce((s, r) => s + r.kwh, 0),
  };

  const sampleData: EnergyData = { mprn: "TEST", days: [sampleDay] };

  const makeBat = (kwh: number): BatterySettings => ({
    hasBattery: true,
    capacityKwh: kwh,
    usablePercent: 90,
    chargeStartHour: 2,
    chargeStartMinute: 0,
    chargeEndHour: 6,
    chargeEndMinute: 0,
    autoDetectCheapest: false,
    dischargeWindows: [],
    minChargePercent: 5,
  });

  it("upgrading 10 kWh to 15 kWh battery on Energia EV tariff is cheaper", () => {
    const settings: UserSettings = {
      currentTariff: evTariff,
      battery: makeBat(10),
      ev: NO_EV,
    };

    const result = runSimulation(sampleData, settings, {
      tariff: evTariff,
      battery: makeBat(15),
      ev: NO_EV,
    });

    // A bigger battery should save money or at worst break even
    expect(result.savingsCents).toBeGreaterThanOrEqual(0);
  });
});

// ─── calculateTariffCost (used by simulation) ───

describe("calculateTariffCost", () => {
  it("flat rate: cost = kWh × rate + standing + PSO", () => {
    const tariff: Tariff = {
      ...FLAT_TARIFF,
      standingCharge: 100,
      psoLevy: 10,
    };
    const data = makeEnergyData(["2026-01-05"], 0.5); // 24 kWh

    const result = calculateTariffCost(data, tariff);
    // 24 × 40 + 100 + 10 = 960 + 110 = 1070
    expect(result.totalCost).toBeCloseTo(1070, 0);
    expect(result.dailyCosts.length).toBe(1);
  });

  it("day/night tariff splits cost by time period", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const dayNightResult = calculateTariffCost(data, DAY_NIGHT_TARIFF);
    const flatResult = calculateTariffCost(data, FLAT_TARIFF);

    // Day/Night should be cheaper than pure 40c flat since night is 20c
    // Night (23-8) = 18 slots × 0.5 × 20c = 180c
    // Day (8-23) = 30 slots × 0.5 × 40c = 600c
    // Total = 780c vs flat = 48 × 0.5 × 40 = 960c
    expect(dayNightResult.totalCost).toBeLessThan(flatResult.totalCost);
  });

  it("tiered pricing accumulates across days", () => {
    const tieredTariff: Tariff = {
      id: "test-tiered",
      name: "Tiered",
      provider: "Test",
      standingCharge: 0,
      psoLevy: 0,
      scheduleType: "uniform",
      uniformSchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 10, // base (overridden by tiers)
            label: "Standard",
            tiers: [
              { unitLimit: 10, ratePerKwh: 10, label: "Tier 1" },
              { unitLimit: null, ratePerKwh: 20, label: "Tier 2" },
            ],
          },
        ],
      },
    };

    // 2 days × 24 kWh = 48 kWh total
    // First 10 kWh at 10c, remaining 38 kWh at 20c
    // = 100 + 760 = 860c
    const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);
    const result = calculateTariffCost(data, tieredTariff);

    expect(result.totalCost).toBeCloseTo(860, 0);
  });
});

// ─── Forced discharge / grid export ───

describe("runSimulation — forced discharge windows", () => {
  // Day/Night: Night (23-8) = 20c, Day (8-23) = 40c
  const makeBatteryWithDischarge = (
    capacityKwh: number,
    dischargeWindows: BatterySettings["dischargeWindows"],
  ): BatterySettings => ({
    hasBattery: true,
    capacityKwh,
    usablePercent: 90,
    chargeStartHour: 2,
    chargeStartMinute: 0,
    chargeEndHour: 6,
    chargeEndMinute: 0,
    autoDetectCheapest: false,
    dischargeWindows,
    minChargePercent: 5,
  });

  it("forced discharge window generates export revenue", () => {
    // Battery charges 2-6am at 20c, forced discharge 17-19 at 21c export rate
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const batteryWithExport = makeBatteryWithDischarge(10, [
      {
        startHour: 17,
        startMinute: 0,
        endHour: 19,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
    ]);

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: batteryWithExport,
      ev: NO_EV,
    });

    // Should generate export revenue
    expect(result.exportRevenueCents).toBeGreaterThan(0);
    // Should save money overall (cheap charge + expensive offset + export)
    expect(result.savingsCents).toBeGreaterThan(0);
  });

  it("forced discharge respects minChargePercent", () => {
    // With 10kWh battery and 5% min, minimum SoC = 0.5kWh
    // 90% usable = 9kWh. Battery can discharge down to 0.5kWh = 8.5kWh max discharge.
    // Discharge rate = 10/6 ≈ 1.667 kWh/slot
    // With 4 slots (17-19), max discharge = min(4 * 1.667, 8.5) = 6.667 kWh
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    // With high minChargePercent (50%), less discharge available
    const batteryHigh = makeBatteryWithDischarge(10, [
      {
        startHour: 17,
        startMinute: 0,
        endHour: 19,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
    ]);
    batteryHigh.minChargePercent = 50; // min 5kWh, usable 9kWh, max discharge = 4kWh

    const batteryLow = makeBatteryWithDischarge(10, [
      {
        startHour: 17,
        startMinute: 0,
        endHour: 19,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
    ]);
    batteryLow.minChargePercent = 5; // min 0.5kWh, usable 9kWh, max discharge = 8.5kWh

    const resultHigh = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: batteryHigh,
      ev: NO_EV,
    });

    const resultLow = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: batteryLow,
      ev: NO_EV,
    });

    // Lower min charge = more discharge available = more export revenue
    expect(resultLow.exportRevenueCents).toBeGreaterThan(
      resultHigh.exportRevenueCents,
    );
  });

  it("multiple forced discharge windows work correctly", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const singleWindow = makeBatteryWithDischarge(10, [
      {
        startHour: 17,
        startMinute: 0,
        endHour: 19,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
    ]);

    const doubleWindow = makeBatteryWithDischarge(10, [
      {
        startHour: 17,
        startMinute: 0,
        endHour: 18,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
      {
        startHour: 20,
        startMinute: 0,
        endHour: 21,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
    ]);

    const resultSingle = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: singleWindow,
      ev: NO_EV,
    });

    const resultDouble = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: doubleWindow,
      ev: NO_EV,
    });

    // Both should produce export revenue
    expect(resultSingle.exportRevenueCents).toBeGreaterThan(0);
    expect(resultDouble.exportRevenueCents).toBeGreaterThan(0);
  });

  it("no discharge windows produces zero export revenue", () => {
    const data = makeEnergyData(["2026-01-05"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const batteryNoExport = makeBatteryWithDischarge(10, []);

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: batteryNoExport,
      ev: NO_EV,
    });

    expect(result.exportRevenueCents).toBe(0);
  });

  it("forced discharge can make readings go negative (export)", () => {
    // Very low base load (0.1 kWh/slot) with large battery forced discharge
    const data = makeEnergyData(["2026-01-05"], 0.1);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const battery = makeBatteryWithDischarge(10, [
      {
        startHour: 17,
        startMinute: 0,
        endHour: 19,
        endMinute: 0,
        exportRatePerKwh: 21,
      },
    ]);

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery,
      ev: NO_EV,
    });

    // Some readings in the forced discharge window should be negative
    const forcedSlots = result.simulatedDays[0].readings.filter((r) => {
      const h = parseInt(r.time.split(":")[0]);
      return h >= 17 && h < 19;
    });

    const someNegative = forcedSlots.some((r) => r.kwh < 0);
    expect(someNegative).toBe(true);
    expect(result.exportRevenueCents).toBeGreaterThan(0);
  });

  it("export revenue calculation is correct", () => {
    // Use a flat tariff so there's no "expensive vs cheap" distinction
    // Battery charges 2-6am, forced discharge 8-10am at 25c export rate
    // Base load 0.1 kWh/slot
    const CHEAP_FLAT: Tariff = {
      id: "test-cheap-flat",
      name: "Cheap Flat",
      provider: "Test",
      standingCharge: 0,
      psoLevy: 0,
      scheduleType: "uniform",
      uniformSchedule: {
        rates: [
          {
            startHour: 0,
            startMinute: 0,
            endHour: 24,
            endMinute: 0,
            ratePerKwh: 10,
            label: "Standard",
          },
        ],
      },
    };

    const data = makeEnergyData(["2026-01-05"], 0.1);
    const settings: UserSettings = {
      currentTariff: CHEAP_FLAT,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const battery = makeBatteryWithDischarge(10, [
      {
        startHour: 8,
        startMinute: 0,
        endHour: 10,
        endMinute: 0,
        exportRatePerKwh: 25,
      },
    ]);

    const result = runSimulation(data, settings, {
      tariff: CHEAP_FLAT,
      battery,
      ev: NO_EV,
    });

    // Export revenue should be positive and calculated from exported kWh × rate
    expect(result.exportRevenueCents).toBeGreaterThan(0);
  });
});

// ─── Real CSV regression tests ───

import { readFileSync } from "fs";
import { join } from "path";
import { parseEnergiaCSV } from "../app/lib/parseCSV";

describe("real CSV data regression", () => {
  const csvPath = join(
    __dirname,
    "..",
    "public",
    "sampledata",
    "EnergiaSample_April2024_Feb2026.csv",
  );
  const csvText = readFileSync(csvPath, "utf-8");
  const data = parseEnergiaCSV(csvText);
  const tariff = DEFAULT_TARIFFS[0]; // Energia EV Smart Drive

  it("upgrading battery from 10kWh to 15kWh should not cost more", () => {
    const battery10: BatterySettings = {
      hasBattery: true,
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

    const battery15: BatterySettings = {
      ...battery10,
      capacityKwh: 15,
    };

    const currentSettings: UserSettings = {
      currentTariff: tariff,
      battery: battery10,
      ev: NO_EV,
    };

    // Simulate upgrading from 10kWh to 15kWh
    const result = runSimulation(data, currentSettings, {
      tariff,
      battery: battery15,
      ev: NO_EV,
    });

    // A bigger battery should save money or break even, never cost more
    expect(result.savingsCents).toBeGreaterThanOrEqual(0);
    expect(result.simulatedTotalCostCents).toBeLessThanOrEqual(
      result.currentTotalCostCents,
    );
  });

  it("adding a 10kWh battery (from no battery) should save money", () => {
    const noBattery: BatterySettings = {
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

    const battery10: BatterySettings = {
      ...noBattery,
      hasBattery: true,
    };

    const currentSettings: UserSettings = {
      currentTariff: tariff,
      battery: noBattery,
      ev: NO_EV,
    };

    const result = runSimulation(data, currentSettings, {
      tariff,
      battery: battery10,
      ev: NO_EV,
    });

    expect(result.savingsCents).toBeGreaterThan(0);
    expect(result.simulatedTotalCostCents).toBeLessThan(
      result.currentTotalCostCents,
    );
  });

  it("adding a 15kWh battery (from no battery) should save more than 10kWh", () => {
    const noBattery: BatterySettings = {
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

    const battery10: BatterySettings = {
      ...noBattery,
      hasBattery: true,
      capacityKwh: 10,
    };
    const battery15: BatterySettings = {
      ...noBattery,
      hasBattery: true,
      capacityKwh: 15,
    };

    const currentSettings: UserSettings = {
      currentTariff: tariff,
      battery: noBattery,
      ev: NO_EV,
    };

    const result10 = runSimulation(data, currentSettings, {
      tariff,
      battery: battery10,
      ev: NO_EV,
    });

    const result15 = runSimulation(data, currentSettings, {
      tariff,
      battery: battery15,
      ev: NO_EV,
    });

    // Both should save money
    expect(result10.savingsCents).toBeGreaterThan(0);
    expect(result15.savingsCents).toBeGreaterThan(0);
    // 15kWh should save at least as much as 10kWh
    expect(result15.savingsCents).toBeGreaterThanOrEqual(result10.savingsCents);
  });

  it("exact UI scenario: 10kWh→15kWh with EV should not cost more", () => {
    // Exact settings from the UI console log that showed -4.1% (more expensive)
    const ev: EVSettings = {
      hasEV: true,
      chargingStartHour: 2,
      chargingStartMinute: 0,
      chargingEndHour: 6,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const battery10: BatterySettings = {
      hasBattery: true,
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

    const battery15: BatterySettings = {
      ...battery10,
      capacityKwh: 15,
    };

    const currentSettings: UserSettings = {
      currentTariff: tariff,
      battery: battery10,
      ev,
    };

    const result = runSimulation(data, currentSettings, {
      tariff,
      battery: battery15,
      ev,
    });

    // Upgrading battery should save money, not cost more
    expect(result.savingsCents).toBeGreaterThanOrEqual(0);
    expect(result.simulatedTotalCostCents).toBeLessThanOrEqual(
      result.currentTotalCostCents,
    );
  });
});

// ─── Identity tests ───

describe("identity — no changes should produce zero savings", () => {
  it("no battery, no EV, same tariff", () => {
    const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);
    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery: NO_BATTERY,
      ev: NO_EV,
    });

    expect(result.savingsCents).toBe(0);
    expect(result.simulatedTotalCostCents).toBe(result.currentTotalCostCents);
    // Every reading should match the original exactly
    for (let d = 0; d < data.days.length; d++) {
      for (let i = 0; i < 48; i++) {
        expect(result.simulatedDays[d].readings[i].kwh).toBe(
          data.days[d].readings[i].kwh,
        );
      }
    }
  });

  it("with battery, no EV, same tariff", () => {
    const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);
    const battery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 10,
      usablePercent: 90,
      chargeStartHour: 2,
      chargeStartMinute: 0,
      chargeEndHour: 6,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };

    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery,
      ev: NO_EV,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery,
      ev: NO_EV,
    });

    expect(result.savingsCents).toBe(0);
    expect(result.simulatedTotalCostCents).toBe(result.currentTotalCostCents);
    // Every reading should match the original exactly
    for (let d = 0; d < data.days.length; d++) {
      for (let i = 0; i < 48; i++) {
        expect(result.simulatedDays[d].readings[i].kwh).toBe(
          data.days[d].readings[i].kwh,
        );
      }
    }
  });

  it("with battery and EV, same tariff", () => {
    const data = makeEnergyData(["2026-01-05", "2026-01-06"], 0.5);
    const battery: BatterySettings = {
      hasBattery: true,
      capacityKwh: 10,
      usablePercent: 90,
      chargeStartHour: 2,
      chargeStartMinute: 0,
      chargeEndHour: 6,
      chargeEndMinute: 0,
      autoDetectCheapest: false,
      dischargeWindows: [],
      minChargePercent: 5,
    };
    const ev: EVSettings = {
      hasEV: true,
      chargingStartHour: 2,
      chargingStartMinute: 0,
      chargingEndHour: 6,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const settings: UserSettings = {
      currentTariff: DAY_NIGHT_TARIFF,
      battery,
      ev,
    };

    const result = runSimulation(data, settings, {
      tariff: DAY_NIGHT_TARIFF,
      battery,
      ev,
    });

    expect(result.savingsCents).toBe(0);
    expect(result.simulatedTotalCostCents).toBe(result.currentTotalCostCents);
    // Every reading should match the original exactly
    for (let d = 0; d < data.days.length; d++) {
      for (let i = 0; i < 48; i++) {
        expect(result.simulatedDays[d].readings[i].kwh).toBe(
          data.days[d].readings[i].kwh,
        );
      }
    }
  });

  it("with battery and EV on real CSV data", () => {
    const battery: BatterySettings = {
      hasBattery: true,
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
    const ev: EVSettings = {
      hasEV: true,
      chargingStartHour: 2,
      chargingStartMinute: 0,
      chargingEndHour: 6,
      chargingEndMinute: 0,
      chargingSpeedKw: 7.4,
    };

    const csvPath = join(
      __dirname,
      "..",
      "public",
      "sampledata",
      "EnergiaSample_April2024_Feb2026.csv",
    );
    const csvText = readFileSync(csvPath, "utf-8");
    const csvData = parseEnergiaCSV(csvText);
    const realTariff = DEFAULT_TARIFFS[0];

    const settings: UserSettings = {
      currentTariff: realTariff,
      battery,
      ev,
    };

    const result = runSimulation(csvData, settings, {
      tariff: realTariff,
      battery,
      ev,
    });

    expect(result.savingsCents).toBe(0);
    expect(result.simulatedTotalCostCents).toBe(result.currentTotalCostCents);
    // Every reading should match the original exactly
    for (let d = 0; d < csvData.days.length; d++) {
      for (let i = 0; i < 48; i++) {
        expect(result.simulatedDays[d].readings[i].kwh).toBe(
          csvData.days[d].readings[i].kwh,
        );
      }
    }
  });
});
