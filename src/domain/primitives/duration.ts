import { Result } from "../../shared/result.ts";
import {
  ValidationError,
  createValidationError,
  createValidationIssue,
} from "../../shared/errors.ts";

const DURATION_KIND = "Duration" as const;
const DURATION_BRAND: unique symbol = Symbol(DURATION_KIND);

export type Duration = Readonly<{
  readonly data: Readonly<{
    readonly minutes: number;
  }>;
  toMinutes(): number;
  toHours(): number;
  toString(): string;
  toJSON(): string;
  readonly [DURATION_BRAND]: true;
}>;

const toMinutes = function (this: Duration): number {
  return this.data.minutes;
};

const toHours = function (this: Duration): number {
  return this.data.minutes / 60;
};

const toString = function (this: Duration): string {
  const hours = Math.floor(this.data.minutes / 60);
  const minutes = this.data.minutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
};

const toJSON = function (this: Duration): string {
  return this.toString();
};

const instantiate = (minutes: number): Duration =>
  Object.freeze({
    data: Object.freeze({ minutes }),
    toMinutes,
    toHours,
    toString,
    toJSON,
    [DURATION_BRAND]: true,
  });

export type DurationValidationError = ValidationError<typeof DURATION_KIND>;

export const isDuration = (value: unknown): value is Duration =>
  typeof value === "object" && value !== null && DURATION_BRAND in value;

const MINUTES_MIN = 1;
const HOURS_TO_MINUTES = 60;

const parseMinutes = (
  minutes: number,
): Result<Duration, DurationValidationError> => {
  if (!Number.isFinite(minutes)) {
    return Result.error(
      createValidationError(DURATION_KIND, [
        createValidationIssue("value must be a finite number", {
          path: ["minutes"],
          code: "not_finite",
        }),
      ]),
    );
  }

  const normalized = Math.round(minutes);
  if (normalized < MINUTES_MIN) {
    return Result.error(
      createValidationError(DURATION_KIND, [
        createValidationIssue("duration must be at least 1 minute", {
          path: ["minutes"],
          code: "min",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(normalized));
};

export const createDurationFromMinutes = (
  minutes: number,
): Result<Duration, DurationValidationError> => parseMinutes(minutes);

export const createDurationFromHours = (
  hours: number,
): Result<Duration, DurationValidationError> =>
  parseMinutes(hours * HOURS_TO_MINUTES);

const DURATION_TOKEN_REGEX = /^(\d+h)?(\d+m)?$/;
const SINGLE_PART_REGEX = /(\d+)(h|m)/g;

export const parseDuration = (
  input: string,
): Result<Duration, DurationValidationError> => {
  if (isDuration(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(DURATION_KIND, [
        createValidationIssue("value must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const candidate = input.trim();
  if (!DURATION_TOKEN_REGEX.test(candidate)) {
    return Result.error(
      createValidationError(DURATION_KIND, [
        createValidationIssue("invalid duration format", {
          path: ["value"],
          code: "format",
        }),
      ]),
    );
  }

  let minutes = 0;
  for (const match of candidate.matchAll(SINGLE_PART_REGEX)) {
    const [, value, unit] = match;
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) {
      return Result.error(
        createValidationError(DURATION_KIND, [
          createValidationIssue("invalid duration number", {
            path: ["value"],
            code: "nan",
          }),
        ]),
      );
    }
    minutes += unit === "h" ? numeric * HOURS_TO_MINUTES : numeric;
  }

  return parseMinutes(minutes);
};
