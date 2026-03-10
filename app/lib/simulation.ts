import {
  EnergyData, DayData, Tariff, BatterySettings, EVSettings,
  UserSettings, SimulationConfig, SimulationResult,
} from './types';
import {
  getScheduleForDay, getRateInfoForTime, calculateTariffCost,
} from './analytics';
import { parseISO, getDay } from 'date-fns';

/**
 * Find the cheapest rate period for a given tariff and day of week.
 * Returns the start/end hours of the cheapest period.
 */
export function findCheapestPeriod(tariff: Tariff, dayOfWeek: number): { startHour: number; startMinute: number; endHour: number; endMinute: number } {
  const schedule = getScheduleForDay(tariff, dayOfWeek);
  if (!schedule || schedule.rates.length === 0) {
    return { startHour: 2, startMinute: 0, endHour: 6, endMinute: 0 };
  }
  let cheapest = schedule.rates[0];
  for (const rate of schedule.rates) {
    const effectiveRate = rate.tiers && rate.tiers.length > 0 ? rate.tiers[0].ratePerKwh : rate.ratePerKwh;
    const cheapestRate = cheapest.tiers && cheapest.tiers.length > 0 ? cheapest.tiers[0].ratePerKwh : cheapest.ratePerKwh;
    if (effectiveRate < cheapestRate) {
      cheapest = rate;
    }
  }
  return {
    startHour: cheapest.startHour,
    startMinute: cheapest.startMinute,
    endHour: cheapest.endHour,
    endMinute: cheapest.endMinute,
  };
}

/**
 * Check if a time slot (hour:minute) falls within a time range, handling midnight wrap.
 */
function isInTimeRange(hour: number, minute: number, startHour: number, startMinute: number, endHour: number, endMinute: number): boolean {
  const t = hour * 60 + minute;
  const s = startHour * 60 + startMinute;
  const e = endHour * 60 + endMinute;
  if (e > s) {
    return t >= s && t < e;
  } else {
    // Wraps midnight
    return t >= s || t < e;
  }
}

/**
 * Count how many half-hour slots fall within a time range.
 */
function countSlotsInRange(startHour: number, startMinute: number, endHour: number, endMinute: number): number {
  const s = startHour * 60 + startMinute;
  const e = endHour * 60 + endMinute;
  if (e > s) {
    return (e - s) / 30;
  } else {
    return (1440 - s + e) / 30;
  }
}

/**
 * Simulate a single day's readings with battery and EV changes.
 *
 * Battery logic:
 * - During charging hours, the battery draws from the grid (adds to readings).
 * - When the tariff switches to a more expensive period, the battery discharges
 *   over 6 hours (12 half-hour slots), reducing grid draw (subtracts from readings).
 *
 * EV logic:
 * - Remove EV load from old charging window, add to new charging window.
 */
function simulateDay(
  day: DayData,
  dayOfWeek: number,
  currentBattery: BatterySettings,
  currentEV: EVSettings,
  simBattery: BatterySettings,
  simEV: EVSettings,
  currentTariff: Tariff,
  simTariff: Tariff,
): DayData {
  // Clone readings
  const readings = day.readings.map(r => ({ ...r }));

  // --- Remove current battery effect ---
  if (currentBattery.hasBattery && currentBattery.capacityKwh > 0) {
    const usable = currentBattery.capacityKwh * (currentBattery.usablePercent / 100);
    const chargeHours = currentBattery.autoDetectCheapest
      ? findCheapestPeriod(currentTariff, dayOfWeek)
      : { startHour: currentBattery.chargeStartHour, startMinute: currentBattery.chargeStartMinute, endHour: currentBattery.chargeEndHour, endMinute: currentBattery.chargeEndMinute };

    const chargeSlots = countSlotsInRange(chargeHours.startHour, chargeHours.startMinute, chargeHours.endHour, chargeHours.endMinute);
    const chargePerSlot = chargeSlots > 0 ? usable / chargeSlots : 0;
    const dischargePerSlot = usable / 12; // 6 hours = 12 slots

    // Remove charging load (battery was drawing from grid)
    for (const r of readings) {
      const [h, m] = r.time.split(':').map(Number);
      if (isInTimeRange(h, m, chargeHours.startHour, chargeHours.startMinute, chargeHours.endHour, chargeHours.endMinute)) {
        r.kwh = Math.max(0, r.kwh - chargePerSlot);
      }
    }

    // Remove discharge effect (battery was supplying, so grid draw was lower — add it back)
    // Find the expensive period (right after cheap period ends)
    let remaining = usable;
    let discharging = false;
    // Sort slots by time to find post-charge period
    for (const r of readings) {
      const [h, m] = r.time.split(':').map(Number);
      const inCharge = isInTimeRange(h, m, chargeHours.startHour, chargeHours.startMinute, chargeHours.endHour, chargeHours.endMinute);
      if (!inCharge && remaining > 0) {
        // Check if this is more expensive than the charging period
        const rateInfo = getRateInfoForTime(currentTariff, dayOfWeek, h, m);
        const chargeRateInfo = getRateInfoForTime(currentTariff, dayOfWeek, chargeHours.startHour, chargeHours.startMinute);
        if (rateInfo.ratePerKwh > chargeRateInfo.ratePerKwh) {
          const add = Math.min(dischargePerSlot, remaining);
          r.kwh += add;
          remaining -= add;
          discharging = true;
        }
      }
    }
  }

  // --- Remove current EV effect ---
  if (currentEV.hasEV && currentEV.chargingSpeedKw > 0) {
    const evPerSlot = currentEV.chargingSpeedKw * 0.5;
    for (const r of readings) {
      const [h, m] = r.time.split(':').map(Number);
      if (isInTimeRange(h, m, currentEV.chargingStartHour, currentEV.chargingStartMinute, currentEV.chargingEndHour, currentEV.chargingEndMinute)) {
        r.kwh = Math.max(0, r.kwh - evPerSlot);
      }
    }
  }

  // --- Apply simulated battery ---
  if (simBattery.hasBattery && simBattery.capacityKwh > 0) {
    const usable = simBattery.capacityKwh * (simBattery.usablePercent / 100);
    const chargeHours = simBattery.autoDetectCheapest
      ? findCheapestPeriod(simTariff, dayOfWeek)
      : { startHour: simBattery.chargeStartHour, startMinute: simBattery.chargeStartMinute, endHour: simBattery.chargeEndHour, endMinute: simBattery.chargeEndMinute };

    const chargeSlots = countSlotsInRange(chargeHours.startHour, chargeHours.startMinute, chargeHours.endHour, chargeHours.endMinute);
    const chargePerSlot = chargeSlots > 0 ? usable / chargeSlots : 0;
    const dischargePerSlot = usable / 12;

    // Add charging load
    for (const r of readings) {
      const [h, m] = r.time.split(':').map(Number);
      if (isInTimeRange(h, m, chargeHours.startHour, chargeHours.startMinute, chargeHours.endHour, chargeHours.endMinute)) {
        r.kwh += chargePerSlot;
      }
    }

    // Apply discharge during expensive periods
    let remaining = usable;
    for (const r of readings) {
      if (remaining <= 0) break;
      const [h, m] = r.time.split(':').map(Number);
      const inCharge = isInTimeRange(h, m, chargeHours.startHour, chargeHours.startMinute, chargeHours.endHour, chargeHours.endMinute);
      if (!inCharge) {
        const rateInfo = getRateInfoForTime(simTariff, dayOfWeek, h, m);
        const chargeRateInfo = getRateInfoForTime(simTariff, dayOfWeek, chargeHours.startHour, chargeHours.startMinute);
        if (rateInfo.ratePerKwh > chargeRateInfo.ratePerKwh) {
          const sub = Math.min(dischargePerSlot, remaining, r.kwh);
          r.kwh -= sub;
          remaining -= sub;
        }
      }
    }
  }

  // --- Apply simulated EV ---
  if (simEV.hasEV && simEV.chargingSpeedKw > 0) {
    const evPerSlot = simEV.chargingSpeedKw * 0.5;
    for (const r of readings) {
      const [h, m] = r.time.split(':').map(Number);
      if (isInTimeRange(h, m, simEV.chargingStartHour, simEV.chargingStartMinute, simEV.chargingEndHour, simEV.chargingEndMinute)) {
        r.kwh += evPerSlot;
      }
    }
  }

  // Round and compute total
  for (const r of readings) {
    r.kwh = Math.round(r.kwh * 10000) / 10000;
  }
  const totalKwh = readings.reduce((s, r) => s + r.kwh, 0);

  return { date: day.date, readings, totalKwh: Math.round(totalKwh * 10000) / 10000 };
}

/**
 * Run the full simulation across all days.
 */
export function runSimulation(
  data: EnergyData,
  currentSettings: UserSettings,
  simConfig: SimulationConfig,
): SimulationResult {
  // Compute current cost
  const currentCostResult = calculateTariffCost(data, currentSettings.currentTariff);

  // Build simulated days
  const simulatedDays: DayData[] = data.days.map(day => {
    const dayOfWeek = getDay(parseISO(day.date));
    return simulateDay(
      day, dayOfWeek,
      currentSettings.battery, currentSettings.ev,
      simConfig.battery, simConfig.ev,
      currentSettings.currentTariff, simConfig.tariff,
    );
  });

  const simulatedData: EnergyData = { mprn: data.mprn, days: simulatedDays };
  const simCostResult = calculateTariffCost(simulatedData, simConfig.tariff);

  // Build daily cost comparison
  const dailyCosts = data.days.map((day, i) => ({
    date: day.date,
    currentCost: currentCostResult.dailyCosts[i]?.cost ?? 0,
    simulatedCost: simCostResult.dailyCosts[i]?.cost ?? 0,
  }));

  const savingsCents = currentCostResult.totalCost - simCostResult.totalCost;
  const savingsPercent = currentCostResult.totalCost > 0
    ? Math.round((savingsCents / currentCostResult.totalCost) * 1000) / 10
    : 0;
  const numDays = data.days.length;
  const yearlySavingsCents = numDays > 0 ? (savingsCents / numDays) * 365 : 0;

  return {
    currentTotalCostCents: currentCostResult.totalCost,
    simulatedTotalCostCents: simCostResult.totalCost,
    savingsCents,
    savingsPercent,
    yearlySavingsCents,
    dailyCosts,
    simulatedDays,
    numDays,
  };
}
