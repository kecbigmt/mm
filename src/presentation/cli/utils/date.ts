import { Result } from "../../../shared/result.ts";
import { CalendarDay, calendarDayFromComponents } from "../../../domain/primitives/calendar_day.ts";
import { TimezoneIdentifier } from "../../../domain/primitives/timezone_identifier.ts";
import { resolveRelativeDate } from "../../../domain/services/date_resolver.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type DateError = { readonly type: "invalid-date"; readonly message: string };

type TokenParseResult = Result<CalendarDay, DateError>;

type RangeParseResult = Result<CalendarDay[], DateError>;

const calendarDayFromDate = (
  timezone: TimezoneIdentifier,
  value: Date,
): TokenParseResult => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year");
  const month = lookup.get("month");
  const day = lookup.get("day");
  if (!year || !month || !day) {
    return Result.error({
      type: "invalid-date",
      message: "failed to resolve calendar date for timezone",
    });
  }
  const result = calendarDayFromComponents(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10),
    Number.parseInt(day, 10),
  );
  if (result.type === "error") {
    return Result.error({
      type: "invalid-date",
      message: "resolved calendar date is invalid",
    });
  }
  return Result.ok(result.value);
};

const parseToken = (
  token: string,
  timezone: TimezoneIdentifier,
  reference: Date,
): TokenParseResult => {
  const result = resolveRelativeDate(token, timezone, reference);
  if (result.type === "error") {
    return Result.error({
      type: "invalid-date",
      message: result.error.issues.map((issue) => issue.message).join("; "),
    });
  }
  return Result.ok(result.value);
};

const addDays = (day: CalendarDay, offset: number): TokenParseResult => {
  const base = day.toDate();
  const shifted = new Date(base.getTime() + offset * ONE_DAY_MS);
  const result = calendarDayFromComponents(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
  if (result.type === "error") {
    return Result.error({
      type: "invalid-date",
      message: "failed to compute date range",
    });
  }
  return Result.ok(result.value);
};

export const parseDateArgument = (
  input: string | undefined,
  timezone: TimezoneIdentifier,
  reference: Date,
): RangeParseResult => {
  if (!input) {
    const dayResult = calendarDayFromDate(timezone, reference);
    if (dayResult.type === "error") {
      return dayResult;
    }
    return Result.ok([dayResult.value]);
  }

  if (input.includes("..")) {
    const [startToken, endToken] = input.split("..", 2);
    if (!startToken || !endToken) {
      return Result.error({
        type: "invalid-date",
        message: "date range must be in format start..end",
      });
    }

    const startResult = parseToken(startToken, timezone, reference);
    if (startResult.type === "error") {
      return startResult;
    }
    const endResult = parseToken(endToken, timezone, reference);
    if (endResult.type === "error") {
      return endResult;
    }

    const start = startResult.value;
    const end = endResult.value;
    const startTime = start.toDate().getTime();
    const endTime = end.toDate().getTime();
    if (startTime > endTime) {
      return Result.error({
        type: "invalid-date",
        message: "date range start cannot be after end",
      });
    }

    const days: CalendarDay[] = [];
    let current = start;
    while (current.toDate().getTime() <= endTime) {
      days.push(current);
      const nextResult = addDays(current, 1);
      if (nextResult.type === "error") {
        return nextResult;
      }
      current = nextResult.value;
    }
    return Result.ok(days);
  }

  const singleResult = parseToken(input, timezone, reference);
  if (singleResult.type === "error") {
    return singleResult;
  }
  return Result.ok([singleResult.value]);
};
