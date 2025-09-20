import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const CALENDAR_DAY_KIND = "CalendarDay" as const;
const CALENDAR_DAY_BRAND: unique symbol = Symbol(CALENDAR_DAY_KIND);

export type CalendarDay = Readonly<{
  readonly data: Readonly<{
    readonly iso: string;
    readonly year: number;
    readonly month: number;
    readonly day: number;
  }>;
  toString(): string;
  toJSON(): string;
  equals(other: CalendarDay): boolean;
  toDate(): Date;
  readonly [CALENDAR_DAY_BRAND]: true;
}>;

const toString = function (this: CalendarDay): string {
  return this.data.iso;
};

const toJSON = function (this: CalendarDay): string {
  return this.toString();
};

const equals = function (this: CalendarDay, other: CalendarDay): boolean {
  return this.data.iso === other.data.iso;
};

const toDate = function (this: CalendarDay): Date {
  return new Date(Date.UTC(this.data.year, this.data.month - 1, this.data.day));
};

const instantiate = (iso: string, year: number, month: number, day: number): CalendarDay =>
  Object.freeze({
    data: Object.freeze({ iso, year, month, day }),
    toString,
    toJSON,
    equals,
    toDate,
    [CALENDAR_DAY_BRAND]: true,
  });

export type CalendarDayValidationError = ValidationError<typeof CALENDAR_DAY_KIND>;

export const isCalendarDay = (value: unknown): value is CalendarDay =>
  typeof value === "object" && value !== null && CALENDAR_DAY_BRAND in value;

const CALENDAR_DAY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const parseCalendarDay = (
  input: unknown,
): Result<CalendarDay, CalendarDayValidationError> => {
  if (isCalendarDay(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(CALENDAR_DAY_KIND, [
        createValidationIssue("date must be a string", {
          path: ["iso"],
          code: "not_string",
        }),
      ]),
    );
  }

  const candidate = input.trim();
  const match = candidate.match(CALENDAR_DAY_REGEX);
  if (!match) {
    return Result.error(
      createValidationError(CALENDAR_DAY_KIND, [
        createValidationIssue("expected format YYYY-MM-DD", {
          path: ["iso"],
          code: "format",
        }),
      ]),
    );
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return Result.error(
      createValidationError(CALENDAR_DAY_KIND, [
        createValidationIssue("date contains invalid numbers", {
          path: ["iso"],
          code: "nan",
        }),
      ]),
    );
  }

  if (!isValidCalendarDate(year, month, day)) {
    return Result.error(
      createValidationError(CALENDAR_DAY_KIND, [
        createValidationIssue("invalid calendar date", {
          path: ["iso"],
          code: "invalid_date",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate, year, month, day));
};

export const calendarDayFromComponents = (
  year: number,
  month: number,
  day: number,
): Result<CalendarDay, CalendarDayValidationError> =>
  parseCalendarDay(`${year.toString().padStart(4, "0")}-${
    month
      .toString()
      .padStart(2, "0")
  }-${day.toString().padStart(2, "0")}`);
