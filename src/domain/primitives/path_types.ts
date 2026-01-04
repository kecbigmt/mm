import { ValidationError } from "../../shared/errors.ts";

const PATH_EXPRESSION_KIND = "PathExpression" as const;
const RANGE_EXPRESSION_KIND = "RangeExpression" as const;

/**
 * PathToken represents a single segment in a path expression
 * These are user-facing tokens that may contain syntactic sugar
 */
export type PathToken =
  | Readonly<{ readonly kind: "dot" }> // "."
  | Readonly<{ readonly kind: "dotdot" }> // ".."
  | Readonly<{ readonly kind: "relativeDate"; readonly expr: string }> // "today", "td", "+2w", "~mon"
  | Readonly<{ readonly kind: "idOrAlias"; readonly value: string }> // UUID or alias
  | Readonly<{ readonly kind: "numeric"; readonly value: number }> // section number
  | Readonly<{ readonly kind: "permanent" }>; // "permanent" for permanent placement

/**
 * PathExpression represents a path input with potential syntactic sugar
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
 * RangeExpression represents a range input
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

export const PATH_EXPRESSION_KIND_VALUE = PATH_EXPRESSION_KIND;
export const RANGE_EXPRESSION_KIND_VALUE = RANGE_EXPRESSION_KIND;

export const isPathExpression = (value: unknown): value is PathExpression =>
  typeof value === "object" &&
  value !== null &&
  (value as PathExpression).kind === PATH_EXPRESSION_KIND;

export const isRangeExpression = (value: unknown): value is RangeExpression =>
  typeof value === "object" &&
  value !== null &&
  ((value as RangeExpression).kind === "single" ||
    (value as RangeExpression).kind === "range");
