import {
  EnergyData,
  DayData,
  Tariff,
  BatterySettings,
  EVSettings,
  UserSettings,
  SimulationConfig,
  SimulationResult,
} from "./types";
import {
  getScheduleForDay,
  getRateInfoForTime,
  calculateTariffCost,
} from "./analytics";
import { parseISO, getDay } from "date-fns";

/**
 * Find the cheapest rate period for a given tariff and day of week.
 * Returns the start/end hours of the cheapest period.
 */
export function findCheapestPeriod(
  tariff: Tariff,
  dayOfWeek: number,
): {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
} {
  const schedule = getScheduleForDay(tariff, dayOfWeek);
  if (!schedule || schedule.rates.length === 0) {
    return { startHour: 2, startMinute: 0, endHour: 6, endMinute: 0 };
  }
  let cheapest = schedule.rates[0];
  for (const rate of schedule.rates) {
    const effectiveRate =
      rate.tiers && rate.tiers.length > 0
        ? rate.tiers[0].ratePerKwh
        : rate.ratePerKwh;
    const cheapestRate =
      cheapest.tiers && cheapest.tiers.length > 0
        ? cheapest.tiers[0].ratePerKwh
        : cheapest.ratePerKwh;
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
export function isInTimeRange(
  hour: number,
  minute: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): boolean {
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
function countSlotsInRange(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): number {
  const s = startHour * 60 + startMinute;
  const e = endHour * 60 + endMinute;
  if (e > s) {
    return (e - s) / 30;
  } else {
    return (1440 - s + e) / 30;
  }
}

/**
 * Strip battery and EV effects from readings to recover the base household load.
 *
 * Battery stripping is deterministic: mirrors the applyBatteryEffect logic in
 * reverse, since the battery charges/discharges predictably every day.
 *
 * EV stripping uses detection: the EV doesn't charge every day, so we check
 * thresholds to determine if it was charging in each slot. Returns the total
 * EV energy detected so the simulation can redistribute it across new hours.
 */
function stripCurrentEffects(
  readings: { time: string; kwh: number }[],
  battery: BatterySettings,
  ev: EVSettings,
  tariff: Tariff,
  dayOfWeek: number,
): { evEnergyKwh: number; evPerSlotStripped: number[] } {
  const hasBattery = battery.hasBattery && battery.capacityKwh > 0;
  const hasEV = ev.hasEV && ev.chargingSpeedKw > 0;

  if (!hasBattery && !hasEV) return { evEnergyKwh: 0, evPerSlotStripped: [] };

  const evPerSlot = hasEV ? ev.chargingSpeedKw * 0.5 : 0;

  // EV stripping first: detection-based since EV doesn't charge every day.
  // Done before battery stripping so readings are still high enough (battery charge
  // is still present) to reliably detect EV charging.
  // Track per-slot amounts stripped so we can put back exact amounts when the
  // EV window is unchanged, or redistribute evenly when the window changes.
  let evEnergyKwh = 0;
  const evPerSlotStripped = new Array(readings.length).fill(0);
  if (hasEV) {
    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      const [h, m] = r.time.split(":").map(Number);
      if (
        isInTimeRange(
          h,
          m,
          ev.chargingStartHour,
          ev.chargingStartMinute,
          ev.chargingEndHour,
          ev.chargingEndMinute,
        )
      ) {
        if (r.kwh > evPerSlot * 0.5) {
          const stripped = Math.min(evPerSlot, r.kwh);
          r.kwh -= stripped;
          evEnergyKwh += stripped;
          evPerSlotStripped[i] = stripped;
        }
      }
    }
  }

  if (hasBattery) {
    // Deterministic battery stripping: simulate what the battery did, then reverse it.
    // We iterate to converge on the true base load, since the battery algorithm
    // depends on the base load (for discharge limiting).
    const maxUsable = battery.capacityKwh * (battery.usablePercent / 100);
    const dischargePerSlot = battery.capacityKwh / 6;
    const minCharge =
      battery.capacityKwh * ((battery.minChargePercent ?? 5) / 100);
    const dischargeWindows = battery.dischargeWindows ?? [];

    const chargeHours = battery.autoDetectCheapest
      ? findCheapestPeriod(tariff, dayOfWeek)
      : {
          startHour: battery.chargeStartHour,
          startMinute: battery.chargeStartMinute,
          endHour: battery.chargeEndHour,
          endMinute: battery.chargeEndMinute,
        };

    const chargeSlots = countSlotsInRange(
      chargeHours.startHour,
      chargeHours.startMinute,
      chargeHours.endHour,
      chargeHours.endMinute,
    );

    const chargeRateInfo = getRateInfoForTime(
      tariff,
      dayOfWeek,
      chargeHours.startHour,
      chargeHours.startMinute,
    );

    // Save the original readings (with battery effects baked in)
    const original = readings.map((r) => r.kwh);

    // Initial base load estimate: start with original readings
    let baseEstimate = original.slice();

    // Iterate to converge: simulate battery on base estimate, compute deltas, refine
    for (let iter = 0; iter < 3; iter++) {
      // --- First pass of applyBatteryEffect: compute effective charge ---
      let forcedDischargeReserve = 0;
      for (let i = 0; i < readings.length; i++) {
        const [h, m] = readings[i].time.split(":").map(Number);
        for (const dw of dischargeWindows) {
          if (
            isInTimeRange(
              h,
              m,
              dw.startHour,
              dw.startMinute,
              dw.endHour,
              dw.endMinute,
            )
          ) {
            forcedDischargeReserve += dischargePerSlot;
            break;
          }
        }
      }
      forcedDischargeReserve = Math.min(
        forcedDischargeReserve,
        maxUsable - minCharge,
      );

      let simSoC = 0;
      let totalDischargeable = 0;
      let remainingForcedReserve = forcedDischargeReserve;

      for (let i = 0; i < readings.length; i++) {
        const [h, m] = readings[i].time.split(":").map(Number);
        const inChargeWindow = isInTimeRange(
          h,
          m,
          chargeHours.startHour,
          chargeHours.startMinute,
          chargeHours.endHour,
          chargeHours.endMinute,
        );

        let forcedDischargeRate = -1;
        for (const dw of dischargeWindows) {
          if (
            isInTimeRange(
              h,
              m,
              dw.startHour,
              dw.startMinute,
              dw.endHour,
              dw.endMinute,
            )
          ) {
            forcedDischargeRate = dw.exportRatePerKwh;
            break;
          }
        }

        if (inChargeWindow) {
          const chargePerSlot = chargeSlots > 0 ? maxUsable / chargeSlots : 0;
          simSoC = Math.min(maxUsable, simSoC + chargePerSlot);
        } else if (forcedDischargeRate >= 0 && simSoC > minCharge) {
          const maxDrain = Math.min(dischargePerSlot, simSoC - minCharge);
          totalDischargeable += maxDrain;
          simSoC -= maxDrain;
          remainingForcedReserve = Math.max(
            0,
            remainingForcedReserve - maxDrain,
          );
        } else {
          const rateInfo = getRateInfoForTime(tariff, dayOfWeek, h, m);
          const floorSoC = minCharge + remainingForcedReserve;
          if (
            rateInfo.ratePerKwh > chargeRateInfo.ratePerKwh &&
            simSoC > floorSoC
          ) {
            const maxDrain = Math.min(
              dischargePerSlot,
              simSoC - floorSoC,
              baseEstimate[i],
            );
            totalDischargeable += maxDrain;
            simSoC -= maxDrain;
          }
        }
      }

      const effectiveUsable = Math.min(maxUsable, totalDischargeable);
      const chargePerSlot = chargeSlots > 0 ? effectiveUsable / chargeSlots : 0;

      // --- Second pass: compute per-slot deltas ---
      let soc = 0;
      let remainingForcedReserve2 = forcedDischargeReserve;
      const deltas = new Array(readings.length).fill(0);

      for (let i = 0; i < readings.length; i++) {
        const [h, m] = readings[i].time.split(":").map(Number);
        const inChargeWindow = isInTimeRange(
          h,
          m,
          chargeHours.startHour,
          chargeHours.startMinute,
          chargeHours.endHour,
          chargeHours.endMinute,
        );

        let forcedDischargeRate = -1;
        for (const dw of dischargeWindows) {
          if (
            isInTimeRange(
              h,
              m,
              dw.startHour,
              dw.startMinute,
              dw.endHour,
              dw.endMinute,
            )
          ) {
            forcedDischargeRate = dw.exportRatePerKwh;
            break;
          }
        }

        if (inChargeWindow) {
          const actualCharge = Math.min(chargePerSlot, effectiveUsable - soc);
          soc += actualCharge;
          deltas[i] = actualCharge; // battery added this much load
        } else if (forcedDischargeRate >= 0 && soc > minCharge) {
          const maxDrain = Math.min(dischargePerSlot, soc - minCharge);
          deltas[i] = -maxDrain; // battery reduced load by this much
          soc -= maxDrain;
          remainingForcedReserve2 = Math.max(
            0,
            remainingForcedReserve2 - maxDrain,
          );
        } else {
          const floorSoC = minCharge + remainingForcedReserve2;
          const rateInfo = getRateInfoForTime(tariff, dayOfWeek, h, m);
          if (
            rateInfo.ratePerKwh > chargeRateInfo.ratePerKwh &&
            soc > floorSoC
          ) {
            const maxDrain = Math.min(
              dischargePerSlot,
              soc - floorSoC,
              baseEstimate[i],
            );
            deltas[i] = -maxDrain; // battery reduced load by this much
            soc -= maxDrain;
          }
        }
      }

      // Refine base estimate: original reading minus the battery delta
      baseEstimate = original.map((orig, i) => Math.max(0, orig - deltas[i]));
    }

    // Apply the converged base estimate
    for (let i = 0; i < readings.length; i++) {
      readings[i].kwh = baseEstimate[i];
    }
  }

  return { evEnergyKwh, evPerSlotStripped };
}

/**
 * Compute per-slot battery deltas and export revenue without mutating readings.
 *
 * Two-pass algorithm:
 * 1. First pass computes totalDischargeable to cap effectiveUsable
 * 2. Second pass computes actual per-slot deltas (positive = charge, negative = discharge)
 *
 * Returns deltas array and export revenue.
 */
function computeBatteryDeltas(
  times: { h: number; m: number }[],
  baseLoad: number[],
  battery: BatterySettings,
  tariff: Tariff,
  dayOfWeek: number,
): { deltas: number[]; exportRevenueCents: number } {
  const n = times.length;
  const deltas = new Array(n).fill(0);

  if (!battery.hasBattery || battery.capacityKwh <= 0) {
    return { deltas, exportRevenueCents: 0 };
  }

  const maxUsable = battery.capacityKwh * (battery.usablePercent / 100);
  const minCharge =
    battery.capacityKwh * ((battery.minChargePercent ?? 5) / 100);
  const dischargePerSlot = battery.capacityKwh / 6;
  const dischargeWindows = battery.dischargeWindows ?? [];

  const chargeHours = battery.autoDetectCheapest
    ? findCheapestPeriod(tariff, dayOfWeek)
    : {
        startHour: battery.chargeStartHour,
        startMinute: battery.chargeStartMinute,
        endHour: battery.chargeEndHour,
        endMinute: battery.chargeEndMinute,
      };

  const chargeSlots = countSlotsInRange(
    chargeHours.startHour,
    chargeHours.startMinute,
    chargeHours.endHour,
    chargeHours.endMinute,
  );

  const chargeRateInfo = getRateInfoForTime(
    tariff,
    dayOfWeek,
    chargeHours.startHour,
    chargeHours.startMinute,
  );

  // Compute how much energy forced discharge windows need (to reserve SoC for them)
  let forcedDischargeReserve = 0;
  for (let i = 0; i < n; i++) {
    const { h, m } = times[i];
    for (const dw of dischargeWindows) {
      if (
        isInTimeRange(
          h,
          m,
          dw.startHour,
          dw.startMinute,
          dw.endHour,
          dw.endMinute,
        )
      ) {
        forcedDischargeReserve += dischargePerSlot;
        break;
      }
    }
  }
  forcedDischargeReserve = Math.min(
    forcedDischargeReserve,
    maxUsable - minCharge,
  );

  // First pass: figure out how much we can usefully discharge
  let simSoC = 0;
  let totalDischargeable = 0;
  let remainingForcedReserve = forcedDischargeReserve;

  for (let i = 0; i < n; i++) {
    const { h, m } = times[i];

    const inChargeWindow = isInTimeRange(
      h,
      m,
      chargeHours.startHour,
      chargeHours.startMinute,
      chargeHours.endHour,
      chargeHours.endMinute,
    );

    let forcedDischargeRate = -1;
    for (const dw of dischargeWindows) {
      if (
        isInTimeRange(
          h,
          m,
          dw.startHour,
          dw.startMinute,
          dw.endHour,
          dw.endMinute,
        )
      ) {
        forcedDischargeRate = dw.exportRatePerKwh;
        break;
      }
    }

    if (inChargeWindow) {
      const chargePerSlot = chargeSlots > 0 ? maxUsable / chargeSlots : 0;
      simSoC = Math.min(maxUsable, simSoC + chargePerSlot);
    } else if (forcedDischargeRate >= 0 && simSoC > minCharge) {
      const maxDrain = Math.min(dischargePerSlot, simSoC - minCharge);
      totalDischargeable += maxDrain;
      simSoC -= maxDrain;
      remainingForcedReserve = Math.max(0, remainingForcedReserve - maxDrain);
    } else {
      const rateInfo = getRateInfoForTime(tariff, dayOfWeek, h, m);
      const floorSoC = minCharge + remainingForcedReserve;
      if (
        rateInfo.ratePerKwh > chargeRateInfo.ratePerKwh &&
        simSoC > floorSoC
      ) {
        const maxDrain = Math.min(
          dischargePerSlot,
          simSoC - floorSoC,
          baseLoad[i],
        );
        totalDischargeable += maxDrain;
        simSoC -= maxDrain;
      }
    }
  }

  const effectiveUsable = Math.min(maxUsable, totalDischargeable);
  const chargePerSlot = chargeSlots > 0 ? effectiveUsable / chargeSlots : 0;

  // Second pass: compute per-slot deltas
  let soc = 0;
  let exportRevenueCents = 0;
  let remainingForcedReserve2 = forcedDischargeReserve;

  for (let i = 0; i < n; i++) {
    const { h, m } = times[i];

    const inChargeWindow = isInTimeRange(
      h,
      m,
      chargeHours.startHour,
      chargeHours.startMinute,
      chargeHours.endHour,
      chargeHours.endMinute,
    );

    let forcedDischargeRate = -1;
    for (const dw of dischargeWindows) {
      if (
        isInTimeRange(
          h,
          m,
          dw.startHour,
          dw.startMinute,
          dw.endHour,
          dw.endMinute,
        )
      ) {
        forcedDischargeRate = dw.exportRatePerKwh;
        break;
      }
    }

    if (inChargeWindow) {
      const actualCharge = Math.min(chargePerSlot, effectiveUsable - soc);
      soc += actualCharge;
      deltas[i] = actualCharge;
    } else if (forcedDischargeRate >= 0 && soc > minCharge) {
      const maxDrain = Math.min(dischargePerSlot, soc - minCharge);
      const householdOffset = Math.min(maxDrain, baseLoad[i]);
      const exported = maxDrain - householdOffset;
      deltas[i] = -maxDrain;
      exportRevenueCents += exported * forcedDischargeRate;
      soc -= maxDrain;
      remainingForcedReserve2 = Math.max(0, remainingForcedReserve2 - maxDrain);
    } else {
      const floorSoC = minCharge + remainingForcedReserve2;
      const rateInfo = getRateInfoForTime(tariff, dayOfWeek, h, m);
      if (rateInfo.ratePerKwh > chargeRateInfo.ratePerKwh && soc > floorSoC) {
        const maxDrain = Math.min(
          dischargePerSlot,
          soc - floorSoC,
          baseLoad[i],
        );
        deltas[i] = -maxDrain;
        soc -= maxDrain;
      }
    }
  }

  return { deltas, exportRevenueCents };
}

interface SimulateDayResult {
  simDayData: DayData;
  exportRevenueCents: number;
}

function simulateDay(
  day: DayData,
  dayOfWeek: number,
  currentBattery: BatterySettings,
  currentEV: EVSettings,
  simBattery: BatterySettings,
  simEV: EVSettings,
  currentTariff: Tariff,
  simTariff: Tariff,
): SimulateDayResult {
  // Clone readings for manipulation
  const readings = day.readings.map((r) => ({ ...r }));

  // Step 1: Strip current EV effects (detection-based, since EV doesn't charge daily).
  // Also strip current battery effects to get an estimated base load.
  const { evEnergyKwh, evPerSlotStripped } = stripCurrentEffects(
    readings,
    currentBattery,
    currentEV,
    currentTariff,
    dayOfWeek,
  );

  // This is the estimated base load (household only, no battery/EV)
  const baseLoad = readings.map((r) => r.kwh);

  // Pre-compute time slots once
  const times = day.readings.map((r) => {
    const [h, m] = r.time.split(":").map(Number);
    return { h, m };
  });

  // Step 2: Compute battery deltas for both current and sim batteries on the
  // same estimated base load. Any error in the base estimate affects both
  // equally, so it cancels out when we compute the net delta.
  const currentBatteryResult = computeBatteryDeltas(
    times,
    baseLoad,
    currentBattery,
    currentTariff,
    dayOfWeek,
  );
  const simBatteryResult = computeBatteryDeltas(
    times,
    baseLoad,
    simBattery,
    simTariff,
    dayOfWeek,
  );

  // Step 3: Compute EV deltas for current and sim
  const currentHasEV = currentEV.hasEV && currentEV.chargingSpeedKw > 0;
  const currentEVDeltas = new Array(48).fill(0);
  const simEVDeltas = new Array(48).fill(0);

  if (currentHasEV) {
    // Current EV: put back exactly what was stripped per slot
    for (let i = 0; i < evPerSlotStripped.length; i++) {
      currentEVDeltas[i] = evPerSlotStripped[i];
    }
  }

  // Sim EV: redistribute the detected energy across the sim window,
  // or use full charging if adding a new EV
  if (currentHasEV) {
    // Same EV window → put back same per-slot amounts
    const sameWindow =
      simEV.chargingStartHour === currentEV.chargingStartHour &&
      simEV.chargingStartMinute === currentEV.chargingStartMinute &&
      simEV.chargingEndHour === currentEV.chargingEndHour &&
      simEV.chargingEndMinute === currentEV.chargingEndMinute;

    if (sameWindow && simEV.hasEV && simEV.chargingSpeedKw > 0) {
      for (let i = 0; i < evPerSlotStripped.length; i++) {
        simEVDeltas[i] = evPerSlotStripped[i];
      }
    } else if (simEV.hasEV && simEV.chargingSpeedKw > 0 && evEnergyKwh > 0) {
      // Different window: redistribute evenly
      const maxPerSlot = simEV.chargingSpeedKw * 0.5;
      const simSlots = countSlotsInRange(
        simEV.chargingStartHour,
        simEV.chargingStartMinute,
        simEV.chargingEndHour,
        simEV.chargingEndMinute,
      );
      if (simSlots > 0) {
        const perSlot = Math.min(maxPerSlot, evEnergyKwh / simSlots);
        let remaining = evEnergyKwh;
        for (let i = 0; i < times.length && remaining > 0; i++) {
          const { h, m } = times[i];
          if (
            isInTimeRange(
              h,
              m,
              simEV.chargingStartHour,
              simEV.chargingStartMinute,
              simEV.chargingEndHour,
              simEV.chargingEndMinute,
            )
          ) {
            const add = Math.min(perSlot, remaining);
            simEVDeltas[i] = add;
            remaining -= add;
          }
        }
      }
    }
  } else if (simEV.hasEV && simEV.chargingSpeedKw > 0) {
    // Adding a new EV: charge at full speed across sim window
    const maxPerSlot = simEV.chargingSpeedKw * 0.5;
    for (let i = 0; i < times.length; i++) {
      const { h, m } = times[i];
      if (
        isInTimeRange(
          h,
          m,
          simEV.chargingStartHour,
          simEV.chargingStartMinute,
          simEV.chargingEndHour,
          simEV.chargingEndMinute,
        )
      ) {
        simEVDeltas[i] = maxPerSlot;
      }
    }
  }

  // Step 4: Apply the net delta (sim - current) to the original readings.
  // For identity (same settings), net delta = 0 → original readings preserved exactly.
  const simReadings = day.readings.map((r, i) => {
    const netBatteryDelta =
      simBatteryResult.deltas[i] - currentBatteryResult.deltas[i];
    const netEVDelta = simEVDeltas[i] - currentEVDeltas[i];
    const kwh =
      Math.round((r.kwh + netBatteryDelta + netEVDelta) * 10000) / 10000;
    return { time: r.time, kwh };
  });
  const simTotalKwh = simReadings.reduce((s, r) => s + r.kwh, 0);

  // Export revenue is the difference in export between sim and current battery
  const exportRevenueCents =
    simBatteryResult.exportRevenueCents -
    currentBatteryResult.exportRevenueCents;

  return {
    simDayData: {
      date: day.date,
      readings: simReadings,
      totalKwh: Math.round(simTotalKwh * 10000) / 10000,
    },
    exportRevenueCents,
  };
}

/**
 * Run the full simulation across all days.
 */
export function runSimulation(
  data: EnergyData,
  currentSettings: UserSettings,
  simConfig: SimulationConfig,
): SimulationResult {
  // Build simulated days by applying net deltas to original readings.
  // The delta approach means errors in base-load estimation cancel out.
  let totalExportRevenueCents = 0;
  const simulatedDays: DayData[] = data.days.map((day) => {
    const dayOfWeek = getDay(parseISO(day.date));
    const result = simulateDay(
      day,
      dayOfWeek,
      currentSettings.battery,
      currentSettings.ev,
      simConfig.battery,
      simConfig.ev,
      currentSettings.currentTariff,
      simConfig.tariff,
    );
    totalExportRevenueCents += result.exportRevenueCents;
    return result.simDayData;
  });

  // Compute current cost from original data
  const currentCostResult = calculateTariffCost(
    data,
    currentSettings.currentTariff,
  );

  // For sim tariff cost, clamp negative readings to 0 (you don't pay for exported energy)
  const clampedSimDays: DayData[] = simulatedDays.map((day) => {
    const clampedReadings = day.readings.map((r) => ({
      time: r.time,
      kwh: Math.max(0, r.kwh),
    }));
    const totalKwh = clampedReadings.reduce((s, r) => s + r.kwh, 0);
    return { date: day.date, readings: clampedReadings, totalKwh };
  });

  const simulatedData: EnergyData = { mprn: data.mprn, days: clampedSimDays };
  const simCostResult = calculateTariffCost(simulatedData, simConfig.tariff);

  // Build daily cost comparison
  const dailyCosts = data.days.map((day, i) => ({
    date: day.date,
    currentCost: currentCostResult.dailyCosts[i]?.cost ?? 0,
    simulatedCost: simCostResult.dailyCosts[i]?.cost ?? 0,
  }));

  // Subtract export revenue from simulated cost for savings calculation
  const effectiveSimCost = simCostResult.totalCost - totalExportRevenueCents;
  const savingsCents = currentCostResult.totalCost - effectiveSimCost;
  const savingsPercent =
    currentCostResult.totalCost > 0
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
    exportRevenueCents: totalExportRevenueCents,
  };
}
