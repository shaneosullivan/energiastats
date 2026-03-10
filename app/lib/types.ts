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
  scheduleType: "uniform" | "weekday_weekend" | "custom";
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

export interface DischargeWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  exportRatePerKwh: number; // cents per kWh earned for grid export
}

export interface BatterySettings {
  hasBattery: boolean;
  capacityKwh: number;
  usablePercent: number; // 0-100, default 90
  chargeStartHour: number;
  chargeStartMinute: number;
  chargeEndHour: number;
  chargeEndMinute: number;
  autoDetectCheapest: boolean; // if true, override hours with cheapest tariff period
  dischargeWindows: DischargeWindow[]; // forced discharge/export windows
  minChargePercent: number; // minimum SoC percent, default 5
}

export interface EVSettings {
  hasEV: boolean;
  chargingStartHour: number;
  chargingStartMinute: number;
  chargingEndHour: number;
  chargingEndMinute: number;
  chargingSpeedKw: number; // e.g. 7.4
}

export interface UserSettings {
  currentTariff: Tariff;
  battery: BatterySettings;
  ev: EVSettings;
}

export interface SimulationConfig {
  tariff: Tariff;
  battery: BatterySettings;
  ev: EVSettings;
}

export interface SimulationResult {
  currentTotalCostCents: number;
  simulatedTotalCostCents: number;
  savingsCents: number;
  savingsPercent: number;
  yearlySavingsCents: number;
  dailyCosts: { date: string; currentCost: number; simulatedCost: number }[];
  simulatedDays: DayData[];
  numDays: number;
  exportRevenueCents: number; // total revenue from grid export via forced discharge
}
