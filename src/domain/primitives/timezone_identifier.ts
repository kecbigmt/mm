import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";
import { profileSync } from "../../shared/profiler.ts";

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

// Common IANA timezones to avoid Intl.DateTimeFormat initialization overhead
const KNOWN_TIMEZONES = new Set([
  "UTC",
  "GMT",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Zurich",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Taipei",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Jakarta",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Africa/Cairo",
  "Africa/Johannesburg",
]);

// Cache for validated timezones to avoid repeated Intl.DateTimeFormat instantiation
const validatedTimezones = new Map<string, boolean>();

const isValidTimezone = (value: string): boolean => {
  // Fast path for known timezones
  if (KNOWN_TIMEZONES.has(value)) {
    return true;
  }

  const cached = validatedTimezones.get(value);
  if (cached !== undefined) {
    return cached;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    validatedTimezones.set(value, true);
    return true;
  } catch {
    validatedTimezones.set(value, false);
    return false;
  }
};

export const parseTimezoneIdentifier = (
  input: unknown,
): Result<TimezoneIdentifier, TimezoneIdentifierValidationError> => {
  const isAlready = profileSync("tz:isTimezoneIdentifier", () => isTimezoneIdentifier(input));
  if (isAlready) {
    return Result.ok(input as TimezoneIdentifier);
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

  const valid = profileSync("tz:isValidTimezone", () => isValidTimezone(candidate));
  if (!valid) {
    return Result.error(
      createValidationError(TIMEZONE_IDENTIFIER_KIND, [
        createValidationIssue("timezone must be a valid IANA identifier", {
          path: ["value"],
          code: "timezone",
        }),
      ]),
    );
  }

  return Result.ok(profileSync("tz:instantiate", () => instantiate(candidate)));
};

export const timezoneIdentifierFromString = (
  input: string,
): Result<TimezoneIdentifier, TimezoneIdentifierValidationError> => parseTimezoneIdentifier(input);
