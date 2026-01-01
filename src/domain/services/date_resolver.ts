import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { CalendarDay, parseCalendarDay, TimezoneIdentifier } from "../primitives/mod.ts";

const DATE_RESOLVER_ERROR_KIND = "DateResolver" as const;

export type DateResolverError = ValidationError<typeof DATE_RESOLVER_ERROR_KIND>;

const RELATIVE_DAY_KEYWORDS = new Map<string, number>([
  ["today", 0],
  ["td", 0],
  ["tomorrow", 1],
  ["tm", 1],
  ["yesterday", -1],
  ["yd", -1],
]);

const PERIOD_KEYWORDS = new Set([
  "this-week",
  "tw",
  "next-week",
  "nw",
  "last-week",
  "lw",
  "this-month",
  "next-month",
  "last-month",
]);

const RELATIVE_PERIOD_REGEX = /^([~+])(\d+)([dwmy])$/u;
const RELATIVE_WEEKDAY_REGEX = /^([~+])(mon|tue|wed|thu|fri|sat|sun)$/u;
const LONG_WEEKDAY_REGEX =
  /^(next|last)-(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/u;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const LONG_WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Get today's date components in the specified timezone
 */
const getTodayComponents = (
  date: Date,
  timezone: TimezoneIdentifier,
): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number.parseInt(lookup.get("year") || "1970", 10),
    month: Number.parseInt(lookup.get("month") || "01", 10),
    day: Number.parseInt(lookup.get("day") || "01", 10),
  };
};

/**
 * Get the day of week (0=Sun, 6=Sat) for a date in the specified timezone
 */
const getDayOfWeek = (date: Date, timezone: TimezoneIdentifier): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone.toString(),
    weekday: "short",
  });
  const weekday = formatter.format(date).toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return weekdayMap[weekday] ?? 0;
};

const formatDateString = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * Resolve a relative date expression to a CalendarDay
 *
 * Supports:
 * - Keywords: today, td, tomorrow, tm, yesterday, yd
 * - Range keywords: this-week, tw, next-week, nw, last-week, lw, this-month, next-month, last-month
 * - Period syntax: +2w, ~3d, +1m, ~2y
 * - Weekday syntax: +mon, ~fri
 * - Long weekday syntax: next-monday, last-friday
 * - Literal dates: 2025-12-06
 *
 * @param expr - The date expression string
 * @param timezone - The timezone to use for resolution
 * @param referenceDate - The reference date (usually "today")
 * @returns Result containing CalendarDay or error
 */
export const resolveRelativeDate = (
  expr: string,
  timezone: TimezoneIdentifier,
  referenceDate: Date,
): Result<CalendarDay, DateResolverError> => {
  const normalized = expr.trim().toLowerCase();

  // Check for simple keywords
  const keywordOffset = RELATIVE_DAY_KEYWORDS.get(normalized);
  if (keywordOffset !== undefined) {
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);
    base.setDate(base.getDate() + keywordOffset);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  // Check for range keywords (this-week, next-month, etc.)
  // When used as single date, return the start of the range
  if (normalized === "this-week" || normalized === "tw") {
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);
    const currentDayOfWeek = getDayOfWeek(referenceDate, timezone);
    // ISO week starts on Monday (1), so calculate days to subtract
    const daysToMonday = (currentDayOfWeek + 6) % 7;
    base.setDate(base.getDate() - daysToMonday);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  if (normalized === "next-week" || normalized === "nw") {
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);
    const currentDayOfWeek = getDayOfWeek(referenceDate, timezone);
    const daysToMonday = (currentDayOfWeek + 6) % 7;
    base.setDate(base.getDate() - daysToMonday + 7);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  if (normalized === "last-week" || normalized === "lw") {
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);
    const currentDayOfWeek = getDayOfWeek(referenceDate, timezone);
    const daysToMonday = (currentDayOfWeek + 6) % 7;
    base.setDate(base.getDate() - daysToMonday - 7);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  if (normalized === "this-month") {
    const { year, month } = getTodayComponents(referenceDate, timezone);
    const dateStr = formatDateString(year, month, 1);
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  if (normalized === "next-month") {
    const { year, month } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, 1);
    base.setMonth(base.getMonth() + 1);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, 1);
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  if (normalized === "last-month") {
    const { year, month } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, 1);
    base.setMonth(base.getMonth() - 1);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, 1);
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  // Check for period syntax (+2w, ~3d, etc.)
  const periodMatch = normalized.match(RELATIVE_PERIOD_REGEX);
  if (periodMatch) {
    const [, operator, magnitudeRaw, unit] = periodMatch;
    const magnitude = Number.parseInt(magnitudeRaw, 10);
    const direction = operator === "+" ? 1 : -1;
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);

    let dateStr: string;
    switch (unit) {
      case "d":
        base.setDate(base.getDate() + direction * magnitude);
        dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
        break;
      case "w":
        base.setDate(base.getDate() + direction * magnitude * 7);
        dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
        break;
      case "m":
        base.setMonth(base.getMonth() + direction * magnitude);
        dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
        break;
      case "y":
        base.setFullYear(base.getFullYear() + direction * magnitude);
        dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
        break;
      default:
        return Result.error(
          createValidationError(DATE_RESOLVER_ERROR_KIND, [
            createValidationIssue(`unknown period unit: ${unit}`, {
              code: "unknown_period",
              path: ["relativeDate"],
            }),
          ]),
        );
    }

    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  // Check for weekday syntax (~mon, +fri, etc.)
  const weekdayMatch = normalized.match(RELATIVE_WEEKDAY_REGEX);
  if (weekdayMatch) {
    const [, operator, weekdayRaw] = weekdayMatch;
    const targetIndex = WEEKDAY_INDEX[weekdayRaw];
    const baseIndex = getDayOfWeek(referenceDate, timezone);
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);

    let delta: number;
    if (operator === "+") {
      delta = (targetIndex - baseIndex + 7) % 7;
      if (delta === 0) delta = 7;
    } else {
      delta = (baseIndex - targetIndex + 7) % 7;
      if (delta === 0) delta = 7;
      delta = -delta;
    }

    base.setDate(base.getDate() + delta);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  // Check for long weekday syntax (next-monday, last-friday, etc.)
  const longWeekdayMatch = normalized.match(LONG_WEEKDAY_REGEX);
  if (longWeekdayMatch) {
    const [, direction, weekdayRaw] = longWeekdayMatch;
    const targetIndex = LONG_WEEKDAY_INDEX[weekdayRaw];
    const baseIndex = getDayOfWeek(referenceDate, timezone);
    const { year, month, day } = getTodayComponents(referenceDate, timezone);
    const base = new Date(year, month - 1, day);

    let delta: number;
    if (direction === "next") {
      delta = (targetIndex - baseIndex + 7) % 7;
      if (delta === 0) delta = 7;
    } else {
      delta = (baseIndex - targetIndex + 7) % 7;
      if (delta === 0) delta = 7;
      delta = -delta;
    }

    base.setDate(base.getDate() + delta);
    const dateStr = formatDateString(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const result = parseCalendarDay(dateStr);
    if (result.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
      );
    }
    return result;
  }

  // Try parsing as a literal date
  const result = parseCalendarDay(expr);
  if (result.type === "error") {
    return Result.error(
      createValidationError(DATE_RESOLVER_ERROR_KIND, result.error.issues),
    );
  }
  return result;
};

/**
 * Check if a token string represents a date expression
 *
 * Returns true for:
 * - Keywords: today, td, tomorrow, tm, yesterday, yd
 * - Range keywords: this-week, tw, next-week, nw, last-week, lw, this-month, next-month, last-month
 * - Period syntax: +2w, ~3d, +1m, ~2y
 * - Weekday syntax: +mon, ~fri
 * - Long weekday syntax: next-monday, last-friday
 * - Literal dates: 2025-12-06
 *
 * @param token - The token string to check
 * @returns true if the token represents a date expression
 */
export const isDateExpression = (token: string): boolean => {
  const normalized = token.toLowerCase();
  return RELATIVE_DAY_KEYWORDS.has(normalized) ||
    PERIOD_KEYWORDS.has(normalized) ||
    RELATIVE_PERIOD_REGEX.test(normalized) ||
    RELATIVE_WEEKDAY_REGEX.test(normalized) ||
    LONG_WEEKDAY_REGEX.test(normalized) ||
    DATE_REGEX.test(normalized);
};

/**
 * Check if a token is a period keyword (this-week, this-month, etc.)
 * Period keywords represent date ranges, not single dates.
 */
export const isPeriodKeyword = (token: string): boolean => {
  return PERIOD_KEYWORDS.has(token.toLowerCase());
};

/**
 * Result type for period range resolution
 */
export type PeriodRangeResult = Readonly<{
  from: CalendarDay;
  to: CalendarDay;
}>;

/**
 * Resolve a period keyword to a date range (from/to)
 *
 * Supports:
 * - this-week, tw: Monday to Sunday of current week
 * - next-week, nw: Monday to Sunday of next week
 * - last-week, lw: Monday to Sunday of previous week
 * - this-month: 1st to last day of current month
 * - next-month: 1st to last day of next month
 * - last-month: 1st to last day of previous month
 */
export const resolvePeriodRange = (
  expr: string,
  timezone: TimezoneIdentifier,
  referenceDate: Date,
): Result<PeriodRangeResult, DateResolverError> => {
  const normalized = expr.trim().toLowerCase();

  if (!PERIOD_KEYWORDS.has(normalized)) {
    return Result.error(
      createValidationError(DATE_RESOLVER_ERROR_KIND, [
        createValidationIssue(`'${expr}' is not a period keyword`, {
          code: "not_period_keyword",
          path: ["periodRange"],
        }),
      ]),
    );
  }

  const { year, month, day } = getTodayComponents(referenceDate, timezone);
  const base = new Date(year, month - 1, day);

  // Week range handling
  if (
    normalized === "this-week" || normalized === "tw" ||
    normalized === "next-week" || normalized === "nw" ||
    normalized === "last-week" || normalized === "lw"
  ) {
    const currentDayOfWeek = getDayOfWeek(referenceDate, timezone);
    const daysToMonday = (currentDayOfWeek + 6) % 7;

    let weekOffset = 0;
    if (normalized === "next-week" || normalized === "nw") {
      weekOffset = 7;
    } else if (normalized === "last-week" || normalized === "lw") {
      weekOffset = -7;
    }

    // Monday of target week
    const monday = new Date(base);
    monday.setDate(monday.getDate() - daysToMonday + weekOffset);

    // Sunday of target week (Monday + 6 days)
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const fromStr = formatDateString(monday.getFullYear(), monday.getMonth() + 1, monday.getDate());
    const toStr = formatDateString(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate());

    const fromResult = parseCalendarDay(fromStr);
    const toResult = parseCalendarDay(toStr);

    if (fromResult.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, fromResult.error.issues),
      );
    }
    if (toResult.type === "error") {
      return Result.error(
        createValidationError(DATE_RESOLVER_ERROR_KIND, toResult.error.issues),
      );
    }

    return Result.ok(Object.freeze({ from: fromResult.value, to: toResult.value }));
  }

  // Month range handling
  const targetMonth = new Date(year, month - 1, 1);

  if (normalized === "next-month") {
    targetMonth.setMonth(targetMonth.getMonth() + 1);
  } else if (normalized === "last-month") {
    targetMonth.setMonth(targetMonth.getMonth() - 1);
  }

  // First day of month
  const firstDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);

  // Last day of month (day 0 of next month = last day of current month)
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

  const fromStr = formatDateString(
    firstDay.getFullYear(),
    firstDay.getMonth() + 1,
    firstDay.getDate(),
  );
  const toStr = formatDateString(
    lastDay.getFullYear(),
    lastDay.getMonth() + 1,
    lastDay.getDate(),
  );

  const fromResult = parseCalendarDay(fromStr);
  const toResult = parseCalendarDay(toStr);

  if (fromResult.type === "error") {
    return Result.error(
      createValidationError(DATE_RESOLVER_ERROR_KIND, fromResult.error.issues),
    );
  }
  if (toResult.type === "error") {
    return Result.error(
      createValidationError(DATE_RESOLVER_ERROR_KIND, toResult.error.issues),
    );
  }

  return Result.ok(Object.freeze({ from: fromResult.value, to: toResult.value }));
};
