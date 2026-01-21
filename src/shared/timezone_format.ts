import type { TimezoneIdentifier } from "../domain/primitives/timezone_identifier.ts";

// Cache DateTimeFormat instances per timezone to avoid repeated initialization (~30ms each)
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

// Timezones that are equivalent to UTC (no DST, zero offset)
const UTC_EQUIVALENT_TIMEZONES = new Set([
  "UTC",
  "GMT",
  "Etc/UTC",
  "Etc/GMT",
  "Etc/GMT+0",
  "Etc/GMT-0",
  "Etc/Universal",
  "Universal",
]);

const formatUtcSegments = (date: Date): [string, string, string] => [
  date.getUTCFullYear().toString().padStart(4, "0"),
  (date.getUTCMonth() + 1).toString().padStart(2, "0"),
  date.getUTCDate().toString().padStart(2, "0"),
];

const getDateFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = dateFormatCache.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  dateFormatCache.set(timezone, formatter);
  return formatter;
};

export const formatSegmentsForTimezone = (
  date: Date,
  timezone: TimezoneIdentifier,
): [string, string, string] => {
  const tz = timezone.toString();

  // Fast path for UTC-equivalent timezones (no Intl.DateTimeFormat needed)
  if (UTC_EQUIVALENT_TIMEZONES.has(tz)) {
    return formatUtcSegments(date);
  }

  const formatter = getDateFormatter(tz);
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year");
  const month = lookup.get("month");
  const day = lookup.get("day");
  if (year && month && day) {
    return [year, month, day];
  }
  return formatUtcSegments(date);
};

export const formatDateStringForTimezone = (
  date: Date,
  timezone: TimezoneIdentifier,
): string => {
  const [year, month, day] = formatSegmentsForTimezone(date, timezone);
  return `${year}-${month}-${day}`;
};
