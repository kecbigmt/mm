import { Result } from "../../../shared/result.ts";
import { createValidationError, createValidationIssue } from "../../../shared/errors.ts";
import type { ValidationError } from "../../../shared/errors.ts";
import { DateTime, dateTimeFromDate, parseDateTime } from "../../../domain/primitives/date_time.ts";
import { parseDuration } from "../../../domain/primitives/duration.ts";
import type { TimezoneIdentifier } from "../../../domain/primitives/timezone_identifier.ts";
import { parseCalendarDay } from "../../../domain/primitives/calendar_day.ts";
import { parseDateArgument } from "./date.ts";

export type FutureDateTimeParseOptions = Readonly<{
  referenceDate: Date;
  timezone: TimezoneIdentifier;
}>;

/**
 * Parse future datetime expression.
 *
 * Supports the following formats:
 * - duration: "1h30m", "8h" - duration from referenceDate
 * - date_time: "2025-12-01T14:00", "2025-12-01T14:00+09:00" - absolute datetime
 * - date: "2025-12-01" - date at 00:00 in workspace timezone
 * - time: "14:00" - next occurrence of this time (today if future, tomorrow if past)
 * - rel_date: "tomorrow" - tomorrow at 00:00 in workspace timezone
 * - rel_date: "today" - today at 00:00 in workspace timezone
 *
 * Always validates that the result is in the future (after referenceDate).
 * If the result is in the past or equal to referenceDate, returns validation error.
 */
export const parseFutureDateTime = (
  input: string,
  options: FutureDateTimeParseOptions,
): Result<DateTime, ValidationError<"FutureDateTime">> => {
  const { referenceDate, timezone } = options;

  // Try parsing as duration first
  const durationResult = parseDuration(input);
  if (durationResult.type === "ok") {
    const nowResult = dateTimeFromDate(referenceDate);
    if (nowResult.type === "error") {
      return Result.error(
        createValidationError("FutureDateTime", [
          createValidationIssue("Invalid reference date"),
        ]),
      );
    }
    const resultDateTime = nowResult.value.addDuration(durationResult.value);
    return validateFutureDateTime(resultDateTime, referenceDate);
  }

  // Try parsing as datetime (handles both with and without timezone)
  // This includes time-only format like "14:00"
  const dateTimeResult = parseDateTime(input, {
    referenceDate,
    timezone,
  });
  if (dateTimeResult.type === "ok") {
    let resultDateTime = dateTimeResult.value;

    // Check if input is time-only format (HH:MM or HH:MM:SS)
    const timeOnlyPattern = /^\d{1,2}:\d{2}(:\d{2})?$/;
    if (timeOnlyPattern.test(input.trim())) {
      // If the parsed time is in the past, add 1 day to get next occurrence
      const nowResult = dateTimeFromDate(referenceDate);
      if (nowResult.type === "error") {
        return Result.error(
          createValidationError("FutureDateTime", [
            createValidationIssue("Invalid reference date"),
          ]),
        );
      }
      const now = nowResult.value;
      if (resultDateTime.isBefore(now) || resultDateTime.equals(now)) {
        // Add 24 hours (1440 minutes) to get tomorrow's time
        const oneDayDuration = parseDuration("24h");
        if (oneDayDuration.type === "ok") {
          resultDateTime = resultDateTime.addDuration(oneDayDuration.value);
        }
      }
    }

    return validateFutureDateTime(resultDateTime, referenceDate);
  }

  // Try parsing as date (YYYY-MM-DD) and set to 00:00 in workspace timezone
  const calendarDayResult = parseCalendarDay(input);
  if (calendarDayResult.type === "ok") {
    const calendarDay = calendarDayResult.value;
    const dateStr = calendarDay.toString();
    // Parse as "YYYY-MM-DD 00:00" in workspace timezone
    const dateTimeAtMidnight = parseDateTime(`${dateStr}T00:00`, {
      referenceDate,
      timezone,
    });
    if (dateTimeAtMidnight.type === "ok") {
      return validateFutureDateTime(dateTimeAtMidnight.value, referenceDate);
    }
  }

  // Try parsing as relative date (today, tomorrow, yesterday)
  const relativeDateResult = parseDateArgument(input, timezone, referenceDate);
  if (relativeDateResult.type === "ok" && relativeDateResult.value.length > 0) {
    const calendarDay = relativeDateResult.value[0];
    const dateStr = calendarDay.toString();
    // Parse as "YYYY-MM-DD 00:00" in workspace timezone
    const dateTimeAtMidnight = parseDateTime(`${dateStr}T00:00`, {
      referenceDate,
      timezone,
    });
    if (dateTimeAtMidnight.type === "ok") {
      return validateFutureDateTime(dateTimeAtMidnight.value, referenceDate);
    }
  }

  // If all parsing attempts failed, return error
  return Result.error(
    createValidationError("FutureDateTime", [
      createValidationIssue(
        "Invalid datetime format. Use: duration (8h, 1h30m), " +
          "datetime (2025-12-01T14:00), date (2025-12-01), " +
          "time (14:00), or relative date (tomorrow, today)",
      ),
    ]),
  );
};

/**
 * Validate that the datetime is in the future.
 */
const validateFutureDateTime = (
  dateTime: DateTime,
  referenceDate: Date,
): Result<DateTime, ValidationError<"FutureDateTime">> => {
  const nowResult = dateTimeFromDate(referenceDate);
  if (nowResult.type === "error") {
    return Result.error(
      createValidationError("FutureDateTime", [
        createValidationIssue("Invalid reference date"),
      ]),
    );
  }
  const now = nowResult.value;
  if (dateTime.isBefore(now) || dateTime.equals(now)) {
    return Result.error(
      createValidationError("FutureDateTime", [
        createValidationIssue("Datetime must be in the future"),
      ]),
    );
  }
  return Result.ok(dateTime);
};
