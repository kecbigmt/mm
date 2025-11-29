import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Duration } from "./duration.ts";
import { TimezoneIdentifier } from "./timezone_identifier.ts";

const DATE_TIME_KIND = "DateTime" as const;
const DATE_TIME_BRAND: unique symbol = Symbol(DATE_TIME_KIND);

export type DateTime = Readonly<{
  readonly data: Readonly<{
    readonly iso: string;
    readonly epochMilliseconds: number;
  }>;
  toString(): string;
  toJSON(): string;
  toDate(): Date;
  equals(other: DateTime): boolean;
  isAfter(other: DateTime): boolean;
  isBefore(other: DateTime): boolean;
  addDuration(duration: Duration): DateTime;
  subtractDuration(duration: Duration): DateTime;
  readonly [DATE_TIME_BRAND]: true;
}>;

const toString = function (this: DateTime): string {
  return this.data.iso;
};

const toJSON = function (this: DateTime): string {
  return this.toString();
};

const toDate = function (this: DateTime): Date {
  return new Date(this.data.epochMilliseconds);
};

const equals = function (this: DateTime, other: DateTime): boolean {
  return this.data.epochMilliseconds === other.data.epochMilliseconds;
};

const isAfter = function (this: DateTime, other: DateTime): boolean {
  return this.data.epochMilliseconds > other.data.epochMilliseconds;
};

const isBefore = function (this: DateTime, other: DateTime): boolean {
  return this.data.epochMilliseconds < other.data.epochMilliseconds;
};

const addDuration = function (this: DateTime, duration: Duration): DateTime {
  const ms = this.data.epochMilliseconds + duration.toMinutes() * 60_000;
  return instantiate(new Date(ms));
};

const subtractDuration = function (
  this: DateTime,
  duration: Duration,
): DateTime {
  const ms = this.data.epochMilliseconds - duration.toMinutes() * 60_000;
  return instantiate(new Date(ms));
};

const instantiate = (value: Date): DateTime => {
  const iso = value.toISOString();
  const epochMilliseconds = value.getTime();
  return Object.freeze({
    data: Object.freeze({ iso, epochMilliseconds }),
    toString,
    toJSON,
    toDate,
    equals,
    isAfter,
    isBefore,
    addDuration,
    subtractDuration,
    [DATE_TIME_BRAND]: true,
  });
};

export type DateTimeValidationError = ValidationError<typeof DATE_TIME_KIND>;

export const isDateTime = (value: unknown): value is DateTime =>
  typeof value === "object" && value !== null && DATE_TIME_BRAND in value;

// ISO 8601 with timezone (Z or +HH:MM or -HH:MM)
const ISO_DATETIME_WITH_TZ_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})$/;

// ISO 8601 without timezone (local time)
const ISO_DATETIME_WITHOUT_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?$/;

// Time only (HH:MM or HH:MM:SS)
const TIME_ONLY_REGEX = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export const parseDateTime = (
  input: unknown,
  options?: {
    referenceDate?: Date;
    timezone?: TimezoneIdentifier;
  },
): Result<DateTime, DateTimeValidationError> => {
  if (isDateTime(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(DATE_TIME_KIND, [
        createValidationIssue("datetime must be a string", {
          path: ["iso"],
          code: "not_string",
        }),
      ]),
    );
  }

  const candidate = input.trim();

  // Try ISO 8601 with timezone first (existing behavior)
  if (ISO_DATETIME_WITH_TZ_REGEX.test(candidate)) {
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return Result.error(
        createValidationError(DATE_TIME_KIND, [
          createValidationIssue("invalid datetime value", {
            path: ["iso"],
            code: "invalid_datetime",
          }),
        ]),
      );
    }
    return Result.ok(instantiate(parsed));
  }

  // Try ISO 8601 without timezone (treat as local time)
  if (ISO_DATETIME_WITHOUT_TZ_REGEX.test(candidate)) {
    // Parse as local time by constructing Date from components
    const match = candidate.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?$/,
    );
    if (!match) {
      return Result.error(
        createValidationError(DATE_TIME_KIND, [
          createValidationIssue("failed to parse datetime components", {
            path: ["iso"],
            code: "parse_error",
          }),
        ]),
      );
    }

    const [, year, month, day, hour, minute, second = "0", ms = "0"] = match;
    const parsed = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      parseInt(ms),
    );

    if (Number.isNaN(parsed.getTime())) {
      return Result.error(
        createValidationError(DATE_TIME_KIND, [
          createValidationIssue("invalid datetime value", {
            path: ["iso"],
            code: "invalid_datetime",
          }),
        ]),
      );
    }
    return Result.ok(instantiate(parsed));
  }

  // Try time-only format (HH:MM or HH:MM:SS)
  const timeMatch = candidate.match(TIME_ONLY_REGEX);
  if (timeMatch) {
    const [, hour, minute, second = "0"] = timeMatch;
    const base = options?.referenceDate || new Date();

    // If timezone is provided, interpret time in that timezone
    if (options?.timezone) {
      // Extract date components from reference date in the workspace timezone
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: options.timezone.toString(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const dateStr = formatter.format(base); // YYYY-MM-DD in workspace timezone

      // Build an ISO string representing the local time in the workspace timezone
      const localTimeStr = `${dateStr}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${
        second.padStart(2, "0")
      }`;

      // Use a two-step approach to find the UTC timestamp:
      // 1. Parse as if it were UTC to get a candidate timestamp
      const candidateUtc = new Date(`${localTimeStr}Z`).getTime();

      // 2. Format the candidate in the workspace timezone to see what local time it produces
      const checkParts = new Intl.DateTimeFormat("en-US", {
        timeZone: options.timezone.toString(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(candidateUtc));

      const checkMap = Object.fromEntries(
        checkParts.map((p) => [p.type, p.value]),
      );

      const producedLocalTime =
        `${checkMap.year}-${checkMap.month}-${checkMap.day}T${checkMap.hour}:${checkMap.minute}:${checkMap.second}`;

      // 3. Calculate the difference and adjust
      const wantedUtc = new Date(`${localTimeStr}Z`).getTime();
      const producedUtc = new Date(`${producedLocalTime}Z`).getTime();
      const correction = wantedUtc - producedUtc;

      const parsed = new Date(candidateUtc + correction);

      if (Number.isNaN(parsed.getTime())) {
        return Result.error(
          createValidationError(DATE_TIME_KIND, [
            createValidationIssue("invalid time value", {
              path: ["iso"],
              code: "invalid_time",
            }),
          ]),
        );
      }
      return Result.ok(instantiate(parsed));
    }

    // No timezone provided: use host timezone (backward compatible)
    const parsed = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      0,
    );

    if (Number.isNaN(parsed.getTime())) {
      return Result.error(
        createValidationError(DATE_TIME_KIND, [
          createValidationIssue("invalid time value", {
            path: ["iso"],
            code: "invalid_time",
          }),
        ]),
      );
    }
    return Result.ok(instantiate(parsed));
  }

  // No format matched
  return Result.error(
    createValidationError(DATE_TIME_KIND, [
      createValidationIssue(
        "expected ISO-8601 string (with or without timezone) or time format (HH:MM)",
        {
          path: ["iso"],
          code: "format",
        },
      ),
    ]),
  );
};

export const dateTimeFromDate = (
  value: Date,
): Result<DateTime, DateTimeValidationError> => {
  if (Number.isNaN(value.getTime())) {
    return Result.error(
      createValidationError(DATE_TIME_KIND, [
        createValidationIssue("invalid Date instance", {
          path: ["date"],
          code: "invalid_date",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(value));
};
