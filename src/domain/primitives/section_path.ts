import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { isSectionSegment, parseSectionSegment, SectionSegment } from "./section_segment.ts";

const SECTION_PATH_KIND = "SectionPath" as const;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

export type SectionPathMode = "numeric" | "date";

export type SectionPath = Readonly<{
  readonly raw: string;
  readonly mode: SectionPathMode;
  readonly segments: ReadonlyArray<SectionSegment>;
  toString(): string;
  toJSON(): string;
}>;

export type SectionPathValidationError = ValidationError<typeof SECTION_PATH_KIND>;

const instantiate = (
  raw: string,
  mode: SectionPathMode,
  segments: SectionSegment[],
): SectionPath => {
  const frozenSegments = Object.freeze(segments.slice());
  return Object.freeze({
    raw,
    mode,
    segments: frozenSegments,
    toString: () => raw,
    toJSON: () => raw,
  });
};

export const isSectionPath = (value: unknown): value is SectionPath => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SectionPath>;
  return typeof candidate.raw === "string" &&
    (candidate.mode === "numeric" || candidate.mode === "date") &&
    Array.isArray(candidate.segments) &&
    candidate.segments.every(isSectionSegment) &&
    typeof candidate.toString === "function" &&
    typeof candidate.toJSON === "function";
};

const buildError = (
  issues: ValidationIssue[],
): Result<SectionPath, SectionPathValidationError> =>
  Result.error(createValidationError(SECTION_PATH_KIND, issues));

export const parseSectionPath = (
  input: unknown,
): Result<SectionPath, SectionPathValidationError> => {
  if (isSectionPath(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("section path must be a string", {
        path: ["raw"],
        code: "not_string",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildError([
      createValidationIssue("section path cannot be empty", {
        path: ["raw"],
        code: "empty",
      }),
    ]);
  }

  if (!trimmed.startsWith(":")) {
    return buildError([
      createValidationIssue("section path must start with ':'", {
        path: ["raw"],
        code: "format",
      }),
    ]);
  }

  const body = trimmed.slice(1);
  if (body.length === 0) {
    return buildError([
      createValidationIssue("section path must include at least one segment", {
        path: ["raw"],
        code: "empty",
      }),
    ]);
  }

  if (DATE_REGEX.test(body)) {
    const segmentResult = parseSectionSegment(body);
    if (segmentResult.type === "error") {
      const issues = segmentResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["segments", 0, ...issue.path],
        })
      );
      return buildError(issues);
    }
    return Result.ok(instantiate(trimmed, "date", [segmentResult.value]));
  }

  const parts = body.split("-");
  const segments: SectionSegment[] = [];
  const issues: ValidationIssue[] = [];

  parts.forEach((part, index) => {
    const segmentResult = parseSectionSegment(part);
    if (segmentResult.type === "error") {
      issues.push(
        ...segmentResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["segments", index, ...issue.path],
          })
        ),
      );
      return;
    }

    if (segmentResult.value.kind !== "numeric") {
      issues.push(
        createValidationIssue("numeric section segments must be integers", {
          path: ["segments", index, "raw"],
          code: "format",
        }),
      );
      return;
    }

    segments.push(segmentResult.value);
  });

  if (issues.length > 0) {
    return buildError(issues);
  }

  return Result.ok(instantiate(trimmed, "numeric", segments));
};
