import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { CalendarDay, parseCalendarDay } from "./calendar_day.ts";
import { ItemId, parseItemId } from "./item_id.ts";

const DIRECTORY_KIND = "Directory" as const;

/**
 * DirectoryHead represents the direct parent of an item
 * - date: Item is placed under a date shelf (calendar container)
 * - item: Item is placed under another item (UUID parent)
 * - permanent: Item is placed outside the date hierarchy (permanent notes)
 */
export type DirectoryHead =
  | Readonly<{ readonly kind: "date"; readonly date: CalendarDay }>
  | Readonly<{ readonly kind: "item"; readonly id: ItemId }>
  | Readonly<{ readonly kind: "permanent" }>;

/**
 * Directory represents the canonical, absolute position of an item
 * - head: Direct parent (date shelf or parent item UUID)
 * - section: Numeric section chain (e.g., [], [1], [1, 3])
 *
 * Important: Directory is LOCAL - it only knows about the direct parent
 * and section, not the full path to root. To get the full path, you need
 * to traverse parent relationships.
 *
 * Examples:
 * - Under date shelf: { head: { kind: "date", date: "2025-11-15" }, section: [] }
 * - Under date/section: { head: { kind: "date", date: "2025-11-15" }, section: [1, 3] }
 * - Under item: { head: { kind: "item", id: "<uuid>" }, section: [] }
 * - Under item/section: { head: { kind: "item", id: "<uuid>" }, section: [1, 3] }
 */
export type Directory = Readonly<{
  readonly kind: typeof DIRECTORY_KIND;
  readonly head: DirectoryHead;
  readonly section: ReadonlyArray<number>;
  toString(): string;
  toJSON(): string;
  equals(other: Directory): boolean;
  parent(): Directory | null;
}>;

export type DirectoryValidationError = ValidationError<typeof DIRECTORY_KIND>;

const instantiate = (
  head: DirectoryHead,
  section: ReadonlyArray<number>,
): Directory => {
  const frozenSection = Object.freeze([...section]);

  const toString = function (this: Directory): string {
    return serializeDirectory(this);
  };

  const toJSON = toString;

  const equals = function (this: Directory, other: Directory): boolean {
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

  const parent = function (this: Directory): Directory | null {
    if (this.section.length === 0) {
      return null; // Already at the direct parent
    }
    const withoutLast = this.section.slice(0, -1);
    return instantiate(this.head, withoutLast);
  };

  return Object.freeze({
    kind: DIRECTORY_KIND,
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
): Result<Directory, DirectoryValidationError> =>
  Result.error(createValidationError(DIRECTORY_KIND, issues));

/**
 * Serialize a Directory to a DirectoryString
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
 * - "permanent" → permanent directory
 * - "permanent/1" → permanent directory with section
 */
export const serializeDirectory = (directory: Directory): string => {
  let headStr: string;
  switch (directory.head.kind) {
    case "date":
      headStr = directory.head.date.toString();
      break;
    case "item":
      headStr = directory.head.id.toString();
      break;
    case "permanent":
      headStr = "permanent";
      break;
  }

  if (directory.section.length === 0) {
    return headStr;
  }

  const sectionStr = directory.section.join("/");
  return `${headStr}/${sectionStr}`;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Parse a DirectoryString to a Directory
 *
 * DirectoryString format: <head>[/<section>]*
 * - First segment must be a date (YYYY-MM-DD) or UUID
 * - Remaining segments must be positive integers (sections)
 * - No leading `/`
 */
export const parseDirectory = (
  input: unknown,
): Result<Directory, DirectoryValidationError> => {
  // Allow passing through existing Directory objects
  if (typeof input === "object" && input !== null) {
    const candidate = input as Partial<Directory>;
    if (candidate.kind === DIRECTORY_KIND && typeof candidate.toString === "function") {
      return Result.ok(candidate as Directory);
    }
  }

  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("directory must be a string", {
        path: ["value"],
        code: "type",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildError([
      createValidationIssue("directory cannot be empty", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  // Directory strings should not start with /
  if (trimmed.startsWith("/")) {
    return buildError([
      createValidationIssue("directory should not start with '/'", {
        path: ["value"],
        code: "format",
      }),
    ]);
  }

  const segments = trimmed.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return buildError([
      createValidationIssue("directory must have at least a head segment", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  const [headSegment, ...sectionSegments] = segments;

  // Parse head (date, item UUID, or "permanent")
  let head: DirectoryHead;

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
 * Create a Directory from components
 */
export const createDirectory = (
  head: DirectoryHead,
  section: ReadonlyArray<number> = [],
): Directory => {
  // Validate section contains only positive integers
  for (let i = 0; i < section.length; i++) {
    if (!Number.isInteger(section[i]) || section[i] < 1) {
      throw new Error(`section[${i}] must be a positive integer, got ${section[i]}`);
    }
  }
  return instantiate(head, section);
};

/**
 * Create a date directory
 */
export const createDateDirectory = (
  date: CalendarDay,
  section: ReadonlyArray<number> = [],
): Directory => createDirectory({ kind: "date", date }, section);

/**
 * Create an item directory
 */
export const createItemDirectory = (
  id: ItemId,
  section: ReadonlyArray<number> = [],
): Directory => createDirectory({ kind: "item", id }, section);

/**
 * Create a permanent directory
 */
export const createPermanentDirectory = (
  section: ReadonlyArray<number> = [],
): Directory => createDirectory({ kind: "permanent" }, section);

export const isDirectory = (value: unknown): value is Directory =>
  typeof value === "object" && value !== null && (value as Directory).kind === DIRECTORY_KIND;
