// Timezone-aware helpers without external dependencies.
// All timestamps are stored in UTC; competitions declare an IANA timezone used for input & display.

/** Offset (ms) of `timeZone` from UTC at instant `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const naiveUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes handle DST transitions correctly.
  let guess = naiveUtc - tzOffsetMs(new Date(naiveUtc), timeZone);
  guess = naiveUtc - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Format a UTC Date as "YYYY-MM-DDTHH:mm" in `timeZone` (for datetime-local inputs). */
export function utcToZonedLocal(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "";
  const shifted = new Date(date.getTime() + tzOffsetMs(date, timeZone));
  return shifted.toISOString().slice(0, 16);
}

export function formatDateTime(date: Date | null | undefined, timeZone = "UTC", withZone = true): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" } : {}),
  }).format(date);
}

export function formatDate(date: Date | null | undefined, timeZone = "UTC"): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function relativeFromNow(date: Date, now = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [ms, unit] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), "second");
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Africa/Nairobi",
  "Australia/Sydney",
];
