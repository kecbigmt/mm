import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";

const PATH_EXPRESSION_KIND = "PathExpression" as const;
const RANGE_EXPRESSION_KIND = "RangeExpression" as const;

/**
 * PathToken represents a single segment in a CLI path expression
 * These are user-facing tokens that may contain syntactic sugar
 */
export type PathToken =
  | Readonly<{ readonly kind: "dot" }> // "."
  | Readonly<{ readonly kind: "dotdot" }> // ".."
  | Readonly<{ readonly kind: "relativeDate"; readonly expr: string }> // "today", "td", "+2w", "~mon"
  | Readonly<{ readonly kind: "idOrAlias"; readonly value: string }> // UUID or alias
  | Readonly<{ readonly kind: "numeric"; readonly value: number }>; // section number

/**
 * PathExpression represents a CLI path input with potential syntactic sugar
 * This is the raw user input before resolution to a canonical Placement
 *
 * Examples:
 * - "/2025-11-15" → { isAbsolute: true, segments: [{ kind: "relativeDate", expr: "2025-11-15" }] }
 * - "today" → { isAbsolute: false, segments: [{ kind: "relativeDate", expr: "today" }] }
 * - "../book/1" → { isAbsolute: false, segments: [{ kind: "dotdot" }, { kind: "idOrAlias", value: "book" }, { kind: "numeric", value: 1 }] }
 * - "." → { isAbsolute: false, segments: [{ kind: "dot" }] }
 */
export type PathExpression = Readonly<{
  readonly kind: typeof PATH_EXPRESSION_KIND;
  readonly isAbsolute: boolean;
  readonly segments: ReadonlyArray<PathToken>;
}>;

/**
 * RangeExpression represents a CLI range input
 * Can be a single path or a range between two paths
 *
 * Examples:
 * - "2025-11-15" → { kind: "single", path: ... }
 * - "2025-11-15..2025-11-30" → { kind: "range", from: ..., to: ... }
 * - "book/1..5" → { kind: "range", from: "book/1", to: "book/5" }
 */
export type RangeExpression =
  | Readonly<{
    readonly kind: "single";
    readonly path: PathExpression;
  }>
  | Readonly<{
    readonly kind: "range";
    readonly from: PathExpression;
    readonly to: PathExpression;
  }>;

export type PathExpressionValidationError = ValidationError<typeof PATH_EXPRESSION_KIND>;
export type RangeExpressionValidationError = ValidationError<typeof RANGE_EXPRESSION_KIND>;

const RELATIVE_DATE_KEYWORDS = new Set([
  "today",
  "td",
  "tomorrow",
  "tm",
  "yesterday",
  "yd",
]);

const RELATIVE_PERIOD_REGEX = /^([~+])(\d+)([dwmy])$/u;
const RELATIVE_WEEKDAY_REGEX = /^([~+])(mon|tue|wed|thu|fri|sat|sun)$/u;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const NUMERIC_REGEX = /^[1-9]\d*$/u;

const isRelativeDateToken = (token: string): boolean => {
  const normalized = token.toLowerCase();
  return RELATIVE_DATE_KEYWORDS.has(normalized) ||
    RELATIVE_PERIOD_REGEX.test(normalized) ||
    RELATIVE_WEEKDAY_REGEX.test(normalized) ||
    DATE_REGEX.test(normalized);
};

const parsePathToken = (token: string): PathToken => {
  if (token === ".") {
    return { kind: "dot" };
  }
  if (token === "..") {
    return { kind: "dotdot" };
  }
  if (NUMERIC_REGEX.test(token)) {
    return { kind: "numeric", value: Number(token) };
  }
  if (isRelativeDateToken(token)) {
    return { kind: "relativeDate", expr: token };
  }
  // Default to idOrAlias (UUID or alias slug)
  return { kind: "idOrAlias", value: token };
};

const buildPathExpressionError = (
  issues: ReadonlyArray<ValidationIssue>,
): Result<PathExpression, PathExpressionValidationError> =>
  Result.error(createValidationError(PATH_EXPRESSION_KIND, issues));

const buildRangeExpressionError = (
  issues: ReadonlyArray<ValidationIssue>,
): Result<RangeExpression, RangeExpressionValidationError> =>
  Result.error(createValidationError(RANGE_EXPRESSION_KIND, issues));

/**
 * Parse a CLI path string to a PathExpression
 *
 * Handles:
 * - Absolute paths (starting with /)
 * - Relative paths
 * - Special tokens: ., ..
 * - Relative dates: today, +2w, ~mon
 * - IDs/aliases
 * - Numeric sections
 */
export const parsePathExpression = (
  input: unknown,
): Result<PathExpression, PathExpressionValidationError> => {
  if (typeof input !== "string") {
    return buildPathExpressionError([
      createValidationIssue("path expression must be a string", {
        path: ["value"],
        code: "type",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildPathExpressionError([
      createValidationIssue("path expression cannot be empty", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  const isAbsolute = trimmed.startsWith("/");
  const pathPart = isAbsolute ? trimmed.slice(1) : trimmed;
  const rawSegments = pathPart.split("/").filter((s) => s.length > 0);

  const segments: PathToken[] = rawSegments.map(parsePathToken);

  return Result.ok(
    Object.freeze({
      kind: PATH_EXPRESSION_KIND,
      isAbsolute,
      segments: Object.freeze(segments),
    }),
  );
};

/**
 * Parse a CLI range string to a RangeExpression
 *
 * Handles:
 * - Single paths: "2025-11-15"
 * - Range syntax: "2025-11-15..2025-11-30"
 * - Numeric ranges: "book/1..5"
 */
export const parseRangeExpression = (
  input: unknown,
): Result<RangeExpression, RangeExpressionValidationError> => {
  if (typeof input !== "string") {
    return buildRangeExpressionError([
      createValidationIssue("range expression must be a string", {
        path: ["value"],
        code: "type",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildRangeExpressionError([
      createValidationIssue("range expression cannot be empty", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  // Check for range syntax (..)
  const rangeIndex = trimmed.indexOf("..");
  if (rangeIndex === -1) {
    // Single path
    const pathResult = parsePathExpression(trimmed);
    if (pathResult.type === "error") {
      return buildRangeExpressionError(
        pathResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["path", ...issue.path],
          })
        ),
      );
    }

    return Result.ok(
      Object.freeze({
        kind: "single" as const,
        path: pathResult.value,
      }),
    );
  }

  // Range: split on ".." and parse both sides
  const fromStr = trimmed.slice(0, rangeIndex);
  const toStr = trimmed.slice(rangeIndex + 2);

  if (fromStr.length === 0) {
    return buildRangeExpressionError([
      createValidationIssue("range start cannot be empty", {
        path: ["from"],
        code: "empty",
      }),
    ]);
  }

  if (toStr.length === 0) {
    return buildRangeExpressionError([
      createValidationIssue("range end cannot be empty", {
        path: ["to"],
        code: "empty",
      }),
    ]);
  }

  const fromResult = parsePathExpression(fromStr);
  if (fromResult.type === "error") {
    return buildRangeExpressionError(
      fromResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["from", ...issue.path],
        })
      ),
    );
  }

  const toResult = parsePathExpression(toStr);
  if (toResult.type === "error") {
    return buildRangeExpressionError(
      toResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["to", ...issue.path],
        })
      ),
    );
  }

  return Result.ok(
    Object.freeze({
      kind: "range" as const,
      from: fromResult.value,
      to: toResult.value,
    }),
  );
};

export const isPathExpression = (value: unknown): value is PathExpression =>
  typeof value === "object" &&
  value !== null &&
  (value as PathExpression).kind === PATH_EXPRESSION_KIND;

export const isRangeExpression = (value: unknown): value is RangeExpression =>
  typeof value === "object" &&
  value !== null &&
  ((value as RangeExpression).kind === "single" ||
    (value as RangeExpression).kind === "range");
