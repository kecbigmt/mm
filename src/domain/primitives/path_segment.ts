import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { AliasSlug, parseAliasSlug } from "./alias_slug.ts";
import { CalendarDay, parseCalendarDay } from "./calendar_day.ts";
import { ItemId, parseItemId } from "./item_id.ts";

const PATH_SEGMENT_KIND = "PathSegment" as const;

export type PathSegmentKind = "Date" | "Numeric" | "ItemId" | "ItemAlias";

export type PathSegment = Readonly<{
  readonly kind: PathSegmentKind;
  readonly raw: string;
  readonly value: CalendarDay | number | ItemId | AliasSlug;
  toString(): string;
}>;

export type PathSegmentValidationError = ValidationError<typeof PATH_SEGMENT_KIND>;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const NUMERIC_REGEX = /^[1-9]\d*$/u;

const instantiate = <T extends PathSegment>(segment: T): T => Object.freeze(segment);

const buildError = (
  issues: ReadonlyArray<ValidationIssue>,
): Result<PathSegment, PathSegmentValidationError> =>
  Result.error(createValidationError(PATH_SEGMENT_KIND, issues));

const parseItemSegment = (
  raw: string,
): Result<PathSegment, PathSegmentValidationError> => {
  const idResult = parseItemId(raw);
  if (idResult.type === "error") {
    return buildError(
      idResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["raw", ...issue.path],
        })
      ),
    );
  }

  return Result.ok(instantiate(
    {
      kind: "ItemId",
      raw,
      value: idResult.value,
      toString: () => raw,
    } as const,
  ));
};

const parseDateSegment = (
  raw: string,
): Result<PathSegment, PathSegmentValidationError> => {
  const dateResult = parseCalendarDay(raw);
  if (dateResult.type === "error") {
    return buildError(
      dateResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["raw", ...issue.path],
        })
      ),
    );
  }

  return Result.ok(instantiate(
    {
      kind: "Date",
      raw,
      value: dateResult.value,
      toString: () => raw,
    } as const,
  ));
};

const parseNumericSegment = (
  raw: string,
): Result<PathSegment, PathSegmentValidationError> => {
  if (!NUMERIC_REGEX.test(raw)) {
    return buildError([
      createValidationIssue("numeric segment must be a positive integer", {
        path: ["raw"],
        code: "format",
      }),
    ]);
  }

  return Result.ok(instantiate(
    {
      kind: "Numeric",
      raw,
      value: Number(raw),
      toString: () => raw,
    } as const,
  ));
};

const parseAliasSegment = (
  raw: string,
): Result<PathSegment, PathSegmentValidationError> => {
  const aliasResult = parseAliasSlug(raw);
  if (aliasResult.type === "error") {
    return buildError(
      aliasResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["raw", ...issue.path],
        })
      ),
    );
  }

  return Result.ok(instantiate(
    {
      kind: "ItemAlias",
      raw,
      value: aliasResult.value,
      toString: () => raw,
    } as const,
  ));
};

export const parsePathSegment = (
  input: unknown,
): Result<PathSegment, PathSegmentValidationError> => {
  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("path segment must be a string", {
        path: ["raw"],
        code: "type",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildError([
      createValidationIssue("path segment cannot be empty", {
        path: ["raw"],
        code: "empty",
      }),
    ]);
  }

  if (trimmed.includes("/")) {
    return buildError([
      createValidationIssue("path segment cannot contain '/'", {
        path: ["raw"],
        code: "format",
      }),
    ]);
  }

  if (DATE_REGEX.test(trimmed)) {
    return parseDateSegment(trimmed);
  }

  if (NUMERIC_REGEX.test(trimmed)) {
    return parseNumericSegment(trimmed);
  }

  const itemResult = parseItemSegment(trimmed);
  if (itemResult.type === "ok") {
    return itemResult;
  }

  return parseAliasSegment(trimmed);
};

export const isPathSegment = (value: unknown): value is PathSegment => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<PathSegment> & { value?: unknown };
  if (typeof candidate.kind !== "string" || typeof candidate.raw !== "string") {
    return false;
  }
  if (typeof candidate.toString !== "function") {
    return false;
  }

  switch (candidate.kind) {
    case "Numeric":
      return typeof candidate.value === "number";
    case "Date":
      return typeof candidate.value === "object" && candidate.value !== null;
    case "ItemId":
      return typeof candidate.value === "object" && candidate.value !== null;
    case "ItemAlias":
      return typeof candidate.value === "object" && candidate.value !== null;
    default:
      return false;
  }
};
