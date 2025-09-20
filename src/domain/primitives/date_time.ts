import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Duration } from "./duration.ts";

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

const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})$/;

export const parseDateTime = (
  input: unknown,
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
  if (!ISO_DATETIME_REGEX.test(candidate)) {
    return Result.error(
      createValidationError(DATE_TIME_KIND, [
        createValidationIssue("expected ISO-8601 string", {
          path: ["iso"],
          code: "format",
        }),
      ]),
    );
  }

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
