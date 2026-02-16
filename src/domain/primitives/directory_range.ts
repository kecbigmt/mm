import { CalendarDay } from "./calendar_day.ts";
import { Directory } from "./directory.ts";

/**
 * DirectoryRange represents a range of directories for querying items
 *
 * Three kinds:
 * - single: A single directory (e.g., `mm ls 2025-11-15`)
 * - dateRange: A range of date shelves (e.g., `mm ls 2025-11-15..2025-11-30`)
 * - numericRange: A range of numeric sections under the same parent
 *                 (e.g., `mm ls book/1/1..5`)
 */
export type DirectoryRange =
  | Readonly<{
    readonly kind: "single";
    readonly at: Directory;
  }>
  | Readonly<{
    readonly kind: "dateRange";
    readonly from: CalendarDay;
    readonly to: CalendarDay;
  }>
  | Readonly<{
    readonly kind: "numericRange";
    readonly parent: Directory;
    readonly from: number;
    readonly to: number;
  }>;

/**
 * Create a single directory range
 */
export const createSingleRange = (at: Directory): DirectoryRange =>
  Object.freeze({
    kind: "single" as const,
    at,
  });

/**
 * Create a date range
 */
export const createDateRange = (
  from: CalendarDay,
  to: CalendarDay,
): DirectoryRange =>
  Object.freeze({
    kind: "dateRange" as const,
    from,
    to,
  });

/**
 * Create a numeric range
 */
export const createNumericRange = (
  parent: Directory,
  from: number,
  to: number,
): DirectoryRange => {
  if (!Number.isInteger(from) || from < 1) {
    throw new Error(`from must be a positive integer, got ${from}`);
  }
  if (!Number.isInteger(to) || to < 1) {
    throw new Error(`to must be a positive integer, got ${to}`);
  }
  if (from > to) {
    throw new Error(`from (${from}) must be <= to (${to})`);
  }

  return Object.freeze({
    kind: "numericRange" as const,
    parent,
    from,
    to,
  });
};

/**
 * Check if a range is a single directory
 */
export const isSingleRange = (range: DirectoryRange): range is Extract<
  DirectoryRange,
  { kind: "single" }
> => range.kind === "single";

/**
 * Check if a range is a date range
 */
export const isDateRange = (range: DirectoryRange): range is Extract<
  DirectoryRange,
  { kind: "dateRange" }
> => range.kind === "dateRange";

/**
 * Check if a range is a numeric range
 */
export const isNumericRange = (range: DirectoryRange): range is Extract<
  DirectoryRange,
  { kind: "numericRange" }
> => range.kind === "numericRange";
