import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const TIMEZONE_IDENTIFIER_KIND = "TimezoneIdentifier" as const;
const TIMEZONE_IDENTIFIER_BRAND: unique symbol = Symbol(TIMEZONE_IDENTIFIER_KIND);

export type TimezoneIdentifier = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  toJSON(): string;
  equals(other: TimezoneIdentifier): boolean;
  readonly [TIMEZONE_IDENTIFIER_BRAND]: true;
}>;

const toString = function (this: TimezoneIdentifier): string {
  return this.data.value;
};

const toJSON = function (this: TimezoneIdentifier): string {
  return this.toString();
};

const equals = function (this: TimezoneIdentifier, other: TimezoneIdentifier): boolean {
  return this.data.value === other.data.value;
};

const instantiate = (value: string): TimezoneIdentifier =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    toJSON,
    equals,
    [TIMEZONE_IDENTIFIER_BRAND]: true,
  });

export type TimezoneIdentifierValidationError = ValidationError<typeof TIMEZONE_IDENTIFIER_KIND>;

export const isTimezoneIdentifier = (value: unknown): value is TimezoneIdentifier =>
  typeof value === "object" && value !== null && TIMEZONE_IDENTIFIER_BRAND in value;

const isValidTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const parseTimezoneIdentifier = (
  input: unknown,
): Result<TimezoneIdentifier, TimezoneIdentifierValidationError> => {
  if (isTimezoneIdentifier(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(TIMEZONE_IDENTIFIER_KIND, [
        createValidationIssue("timezone must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const candidate = input.trim();
  if (candidate.length === 0) {
    return Result.error(
      createValidationError(TIMEZONE_IDENTIFIER_KIND, [
        createValidationIssue("timezone is required", {
          path: ["value"],
          code: "required",
        }),
      ]),
    );
  }

  if (!isValidTimezone(candidate)) {
    return Result.error(
      createValidationError(TIMEZONE_IDENTIFIER_KIND, [
        createValidationIssue("timezone must be a valid IANA identifier", {
          path: ["value"],
          code: "timezone",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate));
};

export const timezoneIdentifierFromString = (
  input: string,
): Result<TimezoneIdentifier, TimezoneIdentifierValidationError> => parseTimezoneIdentifier(input);
