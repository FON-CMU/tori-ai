export function buddhistYearToGregorian(year: number) {
  if (!Number.isInteger(year)) throw new Error("Year must be an integer");
  return year >= 2400 ? year - 543 : year;
}

export function gregorianToBuddhistYear(year: number) {
  if (!Number.isInteger(year)) throw new Error("Year must be an integer");
  return year < 2400 ? year + 543 : year;
}

/** Current Buddhist year (พ.ศ.) in Asia/Bangkok. */
export function currentBuddhistYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(now);
  const gregorian = Number(parts.find((part) => part.type === "year")?.value);
  if (!Number.isInteger(gregorian)) throw new Error("Unable to resolve current year");
  return gregorianToBuddhistYear(gregorian);
}

export function calculateHours(startAt: Date, endAt: Date, breakMinutes = 0) {
  if (endAt < startAt) throw new Error("End time must not precede start time");
  if (breakMinutes < 0) throw new Error("Break duration must not be negative");
  return (endAt.getTime() - startAt.getTime()) / 3_600_000 - breakMinutes / 60;
}

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
};

/** YYYY-MM-DD in Asia/Bangkok */
export function bangkokDateISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function bangkokDateThaiLabel(now = new Date()) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "long",
  }).format(now);
}

/** Normalize "8:30", "08.30", "8.30 น." → "HH:mm" */
export function normalizeTimeHm(raw: string | null | undefined) {
  if (!raw) return null;
  const match = raw.trim().match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function composeBangkokDateTime(dateISO: string, timeHm: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  if (!/^\d{2}:\d{2}$/.test(timeHm)) return null;
  const value = new Date(`${dateISO}T${timeHm}:00+07:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function splitBangkokDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}`;
  return { eventDate: date, timeHm: time };
}

/** Parse Thai/Buddhist date text → YYYY-MM-DD (Gregorian) */
export function parseThaiDateToISO(text: string, now = new Date()) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/วันนี้|วันปัจจุบัน/.test(normalized)) return bangkokDateISO(now);

  const thai = normalized.match(
    /(?:วันที่\s*)?(\d{1,2})\s*([ก-๙]+)\s*(?:พ\.?\s*ศ\.?\s*)?(\d{4})/,
  );
  if (thai) {
    const day = Number(thai[1]);
    const month = THAI_MONTHS[thai[2]];
    const yearRaw = Number(thai[3]);
    if (!month || !day) return null;
    const year = buddhistYearToGregorian(yearRaw);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const iso = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

/** Parse "08.30-16.30" / "08:30 น. ถึง 16:30" → start/end HH:mm */
export function parseTimeRange(text: string) {
  const match = text.match(
    /(\d{1,2})[:.](\d{2})\s*(?:น\.|น)?\s*(?:-|–|—|ถึง|ถึงเวลา)\s*(\d{1,2})[:.](\d{2})/,
  );
  if (!match) return { startTime: null, endTime: null };
  return {
    startTime: normalizeTimeHm(`${match[1]}:${match[2]}`),
    endTime: normalizeTimeHm(`${match[3]}:${match[4]}`),
  };
}
