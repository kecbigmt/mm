import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { parsePathSegment, PathSegment } from "./path_segment.ts";

const PATH_KIND = "Path" as const;

export type PathRangeSegment = Readonly<{
  readonly kind: "range";
  readonly raw: string;
  readonly start: PathSegment;
  readonly end: PathSegment;
  toString(): string;
}>;

export type PathSegments = ReadonlyArray<PathSegment | PathRangeSegment>;

export type Path = Readonly<{
  readonly kind: typeof PATH_KIND;
  readonly segments: PathSegments;
  readonly raw: string;
  toString(): string;
  toJSON(): string;
  parent(): Path | null;
  appendSegment(segment: PathSegment): Path;
  isRange(): boolean;
  equals(other: Path): boolean;
}>;

export type PathValidationError = ValidationError<typeof PATH_KIND>;

export type ParsePathOptions = Readonly<{
  readonly cwd?: Path;
  readonly today?: Date;
}>;

const instantiate = (segments: PathSegments): Path => {
  const frozenSegments = Object.freeze([...segments]);
  const normalized = segments.length === 0
    ? "/"
    : `/${segments.map((segment) => segment.toString()).join("/")}`;

  const parent = function (this: Path): Path | null {
    if (this.segments.length === 0) {
      return null;
    }
    const withoutLast = this.segments.slice(0, -1) as PathSegments;
    return instantiate(withoutLast);
  };

  const appendSegment = function (this: Path, segment: PathSegment): Path {
    if (this.isRange()) {
      throw new Error("cannot append segment to a range path");
    }
    return instantiate([...this.segments, segment]);
  };

  const isRange = function (this: Path): boolean {
    if (this.segments.length === 0) {
      return false;
    }
    const last = this.segments[this.segments.length - 1];
    return last.kind === "range";
  };

  return Object.freeze({
    kind: PATH_KIND,
    segments: frozenSegments,
    raw: normalized,
    toString: () => normalized,
    toJSON: () => normalized,
    parent,
    appendSegment,
    isRange,
    equals(other: Path) {
      return normalized === other.toString();
    },
  });
};

const buildError = (
  issues: ReadonlyArray<ValidationIssue>,
): Result<Path, PathValidationError> => Result.error(createValidationError(PATH_KIND, issues));

type RelativeResolution =
  | { readonly kind: "none" }
  | { readonly kind: "resolved"; readonly value: string }
  | { readonly kind: "error"; readonly message: string; readonly code: string };

const RELATIVE_DAY_KEYWORDS = new Map<string, number>([
  ["today", 0],
  ["td", 0],
  ["tomorrow", 1],
  ["tm", 1],
  ["yesterday", -1],
  ["yd", -1],
]);

const RELATIVE_PERIOD_REGEX = /^([~+])(\d+)([dwmy])$/u;
const RELATIVE_WEEKDAY_REGEX = /^([~+])(mon|tue|wed|thu|fri|sat|sun)$/u;

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const formatIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const adjustDays = (base: Date, offset: number): Date => {
  const adjusted = new Date(base);
  adjusted.setUTCDate(adjusted.getUTCDate() + offset);
  return adjusted;
};

const adjustMonths = (base: Date, offset: number): Date => {
  const adjusted = new Date(base);
  adjusted.setUTCMonth(adjusted.getUTCMonth() + offset);
  return adjusted;
};

const adjustYears = (base: Date, offset: number): Date => {
  const adjusted = new Date(base);
  adjusted.setUTCFullYear(adjusted.getUTCFullYear() + offset);
  return adjusted;
};

const resolveRelativeToken = (
  raw: string,
  today?: Date,
): RelativeResolution => {
  const normalized = raw.trim().toLowerCase();
  const keywordOffset = RELATIVE_DAY_KEYWORDS.get(normalized);
  if (keywordOffset !== undefined) {
    if (!today) {
      return {
        kind: "error",
        message: `relative token '${raw}' requires a reference date`,
        code: "relative_requires_today",
      };
    }
    const base = startOfUtcDay(today);
    return { kind: "resolved", value: formatIsoDate(adjustDays(base, keywordOffset)) };
  }

  const periodMatch = normalized.match(RELATIVE_PERIOD_REGEX);
  if (periodMatch) {
    if (!today) {
      return {
        kind: "error",
        message: `relative token '${raw}' requires a reference date`,
        code: "relative_requires_today",
      };
    }
    const [, operator, magnitudeRaw, unit] = periodMatch;
    const magnitude = Number.parseInt(magnitudeRaw, 10);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      return {
        kind: "error",
        message: "relative period must use a positive integer",
        code: "relative_invalid_magnitude",
      };
    }
    const direction = operator === "+" ? 1 : -1;
    const base = startOfUtcDay(today);
    switch (unit) {
      case "d":
        return { kind: "resolved", value: formatIsoDate(adjustDays(base, direction * magnitude)) };
      case "w":
        return {
          kind: "resolved",
          value: formatIsoDate(adjustDays(base, direction * magnitude * 7)),
        };
      case "m":
        return {
          kind: "resolved",
          value: formatIsoDate(adjustMonths(base, direction * magnitude)),
        };
      case "y":
        return { kind: "resolved", value: formatIsoDate(adjustYears(base, direction * magnitude)) };
      default:
        return { kind: "none" };
    }
  }

  const weekdayMatch = normalized.match(RELATIVE_WEEKDAY_REGEX);
  if (weekdayMatch) {
    if (!today) {
      return {
        kind: "error",
        message: `relative token '${raw}' requires a reference date`,
        code: "relative_requires_today",
      };
    }
    const [, operator, weekdayRaw] = weekdayMatch;
    const targetIndex = WEEKDAY_INDEX[weekdayRaw];
    const base = startOfUtcDay(today);
    const baseIndex = base.getUTCDay();
    if (operator === "+") {
      let delta = (targetIndex - baseIndex + 7) % 7;
      if (delta === 0) {
        delta = 7;
      }
      return { kind: "resolved", value: formatIsoDate(adjustDays(base, delta)) };
    }
    let delta = (baseIndex - targetIndex + 7) % 7;
    if (delta === 0) {
      delta = 7;
    }
    return { kind: "resolved", value: formatIsoDate(adjustDays(base, -delta)) };
  }

  return { kind: "none" };
};

const splitRange = (
  raw: string,
): { start: string; end: string } | undefined => {
  const parts = raw.split("..");
  if (parts.length !== 2) {
    return undefined;
  }
  const [start, end] = parts;
  if (!start || !end) {
    return undefined;
  }
  return { start, end };
};

const parseRangeSegment = (
  raw: string,
  options: {
    readonly today?: Date;
  },
): Result<PathRangeSegment, PathValidationError> => {
  const rangeError = (
    issues: ReadonlyArray<ValidationIssue>,
  ): Result<PathRangeSegment, PathValidationError> =>
    Result.error(createValidationError(PATH_KIND, issues));

  const range = splitRange(raw);
  if (!range) {
    return rangeError([
      createValidationIssue("range segment must be formatted as '<from>..<to>'", {
        path: ["value"],
        code: "format",
      }),
    ]);
  }

  const startResolution = resolveRelativeToken(range.start, options.today);
  if (startResolution.kind === "error") {
    return rangeError([
      createValidationIssue(startResolution.message, {
        code: startResolution.code,
        path: ["range", "start", "value"],
      }),
    ]);
  }

  const startInput = startResolution.kind === "resolved" ? startResolution.value : range.start;
  const startResult = parsePathSegment(startInput);
  if (startResult.type === "error") {
    return rangeError(
      startResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["range", "start", ...issue.path],
        })
      ),
    );
  }

  const endResolution = resolveRelativeToken(range.end, options.today);
  if (endResolution.kind === "error") {
    return rangeError([
      createValidationIssue(endResolution.message, {
        code: endResolution.code,
        path: ["range", "end", "value"],
      }),
    ]);
  }

  const endInput = endResolution.kind === "resolved" ? endResolution.value : range.end;
  const endResult = parsePathSegment(endInput);
  if (endResult.type === "error") {
    return rangeError(
      endResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["range", "end", ...issue.path],
        })
      ),
    );
  }

  return Result.ok(Object.freeze({
    kind: "range" as const,
    raw,
    start: startResult.value,
    end: endResult.value,
    toString: () => raw,
  }));
};

const lastSegmentIsRangeCandidate = (
  index: number,
  segments: string[],
): boolean => index === segments.length - 1 && segments[index].includes("..");

const cloneBaseSegments = (path: Path | undefined): PathSegment[] => {
  if (!path) {
    return [];
  }
  const base: PathSegment[] = [];
  for (const segment of path.segments) {
    if (segment.kind === "range") {
      break;
    }
    base.push(segment as PathSegment);
  }
  return base;
};

const normalizeTokens = (
  raw: string,
): string[] => raw.split("/").filter((part) => part.length > 0);

export const parsePath = (
  input: unknown,
  options: ParsePathOptions = {},
): Result<Path, PathValidationError> => {
  if (typeof input === "object" && input !== null) {
    const candidate = input as Partial<Path>;
    if (candidate.kind === PATH_KIND && typeof candidate.toString === "function") {
      return Result.ok(candidate as Path);
    }
  }

  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("path must be a string", {
        path: ["value"],
        code: "type",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildError([
      createValidationIssue("path cannot be empty", {
        path: ["value"],
        code: "empty",
      }),
    ]);
  }

  const absolute = trimmed.startsWith("/");
  const baseSegments = cloneBaseSegments(absolute ? undefined : options.cwd);

  if (!absolute && options.cwd === undefined) {
    return buildError([
      createValidationIssue("relative path requires a current working path", {
        path: ["value"],
        code: "relative_without_cwd",
      }),
    ]);
  }

  const rawTokens = absolute ? trimmed.slice(1) : trimmed;
  const tokens = normalizeTokens(rawTokens);

  let resolvedHead = false;
  const stack: (PathSegment | PathRangeSegment)[] = [...baseSegments];

  const today = options.today;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === ".") {
      continue;
    }
    if (token === "..") {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }

    let segmentInput = token;
    if (!resolvedHead) {
      const resolution = resolveRelativeToken(token, today);
      if (resolution.kind === "error") {
        return buildError([
          createValidationIssue(resolution.message, {
            code: resolution.code,
            path: [index, "value"],
          }),
        ]);
      }
      if (resolution.kind === "resolved") {
        segmentInput = resolution.value;
      }
    }

    if (lastSegmentIsRangeCandidate(index, tokens)) {
      const rangeResult = parseRangeSegment(token, { today });
      if (rangeResult.type === "error") {
        return rangeResult;
      }
      stack.push(rangeResult.value);
      resolvedHead = true;
      continue;
    }

    const segmentResult = parsePathSegment(segmentInput);
    if (segmentResult.type === "error") {
      return buildError(
        segmentResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: [index, ...issue.path],
          })
        ),
      );
    }

    stack.push(segmentResult.value);
    resolvedHead = true;
  }

  return Result.ok(instantiate(stack));
};

export const isPath = (value: unknown): value is Path =>
  typeof value === "object" && value !== null && (value as Path).kind === PATH_KIND;

export const pathFromString = (
  raw: string,
  options: ParsePathOptions = {},
): Result<Path, PathValidationError> => parsePath(raw, options);
