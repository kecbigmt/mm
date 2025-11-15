import { CalendarDay } from "./calendar_day.ts";
import { Placement } from "./placement.ts";

/**
 * PlacementRange represents a range of placements for querying items
 *
 * Three kinds:
 * - single: A single placement (e.g., `mm ls 2025-11-15`)
 * - dateRange: A range of date shelves (e.g., `mm ls 2025-11-15..2025-11-30`)
 * - numericRange: A range of numeric sections under the same parent
 *                 (e.g., `mm ls book/1/1..5`)
 */
export type PlacementRange =
  | Readonly<{
    readonly kind: "single";
    readonly at: Placement;
  }>
  | Readonly<{
    readonly kind: "dateRange";
    readonly from: CalendarDay;
    readonly to: CalendarDay;
  }>
  | Readonly<{
    readonly kind: "numericRange";
    readonly parent: Placement;
    readonly from: number;
    readonly to: number;
  }>;

/**
 * Create a single placement range
 */
export const createSingleRange = (at: Placement): PlacementRange =>
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
): PlacementRange =>
  Object.freeze({
    kind: "dateRange" as const,
    from,
    to,
  });

/**
 * Create a numeric range
 */
export const createNumericRange = (
  parent: Placement,
  from: number,
  to: number,
): PlacementRange => {
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
 * Check if a range is a single placement
 */
export const isSingleRange = (range: PlacementRange): range is Extract<
  PlacementRange,
  { kind: "single" }
> => range.kind === "single";

/**
 * Check if a range is a date range
 */
export const isDateRange = (range: PlacementRange): range is Extract<
  PlacementRange,
  { kind: "dateRange" }
> => range.kind === "dateRange";

/**
 * Check if a range is a numeric range
 */
export const isNumericRange = (range: PlacementRange): range is Extract<
  PlacementRange,
  { kind: "numericRange" }
> => range.kind === "numericRange";
