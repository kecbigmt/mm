import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { CalendarDay, parseCalendarDay } from "./calendar_day.ts";

const SECTION_SEGMENT_KIND = "SectionSegment" as const;

export type NumericSectionSegment = Readonly<{
  readonly kind: "numeric";
  readonly value: number;
  readonly raw: string;
}>;

export type DateSectionSegment = Readonly<{
  readonly kind: "date";
  readonly value: CalendarDay;
  readonly raw: string;
}>;

export type SectionSegment = NumericSectionSegment | DateSectionSegment;

export type SectionSegmentValidationError = ValidationError<typeof SECTION_SEGMENT_KIND>;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const NUMERIC_REGEX = /^[1-9]\d*$/u;

const instantiateNumeric = (raw: string): NumericSectionSegment =>
  Object.freeze({
    kind: "numeric",
    value: Number(raw),
    raw,
  });

const instantiateDate = (raw: string, value: CalendarDay): DateSectionSegment =>
  Object.freeze({
    kind: "date",
    value,
    raw,
  });

export const isSectionSegment = (value: unknown): value is SectionSegment => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SectionSegment>;
  if (candidate.kind === "numeric") {
    return typeof candidate.raw === "string" && typeof candidate.value === "number";
  }
  if (candidate.kind === "date") {
    return typeof candidate.raw === "string" && typeof candidate.value === "object" &&
      candidate.value !== null;
  }
  return false;
};

const buildError = (
  issues: ValidationIssue[],
): Result<SectionSegment, SectionSegmentValidationError> =>
  Result.error(createValidationError(SECTION_SEGMENT_KIND, issues));

export const parseSectionSegment = (
  input: unknown,
): Result<SectionSegment, SectionSegmentValidationError> => {
  if (isSectionSegment(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return buildError([
      createValidationIssue("section segment must be a string", {
        path: ["raw"],
        code: "not_string",
      }),
    ]);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return buildError([
      createValidationIssue("section segment cannot be empty", {
        path: ["raw"],
        code: "empty",
      }),
    ]);
  }

  if (DATE_REGEX.test(trimmed)) {
    const dateResult = parseCalendarDay(trimmed);
    if (dateResult.type === "error") {
      const issues = dateResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["raw", ...issue.path],
        })
      );
      return buildError(issues);
    }
    return Result.ok(instantiateDate(trimmed, dateResult.value));
  }

  if (NUMERIC_REGEX.test(trimmed)) {
    return Result.ok(instantiateNumeric(trimmed));
  }

  return buildError([
    createValidationIssue("section segment must be a positive integer or YYYY-MM-DD", {
      path: ["raw"],
      code: "format",
    }),
  ]);
};
