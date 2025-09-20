import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";

const CALENDAR_YEAR_KIND = "CalendarYear" as const;
const CALENDAR_YEAR_BRAND: unique symbol = Symbol(CALENDAR_YEAR_KIND);

export type CalendarYear = Readonly<{
  readonly data: Readonly<{
    readonly value: number;
    readonly iso: string;
  }>;
  value(): number;
  toString(): string;
  toJSON(): string;
  equals(other: CalendarYear): boolean;
  readonly [CALENDAR_YEAR_BRAND]: true;
}>;

const value = function (this: CalendarYear): number {
  return this.data.value;
};

const toString = function (this: CalendarYear): string {
  return this.data.iso;
};

const toJSON = function (this: CalendarYear): string {
  return this.toString();
};

const equals = function (this: CalendarYear, other: CalendarYear): boolean {
  return this.data.value === other.data.value;
};

const instantiate = (year: number): CalendarYear => {
  const iso = year.toString().padStart(4, "0");
  return Object.freeze({
    data: Object.freeze({ value: year, iso }),
    value,
    toString,
    toJSON,
    equals,
    [CALENDAR_YEAR_BRAND]: true,
  });
};

export type CalendarYearValidationError = ValidationError<typeof CALENDAR_YEAR_KIND>;

export const isCalendarYear = (value: unknown): value is CalendarYear =>
  typeof value === "object" && value !== null && CALENDAR_YEAR_BRAND in value;

const YEAR_REGEX = /^\d{4}$/;
const MIN_YEAR = 1970;
const MAX_YEAR = 9999;

const createError = (
  issues: ReadonlyArray<ValidationIssue>,
): CalendarYearValidationError => createValidationError(CALENDAR_YEAR_KIND, issues);

const validateYear = (
  year: number,
): Result<CalendarYear, CalendarYearValidationError> => {
  if (!Number.isFinite(year)) {
    return Result.error(
      createError([
        createValidationIssue("year must be a finite number", {
          path: ["value"],
          code: "not_finite",
        }),
      ]),
    );
  }

  if (!Number.isInteger(year)) {
    return Result.error(
      createError([
        createValidationIssue("year must be an integer", {
          path: ["value"],
          code: "not_integer",
        }),
      ]),
    );
  }

  if (year < MIN_YEAR) {
    return Result.error(
      createError([
        createValidationIssue("year must be at least 1970", {
          path: ["value"],
          code: "min",
        }),
      ]),
    );
  }

  if (year > MAX_YEAR) {
    return Result.error(
      createError([
        createValidationIssue("year must be at most 9999", {
          path: ["value"],
          code: "max",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(year));
};

export const parseCalendarYear = (
  input: unknown,
): Result<CalendarYear, CalendarYearValidationError> => {
  if (isCalendarYear(input)) {
    return Result.ok(input);
  }

  if (typeof input === "number") {
    return validateYear(input);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!YEAR_REGEX.test(trimmed)) {
      return Result.error(
        createError([
          createValidationIssue("expected format YYYY", {
            path: ["value"],
            code: "format",
          }),
        ]),
      );
    }
    const year = Number.parseInt(trimmed, 10);
    return validateYear(year);
  }

  return Result.error(
    createError([
      createValidationIssue("value must be a string or number", {
        path: ["value"],
        code: "type",
      }),
    ]),
  );
};

export const calendarYearFromNumber = (
  input: number,
): Result<CalendarYear, CalendarYearValidationError> => validateYear(input);

export const calendarYearFromString = (
  input: string,
): Result<CalendarYear, CalendarYearValidationError> => parseCalendarYear(input);
