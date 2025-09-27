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

const resolveRelativeDate = (
  raw: string,
  today?: Date,
): string | undefined => {
  if (!today) {
    return undefined;
  }
  const midnight = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  ));
  switch (raw) {
    case "today":
      return midnight.toISOString().slice(0, 10);
    case "tomorrow": {
      const next = new Date(midnight);
      next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString().slice(0, 10);
    }
    case "yesterday": {
      const prev = new Date(midnight);
      prev.setUTCDate(prev.getUTCDate() - 1);
      return prev.toISOString().slice(0, 10);
    }
    default:
      return undefined;
  }
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

  const startResult = parsePathSegment(range.start);
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

  const endResult = parsePathSegment(range.end);
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

    if (!resolvedHead) {
      const resolved = resolveRelativeDate(token, today ?? undefined);
      if (resolved) {
        const segmentResult = parsePathSegment(resolved);
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
        continue;
      }
    }

    if (lastSegmentIsRangeCandidate(index, tokens)) {
      const rangeResult = parseRangeSegment(token);
      if (rangeResult.type === "error") {
        return rangeResult;
      }
      stack.push(rangeResult.value);
      continue;
    }

    const segmentResult = parsePathSegment(token);
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
