import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { CanonicalKey, createCanonicalKey } from "./canonical_key.ts";

const TAG_SLUG_KIND = "TagSlug" as const;
const tagSlugBrand: unique symbol = Symbol(TAG_SLUG_KIND);

export type TagSlug = Readonly<{
  readonly raw: string;
  readonly canonicalKey: CanonicalKey;
  toString(): string;
  toJSON(): string;
  equals(other: TagSlug): boolean;
  readonly __brand: typeof tagSlugBrand;
}>;

export type TagSlugValidationError = ValidationError<typeof TAG_SLUG_KIND>;

const instantiate = (raw: string, canonicalKey: CanonicalKey): TagSlug => {
  const value = Object.freeze({
    raw,
    canonicalKey,
    toString: () => raw,
    toJSON: () => raw,
    equals: (other: TagSlug) => canonicalKey.toString() === other.canonicalKey.toString(),
    __brand: tagSlugBrand,
  });
  return value;
};

export const isTagSlug = (value: unknown): value is TagSlug => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<TagSlug>;
  return candidate.__brand === tagSlugBrand && typeof candidate.toString === "function";
};

const MIN_CODEPOINTS = 1;
const MAX_CODEPOINTS = 64;
const ALLOWED_CHARACTERS = /^[\p{L}\p{M}\p{N}_\-.]+$/u;
const WHITESPACE_REGEX = /\s/u;
const CONTROL_REGEX = /[\p{Cc}\p{Cf}]/u;
const ABSOLUTE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const NUMERIC_SECTION_REGEX = /^\d+(?:-\d+)+$/u;
const RELATIVE_STEP_REGEX = /^[~+]\d+$/u;
const RELATIVE_WEEKDAY_REGEX = /^[~+](mon|tue|wed|thu|fri|sat|sun)$/u;
const RELATIVE_PERIOD_REGEX = /^[~+]\d+[dwmy]$/u;

const buildError = (
  issues: ValidationIssue[],
): Result<TagSlug, TagSlugValidationError> =>
  Result.error(createValidationError(TAG_SLUG_KIND, issues));

export const parseTagSlug = (
  input: unknown,
): Result<TagSlug, TagSlugValidationError> => {
  if (isTagSlug(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("tag must be a string", {
        path: ["raw"],
        code: "not_string",
      }),
    ]);
  }

  const trimmed = input.trim();
  const issues: ValidationIssue[] = [];

  if (trimmed.length === 0) {
    issues.push(createValidationIssue("tag cannot be empty", {
      path: ["raw"],
      code: "empty",
    }));
  }

  if (trimmed !== input) {
    issues.push(createValidationIssue("tag cannot include leading or trailing whitespace", {
      path: ["raw"],
      code: "whitespace",
    }));
  }

  if (WHITESPACE_REGEX.test(trimmed)) {
    issues.push(createValidationIssue("tag cannot contain whitespace", {
      path: ["raw"],
      code: "whitespace",
    }));
  }

  if (CONTROL_REGEX.test(trimmed)) {
    issues.push(createValidationIssue("tag cannot contain control characters", {
      path: ["raw"],
      code: "control",
    }));
  }

  const codepoints = Array.from(trimmed);
  if (codepoints.length < MIN_CODEPOINTS) {
    issues.push(createValidationIssue("tag must include at least one character", {
      path: ["raw"],
      code: "min_length",
    }));
  }

  if (codepoints.length > MAX_CODEPOINTS) {
    issues.push(createValidationIssue("tag must be at most 64 characters", {
      path: ["raw"],
      code: "max_length",
    }));
  }

  if (!ALLOWED_CHARACTERS.test(trimmed)) {
    issues.push(
      createValidationIssue("tag may contain only letters, numbers, marks, '_', '-', '.'", {
        path: ["raw"],
        code: "format",
      }),
    );
  }

  if (issues.length > 0) {
    return buildError(issues);
  }

  const canonicalKey = createCanonicalKey(trimmed);
  const canonicalValue = canonicalKey.toString();

  if (
    ABSOLUTE_DATE_REGEX.test(canonicalValue) ||
    NUMERIC_SECTION_REGEX.test(canonicalValue) ||
    RELATIVE_STEP_REGEX.test(canonicalValue) ||
    RELATIVE_WEEKDAY_REGEX.test(canonicalValue) ||
    RELATIVE_PERIOD_REGEX.test(canonicalValue)
  ) {
    return buildError([
      createValidationIssue("tag collides with a reserved locator shape", {
        path: ["raw"],
        code: "reserved",
      }),
    ]);
  }

  return Result.ok(instantiate(trimmed, canonicalKey));
};

export const tagSlugFromString = (
  input: string,
): Result<TagSlug, TagSlugValidationError> => parseTagSlug(input);
