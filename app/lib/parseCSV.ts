import { EnergyData, DayData, HalfHourReading } from "./types";

const TIME_SLOTS = [
  "00:00",
  "00:30",
  "01:00",
  "01:30",
  "02:00",
  "02:30",
  "03:00",
  "03:30",
  "04:00",
  "04:30",
  "05:00",
  "05:30",
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
  "22:00",
  "22:30",
  "23:00",
  "23:30",
];

export function parseCSV(csvText: string): EnergyData {
  const firstLine = csvText.trim().split("\n")[0].trim();
  if (firstLine.startsWith("MPRN,")) {
    return parseESBCSV(csvText);
  }
  return parseEnergiaCSV(csvText);
}

function parseESBCSV(csvText: string): EnergyData {
  const lines = csvText.trim().split("\n");
  let mprn = "";
  // Group import readings by date: Map<dateStr, Map<timeSlot, kwh>>
  const dayMap = new Map<string, Map<string, number>>();

  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const parts = trimmed.split(",");
    if (parts.length < 5) continue;

    if (!mprn) mprn = parts[0].trim();

    const readType = parts[3].trim();
    if (readType !== "Active Import Interval (kWh)") continue;

    const kwh = parseFloat(parts[2]) || 0;
    // Date format: DD-MM-YYYY HH:MM
    const dateTimeParts = parts[4].trim().split(" ");
    if (dateTimeParts.length < 2) continue;

    const [day, month, year] = dateTimeParts[0].split("-");
    const date = `${year}-${month}-${day}`;
    const time = dateTimeParts[1]; // HH:MM

    if (!dayMap.has(date)) {
      dayMap.set(date, new Map<string, number>());
    }
    dayMap.get(date)!.set(time, kwh);
  }

  const days: DayData[] = [];
  for (const [date, timeMap] of dayMap) {
    const readings: HalfHourReading[] = [];
    let totalKwh = 0;
    for (const time of TIME_SLOTS) {
      const kwh = timeMap.get(time) || 0;
      readings.push({ time, kwh });
      totalKwh += kwh;
    }
    days.push({ date, readings, totalKwh });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return { mprn, days };
}

export function parseEnergiaCSV(csvText: string): EnergyData {
  const lines = csvText.trim().split("\n");
  let mprn = "";
  const days: DayData[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("#MPRN:")) {
      mprn = trimmed.replace("#MPRN:", "").trim();
      continue;
    }

    // Skip header row
    if (trimmed.startsWith("Date,")) {
      continue;
    }

    const parts = trimmed.split(",");
    if (parts.length < 49) {
      continue;
    } // date + 48 half-hour readings

    const date = parts[0];
    const readings: HalfHourReading[] = [];
    let totalKwh = 0;

    for (let i = 0; i < 48; i++) {
      const kwh = parseFloat(parts[i + 1]) || 0;
      readings.push({ time: TIME_SLOTS[i], kwh });
      totalKwh += kwh;
    }

    days.push({ date, readings, totalKwh });
  }

  // Sort by date
  days.sort((a, b) => a.date.localeCompare(b.date));

  return { mprn, days };
}
