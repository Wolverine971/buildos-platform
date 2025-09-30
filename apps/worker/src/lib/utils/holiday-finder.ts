// apps/worker/src/lib/utils/holiday-finder.ts
export type Holiday = {
  name: string;
  date: Date;
};

export function getHoliday(date: Date): string[] {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  const holidays: string[] = [];

  const mmdd = `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // --- Fixed Holidays ---
  const fixedHolidays: Record<string, string> = {
    "01-01": "New Year's Day",
    "02-02": "Groundhog Day",
    "02-09": "National Pizza Day",
    "02-14": "Valentine's Day",
    "03-10": "Mario Day",
    "03-17": "St. Patrick's Day",
    "04-01": "April Fools' Day",
    "04-15": "U.S. Tax Day",
    "04-27": "World Design Day",
    "05-04": "Star Wars Day",
    "05-27": "National Creativity Day",
    "06-14": "Flag Day",
    "06-19": "Juneteenth",
    "06-21": "World Selfie Day",
    "06-20": "World Productivity Day",
    "07-04": "Independence Day",
    "07-17": "World Emoji Day",
    "08-19": "World Photography Day",
    "09-11": "Patriot Day",
    "09-17": "Constitution Day",
    "09-29": "National Coffee Day",
    "10-10": "World Mental Health Day",
    "10-31": "Halloween",
    "11-11": "Veterans Day",
    "12-25": "Christmas Day",
    "12-31": "New Year's Eve",
  };
  if (fixedHolidays[mmdd]) holidays.push(fixedHolidays[mmdd]);

  // --- Helpers for Movable Holidays ---
  const getNthWeekdayOfMonth = (
    y: number,
    m: number,
    weekday: number,
    n: number,
  ): Date => {
    const firstDay = new Date(y, m, 1);
    const offset = (7 + weekday - firstDay.getDay()) % 7;
    return new Date(y, m, 1 + offset + 7 * (n - 1));
  };

  const getLastWeekdayOfMonth = (
    y: number,
    m: number,
    weekday: number,
  ): Date => {
    const lastDay = new Date(y, m + 1, 0);
    const offset = (7 + lastDay.getDay() - weekday) % 7;
    return new Date(y, m + 1, 0 - offset);
  };

  const getEasterDate = (y: number): Date => {
    const f = Math.floor;
    const G = y % 19;
    const C = f(y / 100);
    const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
    const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
    const J = (y + f(y / 4) + I + 2 - C + f(C / 4)) % 7;
    const L = I - J;
    const m = 3 + f((L + 40) / 44) - 1;
    const d = L + 28 - 31 * f(m / 4);
    return new Date(y, m, d);
  };

  // --- Movable Holidays ---
  const movableHolidays: Holiday[] = [
    {
      name: "Martin Luther King Jr. Day",
      date: getNthWeekdayOfMonth(year, 0, 1, 3),
    }, // 3rd Monday of Jan
    { name: "Presidents' Day", date: getNthWeekdayOfMonth(year, 1, 1, 3) }, // 3rd Monday of Feb
    { name: "Mother's Day", date: getNthWeekdayOfMonth(year, 4, 0, 2) }, // 2nd Sunday of May
    { name: "Memorial Day", date: getLastWeekdayOfMonth(year, 4, 1) }, // Last Monday of May
    { name: "Father's Day", date: getNthWeekdayOfMonth(year, 5, 0, 3) }, // 3rd Sunday of June
    { name: "Labor Day", date: getNthWeekdayOfMonth(year, 8, 1, 1) }, // 1st Monday of Sep
    { name: "Columbus Day", date: getNthWeekdayOfMonth(year, 9, 1, 2) }, // 2nd Monday of Oct
    { name: "Thanksgiving", date: getNthWeekdayOfMonth(year, 10, 4, 4) }, // 4th Thursday of Nov
    {
      name: "Black Friday",
      date: new Date(getNthWeekdayOfMonth(year, 10, 4, 4).getTime() + 86400000),
    },
    {
      name: "National Entrepreneurs Day",
      date: getNthWeekdayOfMonth(year, 10, 2, 3),
    }, // 3rd Tuesday of Nov
    { name: "National Donut Day", date: getNthWeekdayOfMonth(year, 5, 5, 1) }, // 1st Friday of June
    { name: "Easter", date: getEasterDate(year) },
  ];

  movableHolidays.forEach(({ name, date: holidayDate }) => {
    if (
      holidayDate.getDate() === day &&
      holidayDate.getMonth() === month &&
      holidayDate.getFullYear() === year
    ) {
      holidays.push(name);
    }
  });

  // --- Business / Fiscal Events ---
  const businessEvents: Record<string, string> = {
    "01-01": "Start of Q1 / Fiscal Year",
    "04-01": "Start of Q2",
    "07-01": "Start of Q3",
    "10-01": "Start of Q4",
    "09-15": "Q3 Estimated Tax Due",
    "10-15": "Extended Tax Filing Deadline",
  };
  if (businessEvents[mmdd]) holidays.push(businessEvents[mmdd]);

  // --- Seasonal Markers ---
  const seasonalMarkers: Holiday[] = [
    { name: "First Day of Spring", date: new Date(year, 2, 20) },
    { name: "First Day of Summer", date: new Date(year, 5, 20) },
    { name: "First Day of Fall", date: new Date(year, 8, 22) },
    { name: "First Day of Winter", date: new Date(year, 11, 21) },
  ];
  seasonalMarkers.forEach(({ name, date: seasonalDate }) => {
    if (seasonalDate.getDate() === day && seasonalDate.getMonth() === month) {
      holidays.push(name);
    }
  });

  return holidays;
}
