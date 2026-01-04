import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { CalendarDay, parseCalendarDay } from "./calendar_day.ts";
import { ItemId, parseItemId } from "./item_id.ts";

const PLACEMENT_KIND = "Placement" as const;

/**
 * PlacementHead represents the direct parent of an item
 * - date: Item is placed under a date shelf (calendar container)
 * - item: Item is placed under another item (UUID parent)
 * - permanent: Item is placed outside the date hierarchy (permanent notes)
 */
export type PlacementHead =
  | Readonly<{ readonly kind: "date"; readonly date: CalendarDay }>
  | Readonly<{ readonly kind: "item"; readonly id: ItemId }>
  | Readonly<{ readonly kind: "permanent" }>;

/**
 * Placement represents the canonical, absolute position of an item
 * - head: Direct parent (date shelf or parent item UUID)
 * - section: Numeric section chain (e.g., [], [1], [1, 3])
 *
 * Important: Placement is LOCAL - it only knows about the direct parent
 * and section, not the full path to root. To get the full path, you need
 * to traverse parent relationships.
 *
 * Examples:
 * - Under date shelf: { head: { kind: "date", date: "2025-11-15" }, section: [] }
 * - Under date/section: { head: { kind: "date", date: "2025-11-15" }, section: [1, 3] }
 * - Under item: { head: { kind: "item", id: "<uuid>" }, section: [] }
 * - Under item/section: { head: { kind: "item", id: "<uuid>" }, section: [1, 3] }
 */
export type Placement = Readonly<{
  readonly kind: typeof PLACEMENT_KIND;
  readonly head: PlacementHead;
  readonly section: ReadonlyArray<number>;
  toString(): string;
  toJSON(): string;
  equals(other: Placement): boolean;
  parent(): Placement | null;
}>;

export type PlacementValidationError = ValidationError<typeof PLACEMENT_KIND>;

const instantiate = (
  head: PlacementHead,
  section: ReadonlyArray<number>,
): Placement => {
  const frozenSection = Object.freeze([...section]);

  const toString = function (this: Placement): string {
    return serializePlacement(this);
  };

  const toJSON = toString;

  const equals = function (this: Placement, other: Placement): boolean {
    // Compare heads
    if (this.head.kind !== other.head.kind) {
      return false;
    }
    if (this.head.kind === "date" && other.head.kind === "date") {
      if (this.head.date.toString() !== other.head.date.toString()) {
        return false;
      }
    }
    if (this.head.kind === "item" && other.head.kind === "item") {
      if (this.head.id.toString() !== other.head.id.toString()) {
        return false;
      }
    }

    // Compare sections
    if (this.section.length !== other.section.length) {
      return false;
    }
    return this.section.every((seg, idx) => seg === other.section[idx]);
  };

  const parent = function (this: Placement): Placement | null {
    if (this.section.length === 0) {
      return null; // Already at the direct parent
    }
    const withoutLast = this.section.slice(0, -1);
    return instantiate(this.head, withoutLast);
  };

  return Object.freeze({
    kind: PLACEMENT_KIND,
    head: Object.freeze(head),
    section: frozenSection,
    toString,
    toJSON,
    equals,
    parent,
  });
};

const buildError = (
  issues: ReadonlyArray<ValidationIssue>,
): Result<Placement, PlacementValidationError> =>
  Result.error(createValidationError(PLACEMENT_KIND, issues));

/**
 * Serialize a Placement to a PlacementString
 *
 * Format: <head>[/<section>]*
 * - head: YYYY-MM-DD (date), UUID (item), or "permanent"
 * - section: numeric segments separated by /
 *
 * Examples:
 * - "2025-11-15" → date shelf
 * - "2025-11-15/1/3" → date shelf, section [1, 3]
 * - "019a85fc-67c4-7a54-be8e-305bae009f9e" → item parent
 * - "019a85fc-67c4-7a54-be8e-305bae009f9e/1" → item parent, section [1]
 * - "permanent" → permanent placement
 * - "permanent/1" → permanent placement with section
 */
export const serializePlacement = (placement: Placement): string => {
  let headStr: string;
  switch (placement.head.kind) {
    case "date":
      headStr = placement.head.date.toString();
      break;
    case "item":
      headStr = placement.head.id.toString();
      break;
    case "permanent":
      headStr = "permanent";
      break;
  }

  if (placement.section.length === 0) {
    return headStr;
  }

  const sectionStr = placement.section.join("/");
  return `${headStr}/${sectionStr}`;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Parse a PlacementString to a Placement
 *
 * PlacementString format: <head>[/<section>]*
 * - First segment must be a date (YYYY-MM-DD) or UUID
 * - Remaining segments must be positive integers (sections)
 * - No leading `/`
 */
export const parsePlacement = (
  input: unknown,
): Result<Placement, PlacementValidationError> => {
  // Allow passing through existing Placement objects
  if (typeof input === "object" && input !== null) {
    const candidate = input as Partial<Placement>;
    if (candidate.kind === PLACEMENT_KIND && typeof candidate.toString === "function") {
      return Result.ok(candidate as Placement);
    }
  }

  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("placement must be a string", {
        path: ["value"],
        code: "type",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildError([
      createValidationIssue("placement cannot be empty", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  // Placement strings should not start with /
  if (trimmed.startsWith("/")) {
    return buildError([
      createValidationIssue("placement should not start with '/'", {
        path: ["value"],
        code: "format",
      }),
    ]);
  }

  const segments = trimmed.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return buildError([
      createValidationIssue("placement must have at least a head segment", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  const [headSegment, ...sectionSegments] = segments;

  // Parse head (date, item UUID, or "permanent")
  let head: PlacementHead;

  if (headSegment === "permanent") {
    head = { kind: "permanent" };
  } else if (DATE_REGEX.test(headSegment)) {
    const dateResult = parseCalendarDay(headSegment);
    if (dateResult.type === "error") {
      return buildError(
        dateResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["head", ...issue.path],
          })
        ),
      );
    }
    head = { kind: "date", date: dateResult.value };
  } else {
    const idResult = parseItemId(headSegment);
    if (idResult.type === "error") {
      return buildError(
        idResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["head", ...issue.path],
          })
        ),
      );
    }
    head = { kind: "item", id: idResult.value };
  }

  // Parse section segments (must all be positive integers)
  const section: number[] = [];
  for (let i = 0; i < sectionSegments.length; i++) {
    const segmentStr = sectionSegments[i];
    const num = Number(segmentStr);

    if (!Number.isInteger(num) || num < 1) {
      return buildError([
        createValidationIssue(
          `section segment must be a positive integer, got '${segmentStr}'`,
          {
            path: ["section", i],
            code: "format",
          },
        ),
      ]);
    }

    section.push(num);
  }

  return Result.ok(instantiate(head, section));
};

/**
 * Create a Placement from components
 */
export const createPlacement = (
  head: PlacementHead,
  section: ReadonlyArray<number> = [],
): Placement => {
  // Validate section contains only positive integers
  for (let i = 0; i < section.length; i++) {
    if (!Number.isInteger(section[i]) || section[i] < 1) {
      throw new Error(`section[${i}] must be a positive integer, got ${section[i]}`);
    }
  }
  return instantiate(head, section);
};

/**
 * Create a date placement
 */
export const createDatePlacement = (
  date: CalendarDay,
  section: ReadonlyArray<number> = [],
): Placement => createPlacement({ kind: "date", date }, section);

/**
 * Create an item placement
 */
export const createItemPlacement = (
  id: ItemId,
  section: ReadonlyArray<number> = [],
): Placement => createPlacement({ kind: "item", id }, section);

/**
 * Create a permanent placement
 */
export const createPermanentPlacement = (
  section: ReadonlyArray<number> = [],
): Placement => createPlacement({ kind: "permanent" }, section);

export const isPlacement = (value: unknown): value is Placement =>
  typeof value === "object" && value !== null && (value as Placement).kind === PLACEMENT_KIND;
