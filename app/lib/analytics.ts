import {
  DayData,
  EnergyData,
  Tariff,
  DaySchedule,
  TimePeriodRate,
} from "./types";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  getDay,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  eachDayOfInterval,
  isSameWeek,
  isSameMonth,
  subWeeks,
  subMonths,
  subYears,
  isWeekend,
} from "date-fns";

// ─── Aggregation helpers ───

export function getDailyTotals(data: EnergyData) {
  return data.days.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "EEE dd MMM"),
    kwh: Math.round(d.totalKwh * 100) / 100,
  }));
}

export function getWeeklyTotals(data: EnergyData) {
  const weeks = new Map<
    string,
    { start: string; end: string; kwh: number; days: number }
  >();

  for (const day of data.days) {
    const date = parseISO(day.date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
    const key = format(weekStart, "yyyy-MM-dd");

    if (!weeks.has(key)) {
      weeks.set(key, {
        start: format(weekStart, "dd MMM"),
        end: format(weekEnd, "dd MMM"),
        kwh: 0,
        days: 0,
      });
    }
    const w = weeks.get(key)!;
    w.kwh += day.totalKwh;
    w.days += 1;
  }

  return Array.from(weeks.entries()).map(([key, w]) => ({
    weekKey: key,
    label: `${w.start} - ${w.end}`,
    kwh: Math.round(w.kwh * 100) / 100,
    avgDaily: Math.round((w.kwh / w.days) * 100) / 100,
    days: w.days,
  }));
}

export function getMonthlyTotals(data: EnergyData) {
  const months = new Map<string, { kwh: number; days: number }>();

  for (const day of data.days) {
    const key = day.date.substring(0, 7); // "2026-01"
    if (!months.has(key)) {
      months.set(key, { kwh: 0, days: 0 });
    }
    const m = months.get(key)!;
    m.kwh += day.totalKwh;
    m.days += 1;
  }

  return Array.from(months.entries()).map(([key, m]) => ({
    monthKey: key,
    label: format(parseISO(key + "-01"), "MMMM yyyy"),
    kwh: Math.round(m.kwh * 100) / 100,
    avgDaily: Math.round((m.kwh / m.days) * 100) / 100,
    days: m.days,
  }));
}

export function getHourlyAverage(data: EnergyData) {
  const hourTotals = new Array(24).fill(0);
  const hourCounts = new Array(24).fill(0);

  for (const day of data.days) {
    for (const reading of day.readings) {
      const hour = parseInt(reading.time.split(":")[0]);
      hourTotals[hour] += reading.kwh;
      hourCounts[hour] += 1;
    }
  }

  return hourTotals.map((total, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, "0")}:00`,
    avgKwh:
      hourCounts[hour] > 0
        ? Math.round((total / hourCounts[hour]) * 1000) / 1000
        : 0,
    totalKwh: Math.round(total * 100) / 100,
  }));
}

export function getHalfHourlyForDay(day: DayData) {
  return day.readings.map((r) => ({
    time: r.time,
    kwh: r.kwh,
  }));
}

// ─── Comparison helpers ───

export function getWeekComparison(data: EnergyData, weekKey: string) {
  const weekDate = parseISO(weekKey);
  const prevWeekDate = subWeeks(weekDate, 1);

  const currentWeek = data.days.filter((d) =>
    isSameWeek(parseISO(d.date), weekDate, { weekStartsOn: 1 }),
  );
  const prevWeek = data.days.filter((d) =>
    isSameWeek(parseISO(d.date), prevWeekDate, { weekStartsOn: 1 }),
  );

  if (currentWeek.length === 0) return null;

  const currentTotal = currentWeek.reduce((s, d) => s + d.totalKwh, 0);
  const prevTotal = prevWeek.reduce((s, d) => s + d.totalKwh, 0);

  return {
    current: {
      label: `${format(weekDate, "dd MMM")} - ${format(endOfWeek(weekDate, { weekStartsOn: 1 }), "dd MMM")}`,
      total: Math.round(currentTotal * 100) / 100,
      days: currentWeek,
    },
    previous:
      prevWeek.length > 0
        ? {
            label: `${format(prevWeekDate, "dd MMM")} - ${format(endOfWeek(prevWeekDate, { weekStartsOn: 1 }), "dd MMM")}`,
            total: Math.round(prevTotal * 100) / 100,
            days: prevWeek,
          }
        : null,
    changePercent:
      prevTotal > 0
        ? Math.round(((currentTotal - prevTotal) / prevTotal) * 1000) / 10
        : null,
  };
}

export function getMonthComparison(data: EnergyData, monthKey: string) {
  const monthDate = parseISO(monthKey + "-01");
  const prevMonthDate = subMonths(monthDate, 1);
  const prevKey = format(prevMonthDate, "yyyy-MM");

  const currentMonth = data.days.filter((d) => d.date.startsWith(monthKey));
  const prevMonth = data.days.filter((d) => d.date.startsWith(prevKey));

  if (currentMonth.length === 0) return null;

  const currentTotal = currentMonth.reduce((s, d) => s + d.totalKwh, 0);
  const prevTotal = prevMonth.reduce((s, d) => s + d.totalKwh, 0);

  return {
    current: {
      label: format(monthDate, "MMMM yyyy"),
      total: Math.round(currentTotal * 100) / 100,
      avgDaily: Math.round((currentTotal / currentMonth.length) * 100) / 100,
      days: currentMonth.length,
    },
    previous:
      prevMonth.length > 0
        ? {
            label: format(prevMonthDate, "MMMM yyyy"),
            total: Math.round(prevTotal * 100) / 100,
            avgDaily: Math.round((prevTotal / prevMonth.length) * 100) / 100,
            days: prevMonth.length,
          }
        : null,
    changePercent:
      prevTotal > 0
        ? Math.round(((currentTotal - prevTotal) / prevTotal) * 1000) / 10
        : null,
  };
}

// ─── Year-over-year comparison helpers ───

export function getWeekYearAgoComparison(data: EnergyData, weekKey: string) {
  const weekDate = parseISO(weekKey);
  const yearAgoWeekDate = subYears(weekDate, 1);
  // Find the Monday of the same ISO week one year ago
  const yearAgoWeekStart = startOfWeek(yearAgoWeekDate, { weekStartsOn: 1 });

  const currentWeek = data.days.filter((d) =>
    isSameWeek(parseISO(d.date), weekDate, { weekStartsOn: 1 }),
  );
  const yearAgoWeek = data.days.filter((d) =>
    isSameWeek(parseISO(d.date), yearAgoWeekStart, { weekStartsOn: 1 }),
  );

  if (currentWeek.length === 0) return null;

  const currentTotal = currentWeek.reduce((s, d) => s + d.totalKwh, 0);
  const yearAgoTotal = yearAgoWeek.reduce((s, d) => s + d.totalKwh, 0);

  return {
    current: {
      label: `${format(weekDate, "dd MMM yyyy")} - ${format(endOfWeek(weekDate, { weekStartsOn: 1 }), "dd MMM yyyy")}`,
      total: Math.round(currentTotal * 100) / 100,
      days: currentWeek,
    },
    yearAgo:
      yearAgoWeek.length > 0
        ? {
            label: `${format(yearAgoWeekStart, "dd MMM yyyy")} - ${format(endOfWeek(yearAgoWeekStart, { weekStartsOn: 1 }), "dd MMM yyyy")}`,
            total: Math.round(yearAgoTotal * 100) / 100,
            days: yearAgoWeek,
          }
        : null,
    changePercent:
      yearAgoTotal > 0
        ? Math.round(((currentTotal - yearAgoTotal) / yearAgoTotal) * 1000) / 10
        : null,
  };
}

export function getMonthYearAgoComparison(data: EnergyData, monthKey: string) {
  const monthDate = parseISO(monthKey + "-01");
  const yearAgoDate = subYears(monthDate, 1);
  const yearAgoKey = format(yearAgoDate, "yyyy-MM");

  const currentMonth = data.days.filter((d) => d.date.startsWith(monthKey));
  const yearAgoMonth = data.days.filter((d) => d.date.startsWith(yearAgoKey));

  if (currentMonth.length === 0) return null;

  const currentTotal = currentMonth.reduce((s, d) => s + d.totalKwh, 0);
  const yearAgoTotal = yearAgoMonth.reduce((s, d) => s + d.totalKwh, 0);

  return {
    current: {
      label: format(monthDate, "MMMM yyyy"),
      total: Math.round(currentTotal * 100) / 100,
      avgDaily: Math.round((currentTotal / currentMonth.length) * 100) / 100,
      days: currentMonth.length,
    },
    yearAgo:
      yearAgoMonth.length > 0
        ? {
            label: format(yearAgoDate, "MMMM yyyy"),
            total: Math.round(yearAgoTotal * 100) / 100,
            avgDaily:
              Math.round((yearAgoTotal / yearAgoMonth.length) * 100) / 100,
            days: yearAgoMonth.length,
          }
        : null,
    changePercent:
      yearAgoTotal > 0
        ? Math.round(((currentTotal - yearAgoTotal) / yearAgoTotal) * 1000) / 10
        : null,
  };
}

// ─── Time-of-use profile ───

export function getTimeOfUseBreakdown(data: EnergyData) {
  let nightKwh = 0; // 23:00 - 08:00
  let dayKwh = 0; // 08:00 - 17:00
  let peakKwh = 0; // 17:00 - 23:00

  for (const day of data.days) {
    for (const reading of day.readings) {
      const hour = parseInt(reading.time.split(":")[0]);
      if (hour >= 23 || hour < 8) {
        nightKwh += reading.kwh;
      } else if (hour >= 8 && hour < 17) {
        dayKwh += reading.kwh;
      } else {
        peakKwh += reading.kwh;
      }
    }
  }

  const total = nightKwh + dayKwh + peakKwh;
  return [
    {
      name: "Night (23:00-08:00)",
      kwh: Math.round(nightKwh * 100) / 100,
      percent: Math.round((nightKwh / total) * 1000) / 10,
    },
    {
      name: "Day (08:00-17:00)",
      kwh: Math.round(dayKwh * 100) / 100,
      percent: Math.round((dayKwh / total) * 1000) / 10,
    },
    {
      name: "Peak (17:00-23:00)",
      kwh: Math.round(peakKwh * 100) / 100,
      percent: Math.round((peakKwh / total) * 1000) / 10,
    },
  ];
}

// ─── Weekday vs Weekend ───

export function getWeekdayVsWeekend(data: EnergyData) {
  const weekdays: number[] = [];
  const weekends: number[] = [];

  for (const day of data.days) {
    const d = parseISO(day.date);
    if (isWeekend(d)) {
      weekends.push(day.totalKwh);
    } else {
      weekdays.push(day.totalKwh);
    }
  }

  return {
    weekday: {
      avgKwh:
        weekdays.length > 0
          ? Math.round(
              (weekdays.reduce((a, b) => a + b, 0) / weekdays.length) * 100,
            ) / 100
          : 0,
      count: weekdays.length,
    },
    weekend: {
      avgKwh:
        weekends.length > 0
          ? Math.round(
              (weekends.reduce((a, b) => a + b, 0) / weekends.length) * 100,
            ) / 100
          : 0,
      count: weekends.length,
    },
  };
}

// ─── Trend detection ───

export function detectTrends(data: EnergyData) {
  const insights: string[] = [];
  const dailyTotals = getDailyTotals(data);
  const weekdayWeekend = getWeekdayVsWeekend(data);
  const touBreakdown = getTimeOfUseBreakdown(data);
  const hourlyAvg = getHourlyAverage(data);

  // Overall stats
  const totalKwh = data.days.reduce((s, d) => s + d.totalKwh, 0);
  const avgDaily = totalKwh / data.days.length;
  insights.push(
    `Your average daily usage is ${avgDaily.toFixed(1)} kWh across ${data.days.length} days of data.`,
  );

  // Weekend vs weekday
  const diff = weekdayWeekend.weekday.avgKwh - weekdayWeekend.weekend.avgKwh;
  if (Math.abs(diff) > 1) {
    if (diff > 0) {
      insights.push(
        `You use ${diff.toFixed(1)} kWh more on weekdays (${weekdayWeekend.weekday.avgKwh} kWh) than weekends (${weekdayWeekend.weekend.avgKwh} kWh) on average. This may indicate significant appliance use during working hours.`,
      );
    } else {
      insights.push(
        `You use ${Math.abs(diff).toFixed(1)} kWh more on weekends (${weekdayWeekend.weekend.avgKwh} kWh) than weekdays (${weekdayWeekend.weekday.avgKwh} kWh) on average. You may be running more appliances when you're home.`,
      );
    }
  }

  // Night usage pattern
  const nightPct = touBreakdown[0].percent;
  if (nightPct > 40) {
    insights.push(
      `${nightPct}% of your electricity is used at night (23:00-08:00). This is high — you likely have an electric heater, storage heater, or EV charging overnight. A night-rate tariff could save you money.`,
    );
  } else if (nightPct > 25) {
    insights.push(
      `${nightPct}% of your usage is at night. A time-of-use tariff with a cheaper night rate could benefit you.`,
    );
  }

  // Peak hour detection
  const peakHour = hourlyAvg.reduce(
    (max, h) => (h.avgKwh > max.avgKwh ? h : max),
    hourlyAvg[0],
  );
  insights.push(
    `Your peak usage hour is ${peakHour.label} with an average of ${(peakHour.avgKwh * 2).toFixed(2)} kWh per hour.`,
  );

  // Find highest and lowest days
  const sorted = [...dailyTotals].sort((a, b) => b.kwh - a.kwh);
  if (sorted.length > 0) {
    insights.push(
      `Your highest usage day was ${sorted[0].label} at ${sorted[0].kwh} kWh. Your lowest was ${sorted[sorted.length - 1].label} at ${sorted[sorted.length - 1].kwh} kWh.`,
    );
  }

  // Early morning spike detection (possible storage heaters / EV)
  const earlyMorningAvg =
    hourlyAvg.slice(0, 8).reduce((s, h) => s + h.avgKwh, 0) / 8;
  const afternoonAvg =
    hourlyAvg.slice(8, 17).reduce((s, h) => s + h.avgKwh, 0) / 9;
  if (earlyMorningAvg > afternoonAvg * 2) {
    insights.push(
      `Your early morning usage (00:00-08:00) is significantly higher than daytime, suggesting storage heaters, immersion heater timers, or EV charging during off-peak hours.`,
    );
  }

  return insights;
}

// ─── Tariff cost calculation ───

function getScheduleForDay(
  tariff: Tariff,
  dayOfWeek: number,
): DaySchedule | null {
  if (tariff.freeDay?.enabled && tariff.freeDay.dayOfWeek === dayOfWeek) {
    return {
      rates: [
        {
          startHour: 0,
          startMinute: 0,
          endHour: 24,
          endMinute: 0,
          ratePerKwh: 0,
          label: "Free Day",
        },
      ],
    };
  }

  switch (tariff.scheduleType) {
    case "uniform":
      return tariff.uniformSchedule || null;
    case "weekday_weekend":
      return dayOfWeek === 0 || dayOfWeek === 6
        ? tariff.weekendSchedule || null
        : tariff.weekdaySchedule || null;
    case "custom":
      return tariff.customSchedules?.[dayOfWeek] || null;
    default:
      return null;
  }
}

function getRatePeriodForTime(
  schedule: DaySchedule,
  hour: number,
  minute: number,
): TimePeriodRate | null {
  const timeInMinutes = hour * 60 + minute;
  for (const rate of schedule.rates) {
    const start = rate.startHour * 60 + rate.startMinute;
    const end = rate.endHour * 60 + rate.endMinute;
    if (end > start) {
      if (timeInMinutes >= start && timeInMinutes < end) return rate;
    } else {
      // Wraps midnight
      if (timeInMinutes >= start || timeInMinutes < end) return rate;
    }
  }
  return schedule.rates.length > 0
    ? schedule.rates[schedule.rates.length - 1]
    : null;
}

/**
 * Calculate the cost of a given number of kWh using tiered pricing.
 * `cumulativeUsed` is how many units have already been consumed in this tier period
 * across the billing cycle so far. Returns { cost, newCumulative }.
 */
function calcTieredCost(
  kwh: number,
  rate: TimePeriodRate,
  cumulativeUsed: number,
): { cost: number; newCumulative: number } {
  if (!rate.tiers || rate.tiers.length === 0) {
    // Simple flat rate
    return { cost: kwh * rate.ratePerKwh, newCumulative: cumulativeUsed + kwh };
  }

  let remaining = kwh;
  let cost = 0;
  let used = cumulativeUsed;

  for (const tier of rate.tiers) {
    if (remaining <= 0) break;

    if (tier.unitLimit === null) {
      // Unlimited tier — all remaining units at this rate
      cost += remaining * tier.ratePerKwh;
      used += remaining;
      remaining = 0;
    } else {
      // How much capacity is left in this tier?
      const tierCapacityRemaining = Math.max(0, tier.unitLimit - used);
      if (tierCapacityRemaining > 0) {
        const unitsInThisTier = Math.min(remaining, tierCapacityRemaining);
        cost += unitsInThisTier * tier.ratePerKwh;
        used += unitsInThisTier;
        remaining -= unitsInThisTier;
      }
    }
  }

  // If there are units left over (shouldn't happen with a null-limit final tier, but just in case)
  if (remaining > 0) {
    const lastTier = rate.tiers[rate.tiers.length - 1];
    cost += remaining * lastTier.ratePerKwh;
    used += remaining;
  }

  return { cost, newCumulative: used };
}

export function calculateTariffCost(data: EnergyData, tariff: Tariff) {
  let totalCost = 0;
  let totalKwh = 0;
  const dailyCosts: { date: string; cost: number; kwh: number }[] = [];

  // Track cumulative usage per rate period label across the billing period (for tiered pricing)
  const cumulativeByLabel: Record<string, number> = {};

  for (const day of data.days) {
    const date = parseISO(day.date);
    const dayOfWeek = getDay(date);
    const schedule = getScheduleForDay(tariff, dayOfWeek);
    if (!schedule) continue;

    let dayCost = tariff.standingCharge + tariff.psoLevy;

    for (const reading of day.readings) {
      const [h, m] = reading.time.split(":").map(Number);
      const ratePeriod = getRatePeriodForTime(schedule, h, m);
      if (!ratePeriod) continue;

      const label = ratePeriod.label;
      const cumUsed = cumulativeByLabel[label] || 0;
      const { cost, newCumulative } = calcTieredCost(
        reading.kwh,
        ratePeriod,
        cumUsed,
      );
      cumulativeByLabel[label] = newCumulative;

      dayCost += cost;
      totalKwh += reading.kwh;
    }

    totalCost += dayCost;
    dailyCosts.push({
      date: day.date,
      cost: Math.round(dayCost * 100) / 100,
      kwh: day.totalKwh,
    });
  }

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    totalCostEuro: Math.round(totalCost) / 100,
    totalKwh: Math.round(totalKwh * 100) / 100,
    avgDailyCost: Math.round((totalCost / data.days.length) * 100) / 100,
    avgDailyCostEuro: Math.round(totalCost / data.days.length) / 100,
    dailyCosts,
    days: data.days.length,
  };
}

export function compareTariffs(
  data: EnergyData,
  current: Tariff,
  alternative: Tariff,
) {
  const currentCost = calculateTariffCost(data, current);
  const altCost = calculateTariffCost(data, alternative);

  const savingsCents = currentCost.totalCost - altCost.totalCost;
  const savingsEuro = Math.round(savingsCents) / 100;
  const savingsPercent =
    currentCost.totalCost > 0
      ? Math.round((savingsCents / currentCost.totalCost) * 1000) / 10
      : 0;

  // Extrapolate to yearly
  const daysInData = data.days.length;
  const yearlyMultiplier = 365 / daysInData;
  const yearlySavingsEuro =
    Math.round(savingsEuro * yearlyMultiplier * 100) / 100;

  return {
    current: currentCost,
    alternative: altCost,
    savingsCents,
    savingsEuro,
    savingsPercent,
    yearlySavingsEuro,
    recommendation:
      savingsEuro > 0
        ? `Switching to ${alternative.name} could save you approximately €${yearlySavingsEuro.toFixed(2)} per year.`
        : savingsEuro < 0
          ? `${current.name} is cheaper for your usage pattern by approximately €${Math.abs(yearlySavingsEuro).toFixed(2)} per year.`
          : "Both tariffs would cost roughly the same for your usage.",
  };
}

// ─── Tariff rate lookup for UI coloring ───

export interface RateInfo {
  label: string;
  ratePerKwh: number; // lowest tier rate in cents
  color: string;
}

// Assign distinct colors to rate periods based on their index in the schedule
const RATE_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6'];

/**
 * Get rate period info for a given time slot and tariff, using the schedule for the given day of week.
 * For tiered rates, uses the lowest (first tier) rate.
 */
export function getRateInfoForTime(tariff: Tariff, dayOfWeek: number, hour: number, minute: number): RateInfo {
  const schedule = getScheduleForDay(tariff, dayOfWeek);
  if (!schedule) return { label: 'Unknown', ratePerKwh: 0, color: '#9ca3af' };

  const ratePeriod = getRatePeriodForTime(schedule, hour, minute);
  if (!ratePeriod) return { label: 'Unknown', ratePerKwh: 0, color: '#9ca3af' };

  // Use lowest tier rate for display
  let effectiveRate = ratePeriod.ratePerKwh;
  if (ratePeriod.tiers && ratePeriod.tiers.length > 0) {
    effectiveRate = ratePeriod.tiers[0].ratePerKwh;
  }

  // Assign color based on the first occurrence of this label in the schedule,
  // so that split periods with the same label (e.g. "Day" appearing before and after "EV") get the same color
  const firstIndex = schedule.rates.findIndex(r => r.label === ratePeriod.label);
  const color = RATE_COLORS[firstIndex % RATE_COLORS.length];

  return { label: ratePeriod.label, ratePerKwh: effectiveRate, color };
}

/**
 * Get all unique rate periods for a tariff (for legend display).
 * Returns de-duplicated rate labels with their colors.
 */
export function getTariffRatePeriods(tariff: Tariff): { label: string; ratePerKwh: number; color: string }[] {
  // Collect all schedules
  const schedules: DaySchedule[] = [];
  if (tariff.uniformSchedule) schedules.push(tariff.uniformSchedule);
  if (tariff.weekdaySchedule) schedules.push(tariff.weekdaySchedule);
  if (tariff.weekendSchedule) schedules.push(tariff.weekendSchedule);
  if (tariff.customSchedules) {
    for (const s of Object.values(tariff.customSchedules)) {
      schedules.push(s);
    }
  }

  const seen = new Set<string>();
  const result: { label: string; ratePerKwh: number; color: string }[] = [];

  for (const schedule of schedules) {
    for (const rate of schedule.rates) {
      if (seen.has(rate.label)) continue;
      seen.add(rate.label);

      let effectiveRate = rate.ratePerKwh;
      if (rate.tiers && rate.tiers.length > 0) {
        effectiveRate = rate.tiers[0].ratePerKwh;
      }

      // Use the index of the first occurrence of this label, matching getRateInfoForTime
      const firstIndex = schedule.rates.findIndex(r => r.label === rate.label);
      result.push({ label: rate.label, ratePerKwh: effectiveRate, color: RATE_COLORS[firstIndex % RATE_COLORS.length] });
    }
  }

  return result;
}

/**
 * Tariff-aware time-of-use breakdown: groups usage and cost by the tariff's rate periods.
 */
export function getTariffTimeOfUseBreakdown(data: EnergyData, tariff: Tariff) {
  const buckets = new Map<string, { kwh: number; cost: number; color: string; ratePerKwh: number }>();

  for (const day of data.days) {
    const parsed = parseISO(day.date);
    const dayOfWeek = getDay(parsed);
    for (const reading of day.readings) {
      const [h, m] = reading.time.split(':').map(Number);
      const rateInfo = getRateInfoForTime(tariff, dayOfWeek, h, m);
      const bucket = buckets.get(rateInfo.label) || { kwh: 0, cost: 0, color: rateInfo.color, ratePerKwh: rateInfo.ratePerKwh };
      bucket.kwh += reading.kwh;
      bucket.cost += reading.kwh * rateInfo.ratePerKwh; // cents
      buckets.set(rateInfo.label, bucket);
    }
  }

  const total = Array.from(buckets.values()).reduce((s, b) => s + b.kwh, 0);

  return Array.from(buckets.entries()).map(([name, b]) => ({
    name,
    kwh: Math.round(b.kwh * 100) / 100,
    cost: Math.round(b.cost) / 100, // euros
    percent: total > 0 ? Math.round((b.kwh / total) * 1000) / 10 : 0,
    color: b.color,
    ratePerKwh: b.ratePerKwh,
  }));
}

// ─── Default tariffs ───

export const DEFAULT_TARIFFS: Tariff[] = [
  {
    id: "energia-ev",
    name: "Energia EV Smart Drive",
    provider: "Energia",
    standingCharge: 66, // cents per day (€0.66)
    psoLevy: 2.39, // cents per day (€1.46/month ≈ €2.92/61 days)
    scheduleType: "uniform",
    uniformSchedule: {
      rates: [
        {
          startHour: 0,
          startMinute: 0,
          endHour: 2,
          endMinute: 0,
          ratePerKwh: 40.94,
          label: "Day",
        },
        {
          startHour: 2,
          startMinute: 0,
          endHour: 6,
          endMinute: 0,
          ratePerKwh: 9.61,
          label: "EV",
          tiers: [
            { unitLimit: 1000, ratePerKwh: 9.61, label: "EV" },
            { unitLimit: null, ratePerKwh: 11.23, label: "EV High Usage" },
          ],
        },
        {
          startHour: 6,
          startMinute: 0,
          endHour: 23,
          endMinute: 59,
          ratePerKwh: 40.94,
          label: "Day",
        },
      ],
    },
  },
  {
    id: "energia-standard",
    name: "Energia Standard",
    provider: "Energia",
    standingCharge: 27.39, // cents per day
    psoLevy: 0,
    scheduleType: "uniform",
    uniformSchedule: {
      rates: [
        {
          startHour: 0,
          startMinute: 0,
          endHour: 24,
          endMinute: 0,
          ratePerKwh: 24.69,
          label: "Standard",
        },
      ],
    },
  },
  {
    id: "energia-night-saver",
    name: "Energia Night Saver",
    provider: "Energia",
    standingCharge: 29.16, // cents per day
    psoLevy: 0,
    scheduleType: "uniform",
    uniformSchedule: {
      rates: [
        {
          startHour: 8,
          startMinute: 0,
          endHour: 23,
          endMinute: 0,
          ratePerKwh: 28.35,
          label: "Day",
        },
        {
          startHour: 23,
          startMinute: 0,
          endHour: 8,
          endMinute: 0,
          ratePerKwh: 14.1,
          label: "Night",
        },
      ],
    },
  },
  {
    id: "bord-gais-free-saturday",
    name: "Bord Gáis Free Saturday",
    provider: "Bord Gáis Energy",
    standingCharge: 31.58,
    psoLevy: 0,
    scheduleType: "weekday_weekend",
    weekdaySchedule: {
      rates: [
        {
          startHour: 8,
          startMinute: 0,
          endHour: 23,
          endMinute: 0,
          ratePerKwh: 27.54,
          label: "Day",
        },
        {
          startHour: 23,
          startMinute: 0,
          endHour: 8,
          endMinute: 0,
          ratePerKwh: 15.22,
          label: "Night",
        },
      ],
    },
    weekendSchedule: {
      rates: [
        {
          startHour: 8,
          startMinute: 0,
          endHour: 23,
          endMinute: 0,
          ratePerKwh: 27.54,
          label: "Day",
        },
        {
          startHour: 23,
          startMinute: 0,
          endHour: 8,
          endMinute: 0,
          ratePerKwh: 15.22,
          label: "Night",
        },
      ],
    },
    freeDay: { enabled: true, dayOfWeek: 6 }, // Saturday
  },
  {
    id: "electric-ireland-peak-off",
    name: "Electric Ireland Peak/Off-Peak",
    provider: "Electric Ireland",
    standingCharge: 26.87,
    psoLevy: 0,
    scheduleType: "uniform",
    uniformSchedule: {
      rates: [
        {
          startHour: 8,
          startMinute: 0,
          endHour: 17,
          endMinute: 0,
          ratePerKwh: 22.85,
          label: "Day",
        },
        {
          startHour: 17,
          startMinute: 0,
          endHour: 19,
          endMinute: 0,
          ratePerKwh: 32.45,
          label: "Peak",
        },
        {
          startHour: 19,
          startMinute: 0,
          endHour: 23,
          endMinute: 0,
          ratePerKwh: 22.85,
          label: "Evening",
        },
        {
          startHour: 23,
          startMinute: 0,
          endHour: 8,
          endMinute: 0,
          ratePerKwh: 13.5,
          label: "Night",
        },
      ],
    },
  },
  {
    id: "sse-free-sunday",
    name: "SSE Airtricity Free Sundays",
    provider: "SSE Airtricity",
    standingCharge: 30.12,
    psoLevy: 0,
    scheduleType: "weekday_weekend",
    weekdaySchedule: {
      rates: [
        {
          startHour: 8,
          startMinute: 0,
          endHour: 23,
          endMinute: 0,
          ratePerKwh: 26.92,
          label: "Day",
        },
        {
          startHour: 23,
          startMinute: 0,
          endHour: 8,
          endMinute: 0,
          ratePerKwh: 14.88,
          label: "Night",
        },
      ],
    },
    weekendSchedule: {
      rates: [
        {
          startHour: 8,
          startMinute: 0,
          endHour: 23,
          endMinute: 0,
          ratePerKwh: 26.92,
          label: "Day",
        },
        {
          startHour: 23,
          startMinute: 0,
          endHour: 8,
          endMinute: 0,
          ratePerKwh: 14.88,
          label: "Night",
        },
      ],
    },
    freeDay: { enabled: true, dayOfWeek: 0 }, // Sunday
  },
];

// ─── Heatmap data ───

export function getHeatmapData(data: EnergyData) {
  return data.days.map((day) => {
    const row: Record<string, string | number> = {
      date: day.date,
      label: format(parseISO(day.date), "EEE dd MMM"),
    };
    for (const reading of day.readings) {
      row[reading.time] = reading.kwh;
    }
    row["total"] = Math.round(day.totalKwh * 100) / 100;
    return row;
  });
}
