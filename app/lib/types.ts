export interface HalfHourReading {
  time: string; // "00:00", "00:30", etc.
  kwh: number;
}

export interface DayData {
  date: string; // "2026-01-01"
  readings: HalfHourReading[];
  totalKwh: number;
}

export interface EnergyData {
  mprn: string;
  days: DayData[];
}

export interface RateTier {
  unitLimit: number | null; // null = unlimited (applies to remaining units)
  ratePerKwh: number; // cents
  label: string; // e.g. "Standard", "High Usage"
}

export interface TimePeriodRate {
  startHour: number; // 0-23
  startMinute: number; // 0 or 30
  endHour: number;
  endMinute: number;
  ratePerKwh: number; // cents — used as single rate when tiers is empty
  label: string; // e.g. "Peak", "Night", "EV"
  tiers?: RateTier[]; // optional tiered pricing within this period
}

export interface DaySchedule {
  rates: TimePeriodRate[];
}

export interface Tariff {
  id: string;
  name: string;
  provider: string;
  standingCharge: number; // cents per day
  psoLevy: number; // cents per day
  // Flexible day scheduling
  scheduleType: 'uniform' | 'weekday_weekend' | 'custom';
  // For uniform: all days use the same schedule
  uniformSchedule?: DaySchedule;
  // For weekday_weekend: separate weekday and weekend schedules
  weekdaySchedule?: DaySchedule;
  weekendSchedule?: DaySchedule;
  // For custom: per-day schedules (0=Sunday, 6=Saturday)
  customSchedules?: { [dayOfWeek: number]: DaySchedule };
  // Free day feature (some providers offer a free weekend day)
  freeDay?: {
    enabled: boolean;
    dayOfWeek: number; // 0=Sunday, 6=Saturday
  };
}

export interface Appliance {
  id: string;
  name: string;
  icon: string;
  averageKwhPerUse: number;
  typicalUsesPerWeek: number;
  category: 'heating' | 'cooking' | 'laundry' | 'transport' | 'entertainment' | 'other';
}

export type GranularityLevel = 'monthly' | 'weekly' | 'daily' | 'hourly' | 'halfhourly';

export type ComparisonType = 'previous_period' | 'same_period_last_year' | 'custom';
