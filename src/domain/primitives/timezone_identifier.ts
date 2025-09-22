import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const TIMEZONE_IDENTIFIER_KIND = "TimezoneIdentifier" as const;
const timezoneIdentifierFactory = createStringPrimitiveFactory({
  kind: TIMEZONE_IDENTIFIER_KIND,
});

export type TimezoneIdentifier = StringPrimitive<
  typeof timezoneIdentifierFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): TimezoneIdentifier =>
  timezoneIdentifierFactory.instantiate(value);

export type TimezoneIdentifierValidationError = ValidationError<typeof TIMEZONE_IDENTIFIER_KIND>;

export const isTimezoneIdentifier = (value: unknown): value is TimezoneIdentifier =>
  timezoneIdentifierFactory.is(value);

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
