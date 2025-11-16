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
  // Important: ".." is ambiguous - it could be:
  // 1. The dotdot navigation token (parent directory)
  // 2. The range operator (e.g., "1..5")
  //
  // We treat ".." as a range operator ONLY if:
  // - There are non-empty segments both before AND after it
  // This means "../", "..", "../..", etc. are treated as paths, not ranges
  const rangeIndex = trimmed.indexOf("..");
  if (rangeIndex === -1) {
    // No ".." found - single path
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

  // Check if ".." is preceded and followed by non-slash characters
  // If not, treat it as a path (dotdot token), not a range
  const beforeDots = trimmed.slice(0, rangeIndex);
  const afterDots = trimmed.slice(rangeIndex + 2);

  // Check if ".." is surrounded by slashes (or at start/end), indicating navigation
  const beforeNormalized = beforeDots.replace(/\/+$/, "");
  const afterNormalized = afterDots.replace(/^\/+/, "");

  // If either side is empty after removing slashes, OR if ".." is directly adjacent to a slash,
  // treat as path (navigation), not range
  const hasSlashBefore = beforeDots.endsWith("/") || beforeDots.length === 0;
  const hasSlashAfter = afterDots.startsWith("/") || afterDots.length === 0;

  if (
    beforeNormalized.length === 0 || afterNormalized.length === 0 || hasSlashBefore || hasSlashAfter
  ) {
    // This is a path like "../", "..", "../../", "foo/../bar", not a range
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
  let toStr = trimmed.slice(rangeIndex + 2);

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

  // Handle numeric ranges within a parent path (e.g., "book/1..3" or "/2025-11-15/book/1..5")
  // If toStr is a single numeric segment and fromStr has a parent path,
  // prepend the parent path to toStr to make "book/1..3" → from="book/1", to="book/3"
  const isAbsolute = fromStr.startsWith("/");
  const fromSegments = (isAbsolute ? fromStr.slice(1) : fromStr).split("/").filter((s) =>
    s.length > 0
  );
  const toSegments = toStr.split("/").filter((s) => s.length > 0);

  if (toSegments.length === 1 && NUMERIC_REGEX.test(toSegments[0]) && fromSegments.length > 1) {
    // Extract parent path from fromStr (everything except the last segment)
    const parentSegments = fromSegments.slice(0, -1);
    const parentPath = (isAbsolute ? "/" : "") + parentSegments.join("/");
    toStr = `${parentPath}/${toStr}`;
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
