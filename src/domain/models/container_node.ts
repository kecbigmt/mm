import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  CalendarDay,
  calendarDayFromComponents,
  CalendarDayValidationError,
  CalendarMonth,
  calendarMonthFromComponents,
  CalendarMonthValidationError,
  CalendarYear,
  CalendarYearValidationError,
  ContainerIndex,
  ContainerIndexValidationError,
  ContainerPath,
  ContainerPathValidationError,
  isContainerPath,
  NodeId,
  parseCalendarYear,
  parseContainerIndex,
  parseContainerPath,
  parseNodeId,
} from "../primitives/mod.ts";

const CONTAINER_NODE_KIND = "ContainerNode" as const;

export type WorkspaceRootContainerNode = Readonly<{
  readonly kind: "WorkspaceRoot";
  readonly path: ContainerPath;
}>;

export type CalendarYearContainerNode = Readonly<{
  readonly kind: "CalendarYear";
  readonly path: ContainerPath;
  readonly year: CalendarYear;
}>;

export type CalendarMonthContainerNode = Readonly<{
  readonly kind: "CalendarMonth";
  readonly path: ContainerPath;
  readonly year: CalendarYear;
  readonly month: CalendarMonth;
}>;

export type CalendarDayContainerNode = Readonly<{
  readonly kind: "CalendarDay";
  readonly path: ContainerPath;
  readonly year: CalendarYear;
  readonly month: CalendarMonth;
  readonly day: CalendarDay;
}>;

export type ItemRootContainerNode = Readonly<{
  readonly kind: "ItemRoot";
  readonly path: ContainerPath;
  readonly ownerId: NodeId;
}>;

export type ItemNumberingContainerNode = Readonly<{
  readonly kind: "ItemNumbering";
  readonly path: ContainerPath;
  readonly ownerId: NodeId;
  readonly indexes: ReadonlyArray<ContainerIndex>;
}>;

export type ContainerNode =
  | WorkspaceRootContainerNode
  | CalendarYearContainerNode
  | CalendarMonthContainerNode
  | CalendarDayContainerNode
  | ItemRootContainerNode
  | ItemNumberingContainerNode;

export type ContainerNodeValidationError = ValidationError<typeof CONTAINER_NODE_KIND>;

const NUMBERING_SEGMENT_REGEX = /^\d{4}$/;
const MONTH_SEGMENT_REGEX = /^\d{2}$/;
const DAY_SEGMENT_REGEX = /^\d{2}$/;

const createError = (
  issues: ReadonlyArray<ValidationIssue>,
): ContainerNodeValidationError => createValidationError(CONTAINER_NODE_KIND, issues);

const instantiateWorkspaceRoot = (
  path: ContainerPath,
): WorkspaceRootContainerNode =>
  Object.freeze({
    kind: "WorkspaceRoot" as const,
    path,
  });

const instantiateCalendarYear = (
  path: ContainerPath,
  year: CalendarYear,
): CalendarYearContainerNode =>
  Object.freeze({
    kind: "CalendarYear" as const,
    path,
    year,
  });

const instantiateCalendarMonth = (
  path: ContainerPath,
  year: CalendarYear,
  month: CalendarMonth,
): CalendarMonthContainerNode =>
  Object.freeze({
    kind: "CalendarMonth" as const,
    path,
    year,
    month,
  });

const instantiateCalendarDay = (
  path: ContainerPath,
  year: CalendarYear,
  month: CalendarMonth,
  day: CalendarDay,
): CalendarDayContainerNode =>
  Object.freeze({
    kind: "CalendarDay" as const,
    path,
    year,
    month,
    day,
  });

const instantiateItemRoot = (
  path: ContainerPath,
  ownerId: NodeId,
): ItemRootContainerNode =>
  Object.freeze({
    kind: "ItemRoot" as const,
    path,
    ownerId,
  });

const instantiateItemNumbering = (
  path: ContainerPath,
  ownerId: NodeId,
  indexes: ReadonlyArray<ContainerIndex>,
): ItemNumberingContainerNode =>
  Object.freeze({
    kind: "ItemNumbering" as const,
    path,
    ownerId,
    indexes: Object.freeze([...indexes]),
  });

const prefixIssuesWithSegment = (
  segmentIndex: number,
  error:
    | CalendarYearValidationError
    | CalendarDayValidationError
    | ContainerIndexValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: ["segments", segmentIndex, ...issue.path],
    })
  );

const mapCalendarMonthError = (
  error: CalendarMonthValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) => {
    if (issue.path.length > 0) {
      const [head, ...rest] = issue.path;
      if (head === "year") {
        return createValidationIssue(issue.message, {
          code: issue.code,
          path: ["segments", 0, ...rest],
        });
      }
      if (head === "month") {
        return createValidationIssue(issue.message, {
          code: issue.code,
          path: ["segments", 1, ...rest],
        });
      }
    }
    return createValidationIssue(issue.message, {
      code: issue.code,
      path: ["segments", 1, ...issue.path],
    });
  });

const mapContainerPathError = (
  error: ContainerPathValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: issue.path.length > 0 ? ["segments", ...issue.path] : ["segments"],
    })
  );

const parseCalendarYearNode = (
  path: ContainerPath,
  yearSegment: string,
): Result<CalendarYearContainerNode, ContainerNodeValidationError> => {
  const yearResult = parseCalendarYear(yearSegment);
  if (yearResult.type === "error") {
    return Result.error(createError(prefixIssuesWithSegment(0, yearResult.error)));
  }
  return Result.ok(instantiateCalendarYear(path, yearResult.value));
};

const parseCalendarMonthNode = (
  path: ContainerPath,
  segments: ReadonlyArray<string>,
): Result<CalendarMonthContainerNode, ContainerNodeValidationError> => {
  const yearResult = parseCalendarYear(segments[0]);
  if (yearResult.type === "error") {
    return Result.error(createError(prefixIssuesWithSegment(0, yearResult.error)));
  }

  const monthSegment = segments[1];
  if (!MONTH_SEGMENT_REGEX.test(monthSegment)) {
    return Result.error(
      createError([
        createValidationIssue(
          "month segment must be a zero-padded 2-digit integer",
          {
            path: ["segments", 1],
            code: "format",
          },
        ),
      ]),
    );
  }

  const monthNumber = Number.parseInt(monthSegment, 10);
  const monthResult = calendarMonthFromComponents(yearResult.value, monthNumber);
  if (monthResult.type === "error") {
    return Result.error(createError(mapCalendarMonthError(monthResult.error)));
  }

  return Result.ok(
    instantiateCalendarMonth(path, yearResult.value, monthResult.value),
  );
};

const parseCalendarDayNode = (
  path: ContainerPath,
  segments: ReadonlyArray<string>,
): Result<CalendarDayContainerNode, ContainerNodeValidationError> => {
  const yearResult = parseCalendarYear(segments[0]);
  if (yearResult.type === "error") {
    return Result.error(createError(prefixIssuesWithSegment(0, yearResult.error)));
  }

  const monthSegment = segments[1];
  if (!MONTH_SEGMENT_REGEX.test(monthSegment)) {
    return Result.error(
      createError([
        createValidationIssue(
          "month segment must be a zero-padded 2-digit integer",
          {
            path: ["segments", 1],
            code: "format",
          },
        ),
      ]),
    );
  }

  const monthNumber = Number.parseInt(monthSegment, 10);
  const monthResult = calendarMonthFromComponents(yearResult.value, monthNumber);
  if (monthResult.type === "error") {
    return Result.error(createError(mapCalendarMonthError(monthResult.error)));
  }

  const daySegment = segments[2];
  if (!DAY_SEGMENT_REGEX.test(daySegment)) {
    return Result.error(
      createError([
        createValidationIssue(
          "day segment must be a zero-padded 2-digit integer",
          {
            path: ["segments", 2],
            code: "format",
          },
        ),
      ]),
    );
  }

  const dayNumber = Number.parseInt(daySegment, 10);
  const dayResult = calendarDayFromComponents(
    yearResult.value.value(),
    monthResult.value.month(),
    dayNumber,
  );
  if (dayResult.type === "error") {
    return Result.error(createError(prefixIssuesWithSegment(2, dayResult.error)));
  }

  return Result.ok(
    instantiateCalendarDay(
      path,
      yearResult.value,
      monthResult.value,
      dayResult.value,
    ),
  );
};

const parseItemNumberingNode = (
  path: ContainerPath,
  segments: ReadonlyArray<string>,
  ownerId: NodeId,
): Result<ItemNumberingContainerNode, ContainerNodeValidationError> => {
  const issues: ValidationIssue[] = [];
  const indexes: ContainerIndex[] = [];

  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!NUMBERING_SEGMENT_REGEX.test(segment)) {
      issues.push(
        createValidationIssue(
          "numbering segment must be a zero-padded 4-digit integer",
          {
            path: ["segments", i],
            code: "format",
          },
        ),
      );
      continue;
    }

    const numeric = Number.parseInt(segment, 10);
    const indexResult = parseContainerIndex(numeric);
    if (indexResult.type === "error") {
      issues.push(...prefixIssuesWithSegment(i, indexResult.error));
      continue;
    }

    indexes.push(indexResult.value);
  }

  if (issues.length > 0) {
    return Result.error(createError(issues));
  }

  return Result.ok(instantiateItemNumbering(path, ownerId, indexes));
};

const fromPath = (
  path: ContainerPath,
): Result<ContainerNode, ContainerNodeValidationError> => {
  const segments = path.segments();

  if (segments.length === 0) {
    return Result.ok(instantiateWorkspaceRoot(path));
  }

  const nodeIdResult = parseNodeId(segments[0]);
  if (nodeIdResult.type === "ok") {
    if (segments.length === 1) {
      return Result.ok(instantiateItemRoot(path, nodeIdResult.value));
    }
    return parseItemNumberingNode(path, segments, nodeIdResult.value);
  }

  if (segments.length === 1) {
    return parseCalendarYearNode(path, segments[0]);
  }
  if (segments.length === 2) {
    return parseCalendarMonthNode(path, segments);
  }
  if (segments.length === 3) {
    return parseCalendarDayNode(path, segments);
  }

  return Result.error(
    createError([
      createValidationIssue(
        "unsupported container path structure",
        {
          path: ["segments"],
          code: "unknown_variant",
        },
      ),
    ]),
  );
};

export const parseContainerNode = (
  input: string | ContainerPath,
): Result<ContainerNode, ContainerNodeValidationError> => {
  let pathResult: Result<ContainerPath, ContainerPathValidationError>;

  if (isContainerPath(input)) {
    pathResult = Result.ok(input);
  } else if (typeof input === "string") {
    pathResult = parseContainerPath(input);
  } else {
    return Result.error(
      createError([
        createValidationIssue("container must be a string or ContainerPath", {
          path: ["value"],
          code: "type",
        }),
      ]),
    );
  }

  if (pathResult.type === "error") {
    return Result.error(createError(mapContainerPathError(pathResult.error)));
  }

  return fromPath(pathResult.value);
};

export const containerNodeFromPath = (
  path: ContainerPath,
): Result<ContainerNode, ContainerNodeValidationError> => fromPath(path);
