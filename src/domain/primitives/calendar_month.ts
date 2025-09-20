import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  CalendarYear,
  CalendarYearValidationError,
  isCalendarYear,
  parseCalendarYear,
} from "./calendar_year.ts";

const CALENDAR_MONTH_KIND = "CalendarMonth" as const;
const CALENDAR_MONTH_BRAND: unique symbol = Symbol(CALENDAR_MONTH_KIND);

export type CalendarMonth = Readonly<{
  readonly data: Readonly<{
    readonly year: CalendarYear;
    readonly month: number;
    readonly iso: string;
  }>;
  year(): CalendarYear;
  month(): number;
  toString(): string;
  toJSON(): string;
  equals(other: CalendarMonth): boolean;
  readonly [CALENDAR_MONTH_BRAND]: true;
}>;

const year = function (this: CalendarMonth): CalendarYear {
  return this.data.year;
};

const month = function (this: CalendarMonth): number {
  return this.data.month;
};

const toString = function (this: CalendarMonth): string {
  return this.data.iso;
};

const toJSON = function (this: CalendarMonth): string {
  return this.toString();
};

const equals = function (this: CalendarMonth, other: CalendarMonth): boolean {
  return this.data.iso === other.data.iso;
};

const instantiate = (
  yearValue: CalendarYear,
  monthValue: number,
): CalendarMonth => {
  const iso = `${yearValue.toString()}-${monthValue.toString().padStart(2, "0")}`;
  return Object.freeze({
    data: Object.freeze({ year: yearValue, month: monthValue, iso }),
    year,
    month,
    toString,
    toJSON,
    equals,
    [CALENDAR_MONTH_BRAND]: true,
  });
};

export type CalendarMonthValidationError = ValidationError<typeof CALENDAR_MONTH_KIND>;

export const isCalendarMonth = (value: unknown): value is CalendarMonth =>
  typeof value === "object" && value !== null && CALENDAR_MONTH_BRAND in value;

const CALENDAR_MONTH_REGEX = /^(\d{4})-(\d{2})$/;

const createError = (
  issues: ReadonlyArray<ValidationIssue>,
): CalendarMonthValidationError => createValidationError(CALENDAR_MONTH_KIND, issues);

const mapYearError = (
  error: CalendarYearValidationError,
): CalendarMonthValidationError =>
  createError(
    error.issues.map((issue) =>
      createValidationIssue(issue.message, {
        path: ["year", ...issue.path],
        code: issue.code,
      })
    ),
  );

const validateMonth = (
  monthValue: number,
): Result<number, CalendarMonthValidationError> => {
  if (!Number.isInteger(monthValue)) {
    return Result.error(
      createError([
        createValidationIssue("month must be an integer", {
          path: ["month"],
          code: "not_integer",
        }),
      ]),
    );
  }

  if (monthValue < 1 || monthValue > 12) {
    return Result.error(
      createError([
        createValidationIssue("month must be between 1 and 12", {
          path: ["month"],
          code: "range",
        }),
      ]),
    );
  }

  return Result.ok(monthValue);
};

export const parseCalendarMonth = (
  input: unknown,
): Result<CalendarMonth, CalendarMonthValidationError> => {
  if (isCalendarMonth(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createError([
        createValidationIssue("value must be a string", {
          path: ["value"],
          code: "type",
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  const match = trimmed.match(CALENDAR_MONTH_REGEX);
  if (!match) {
    return Result.error(
      createError([
        createValidationIssue("expected format YYYY-MM", {
          path: ["value"],
          code: "format",
        }),
      ]),
    );
  }

  const [, yearPart, monthPart] = match;
  const yearResult = parseCalendarYear(yearPart);
  if (yearResult.type === "error") {
    return Result.error(mapYearError(yearResult.error));
  }

  const monthNumber = Number.parseInt(monthPart, 10);
  const monthValidation = validateMonth(monthNumber);
  if (monthValidation.type === "error") {
    return monthValidation;
  }

  return Result.ok(instantiate(yearResult.value, monthValidation.value));
};

export const calendarMonthFromComponents = (
  yearInput: number | CalendarYear,
  monthInput: number,
): Result<CalendarMonth, CalendarMonthValidationError> => {
  const yearResult: Result<CalendarYear, CalendarYearValidationError> = isCalendarYear(
      yearInput,
    )
    ? Result.ok<CalendarYear>(yearInput)
    : parseCalendarYear(yearInput);

  if (yearResult.type === "error") {
    return Result.error(mapYearError(yearResult.error));
  }

  const monthValidation = validateMonth(monthInput);
  if (monthValidation.type === "error") {
    return monthValidation;
  }

  return Result.ok(instantiate(yearResult.value, monthValidation.value));
};

export const calendarMonthFromString = (
  input: string,
): Result<CalendarMonth, CalendarMonthValidationError> => parseCalendarMonth(input);
