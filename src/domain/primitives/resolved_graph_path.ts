import { CalendarDay } from "./calendar_day.ts";
import { ItemId } from "./item_id.ts";
import { AliasSlug } from "./alias_slug.ts";

/**
 * ResolvedSegment represents a single segment in a resolved graph path
 * This is used for display purposes (e.g., pwd command)
 */
export type ResolvedSegment =
  | Readonly<{
    readonly kind: "date";
    readonly date: CalendarDay;
  }>
  | Readonly<{
    readonly kind: "item";
    readonly id: ItemId;
    readonly alias?: AliasSlug; // Optional alias for display
  }>
  | Readonly<{
    readonly kind: "section";
    readonly index: number;
  }>;

/**
 * ResolvedGraphPath represents a full path from root (date shelf) to an item
 * This is a view model for displaying paths to users
 *
 * The first segment must always be a date (root)
 * Subsequent segments can be items or sections
 *
 * Example:
 * /2025-11-15/book-item/1/3
 * → [
 *     { kind: "date", date: "2025-11-15" },
 *     { kind: "item", id: "book-uuid", alias: "book" },
 *     { kind: "section", index: 1 },
 *     { kind: "section", index: 3 }
 *   ]
 */
export type ResolvedGraphPath = Readonly<{
  readonly segments: ReadonlyArray<ResolvedSegment>;
}>;

/**
 * Create a ResolvedGraphPath from segments
 */
export const createResolvedGraphPath = (
  segments: ReadonlyArray<ResolvedSegment>,
): ResolvedGraphPath => {
  if (segments.length === 0) {
    throw new Error("ResolvedGraphPath must have at least one segment");
  }

  if (segments[0].kind !== "date") {
    throw new Error("ResolvedGraphPath must start with a date segment");
  }

  return Object.freeze({
    segments: Object.freeze([...segments]),
  });
};

/**
 * Format a ResolvedGraphPath as a string for display
 * Uses aliases when available
 */
export const formatResolvedGraphPath = (path: ResolvedGraphPath): string => {
  const parts: string[] = [];

  for (const segment of path.segments) {
    switch (segment.kind) {
      case "date":
        parts.push(segment.date.toString());
        break;
      case "item":
        parts.push(segment.alias?.toString() ?? segment.id.toString());
        break;
      case "section":
        parts.push(segment.index.toString());
        break;
    }
  }

  return `/${parts.join("/")}`;
};
