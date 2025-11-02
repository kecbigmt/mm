import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { parsePath, ParsePathOptions, Path, PathRangeSegment } from "./path.ts";
import { PathSegment } from "./path_segment.ts";

const LOCATOR_KIND = "Locator" as const;

export type LocatorRangeKind = "numeric" | "date";

export type LocatorRange = Readonly<{
  readonly kind: LocatorRangeKind;
  readonly segment: PathRangeSegment;
  readonly start: PathSegment;
  readonly end: PathSegment;
}>;

export type Locator = Readonly<{
  readonly kind: typeof LOCATOR_KIND;
  readonly path: Path;
  readonly range?: LocatorRange;
  readonly raw: string;
  toString(): string;
  isRange(): boolean;
  head(): PathSegment | undefined;
  segments(): ReadonlyArray<PathSegment | PathRangeSegment>;
}>;

export type LocatorValidationError = ValidationError<typeof LOCATOR_KIND>;

export type ParseLocatorOptions = ParsePathOptions;

const instantiate = (
  path: Path,
  range: LocatorRange | undefined,
  raw: string,
): Locator => {
  const frozenRange = range ? Object.freeze(range) : undefined;
  return Object.freeze({
    kind: LOCATOR_KIND,
    path,
    range: frozenRange,
    raw,
    toString: () => path.toString(),
    isRange: () => path.isRange(),
    head: () => {
      const first = path.segments[0];
      if (!first) {
        return undefined;
      }
      return first.kind === "range" ? undefined : first;
    },
    segments: () => path.segments,
  });
};

const buildError = (
  issues: ValidationIssue[],
): Result<Locator, LocatorValidationError> =>
  Result.error(createValidationError(LOCATOR_KIND, issues));

const validateDateSegments = (
  path: Path,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < path.segments.length; index += 1) {
    const segment = path.segments[index];
    if (segment.kind === "range") {
      continue;
    }
    if (segment.kind === "Date" && index > 0) {
      issues.push(
        createValidationIssue("date segments may only appear at the head of a locator", {
          code: "date_not_head",
          path: [index],
        }),
      );
    }
  }
  return issues;
};

const determineRange = (
  path: Path,
): Result<LocatorRange | undefined, LocatorValidationError> => {
  const segments = path.segments;
  if (segments.length === 0) {
    return Result.ok(undefined);
  }
  const last = segments[segments.length - 1];
  if (last.kind !== "range") {
    return Result.ok(undefined);
  }

  const start = last.start;
  const end = last.end;

  if (start.kind !== end.kind) {
    return Result.error(
      createValidationError(LOCATOR_KIND, [
        createValidationIssue("range endpoints must share the same kind", {
          code: "range_mismatched_kind",
          path: ["range"],
        }),
      ]),
    );
  }

  if (start.kind === "Numeric") {
    if (start.value > end.value) {
      return Result.error(
        createValidationError(LOCATOR_KIND, [
          createValidationIssue("numeric ranges must be increasing", {
            code: "range_descending",
            path: ["range"],
          }),
        ]),
      );
    }
    return Result.ok(Object.freeze({
      kind: "numeric" as const,
      segment: last,
      start,
      end,
    }));
  }

  if (start.kind === "Date") {
    if (segments.length > 1) {
      return Result.error(
        createValidationError(LOCATOR_KIND, [
          createValidationIssue("date ranges may only appear at the head of a locator", {
            code: "range_date_not_head",
            path: ["range"],
          }),
        ]),
      );
    }
    if (start.value.toString() > end.value.toString()) {
      return Result.error(
        createValidationError(LOCATOR_KIND, [
          createValidationIssue("date ranges must be increasing", {
            code: "range_descending",
            path: ["range"],
          }),
        ]),
      );
    }
    return Result.ok(Object.freeze({
      kind: "date" as const,
      segment: last,
      start,
      end,
    }));
  }

  return Result.error(
    createValidationError(LOCATOR_KIND, [
      createValidationIssue("ranges must target numeric sections or date heads", {
        code: "range_invalid_kind",
        path: ["range"],
      }),
    ]),
  );
};

export const parseLocator = (
  input: unknown,
  options: ParseLocatorOptions = {},
): Result<Locator, LocatorValidationError> => {
  const rawInput = typeof input === "string" ? input.trim() : undefined;
  const candidate = (() => {
    if (typeof input === "string") {
      const trimmed = input.trim();
      if (trimmed.startsWith("/")) {
        return trimmed;
      }
      return `/${trimmed}`;
    }
    return input;
  })();

  const pathResult = parsePath(candidate, options);
  if (pathResult.type === "error") {
    return Result.error(createValidationError(LOCATOR_KIND, pathResult.error.issues));
  }

  const path = pathResult.value;
  const issues = validateDateSegments(path);
  if (issues.length > 0) {
    return buildError(issues);
  }

  const rangeResult = determineRange(path);
  if (rangeResult.type === "error") {
    return Result.error(rangeResult.error);
  }

  const raw = typeof rawInput === "string" && rawInput.length > 0 ? rawInput : path.toString();
  return Result.ok(instantiate(path, rangeResult.value, raw));
};

export const isLocator = (value: unknown): value is Locator =>
  typeof value === "object" && value !== null && (value as Locator).kind === LOCATOR_KIND;
