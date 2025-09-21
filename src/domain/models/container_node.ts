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
  NodeId,
  parseCalendarYear,
  parseContainerIndex,
  parseContainerPath,
  parseNodeId,
} from "../primitives/mod.ts";
import { Edge, EdgeSnapshot, parseEdge } from "./edge.ts";

const CONTAINER_NODE_KIND = "ContainerNode" as const;

export type WorkspaceRootContainerNode = Readonly<{
  readonly kind: "WorkspaceRoot";
  readonly path: ContainerPath;
  readonly edges: ReadonlyArray<Edge>;
}>;

export type CalendarYearContainerNode = Readonly<{
  readonly kind: "CalendarYear";
  readonly path: ContainerPath;
  readonly year: CalendarYear;
  readonly edges: ReadonlyArray<Edge>;
}>;

export type CalendarMonthContainerNode = Readonly<{
  readonly kind: "CalendarMonth";
  readonly path: ContainerPath;
  readonly year: CalendarYear;
  readonly month: CalendarMonth;
  readonly edges: ReadonlyArray<Edge>;
}>;

export type CalendarDayContainerNode = Readonly<{
  readonly kind: "CalendarDay";
  readonly path: ContainerPath;
  readonly year: CalendarYear;
  readonly month: CalendarMonth;
  readonly day: CalendarDay;
  readonly edges: ReadonlyArray<Edge>;
}>;

export type ItemRootContainerNode = Readonly<{
  readonly kind: "ItemRoot";
  readonly path: ContainerPath;
  readonly ownerId: NodeId;
  readonly edges: ReadonlyArray<Edge>;
}>;

export type ItemNumberingContainerNode = Readonly<{
  readonly kind: "ItemNumbering";
  readonly path: ContainerPath;
  readonly ownerId: NodeId;
  readonly indexes: ReadonlyArray<ContainerIndex>;
  readonly edges: ReadonlyArray<Edge>;
}>;

export type ContainerNode =
  | WorkspaceRootContainerNode
  | CalendarYearContainerNode
  | CalendarMonthContainerNode
  | CalendarDayContainerNode
  | ItemRootContainerNode
  | ItemNumberingContainerNode;

export type ContainerNodeSnapshot = Readonly<{
  readonly path: string;
  readonly edges: ReadonlyArray<EdgeSnapshot>;
}>;

export type ContainerNodeValidationError = ValidationError<typeof CONTAINER_NODE_KIND>;

const NUMBERING_SEGMENT_REGEX = /^\d{4}$/;
const MONTH_SEGMENT_REGEX = /^\d{2}$/;
const DAY_SEGMENT_REGEX = /^\d{2}$/;

const createError = (
  issues: ReadonlyArray<ValidationIssue>,
): ContainerNodeValidationError => createValidationError(CONTAINER_NODE_KIND, issues);

const freezeEdges = (edges: ReadonlyArray<Edge>): ReadonlyArray<Edge> => Object.freeze([...edges]);

const instantiateWorkspaceRoot = (
  path: ContainerPath,
  edges: ReadonlyArray<Edge>,
): WorkspaceRootContainerNode =>
  Object.freeze({
    kind: "WorkspaceRoot" as const,
    path,
    edges: freezeEdges(edges),
  });

const instantiateCalendarYear = (
  path: ContainerPath,
  year: CalendarYear,
  edges: ReadonlyArray<Edge>,
): CalendarYearContainerNode =>
  Object.freeze({
    kind: "CalendarYear" as const,
    path,
    year,
    edges: freezeEdges(edges),
  });

const instantiateCalendarMonth = (
  path: ContainerPath,
  year: CalendarYear,
  month: CalendarMonth,
  edges: ReadonlyArray<Edge>,
): CalendarMonthContainerNode =>
  Object.freeze({
    kind: "CalendarMonth" as const,
    path,
    year,
    month,
    edges: freezeEdges(edges),
  });

const instantiateCalendarDay = (
  path: ContainerPath,
  year: CalendarYear,
  month: CalendarMonth,
  day: CalendarDay,
  edges: ReadonlyArray<Edge>,
): CalendarDayContainerNode =>
  Object.freeze({
    kind: "CalendarDay" as const,
    path,
    year,
    month,
    day,
    edges: freezeEdges(edges),
  });

const instantiateItemRoot = (
  path: ContainerPath,
  ownerId: NodeId,
  edges: ReadonlyArray<Edge>,
): ItemRootContainerNode =>
  Object.freeze({
    kind: "ItemRoot" as const,
    path,
    ownerId,
    edges: freezeEdges(edges),
  });

const instantiateItemNumbering = (
  path: ContainerPath,
  ownerId: NodeId,
  indexes: ReadonlyArray<ContainerIndex>,
  edges: ReadonlyArray<Edge>,
): ItemNumberingContainerNode =>
  Object.freeze({
    kind: "ItemNumbering" as const,
    path,
    ownerId,
    indexes: Object.freeze([...indexes]),
    edges: freezeEdges(edges),
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

const parseEdges = (
  snapshots: ReadonlyArray<EdgeSnapshot>,
): Result<ReadonlyArray<Edge>, ContainerNodeValidationError> => {
  if (snapshots.length === 0) {
    return Result.ok<ReadonlyArray<Edge>>([]);
  }

  const edges: Edge[] = [];
  const issues: ValidationIssue[] = [];

  for (const [index, snapshot] of snapshots.entries()) {
    const result = parseEdge(snapshot);
    if (result.type === "error") {
      issues.push(
        ...result.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["edges", index, ...issue.path],
          })
        ),
      );
      continue;
    }
    edges.push(result.value);
  }

  if (issues.length > 0) {
    return Result.error(createError(issues));
  }

  return Result.ok<ReadonlyArray<Edge>>(edges);
};

const parseCalendarYearNode = (
  path: ContainerPath,
  yearSegment: string,
  edges: ReadonlyArray<Edge>,
): Result<CalendarYearContainerNode, ContainerNodeValidationError> => {
  const yearResult = parseCalendarYear(yearSegment);
  if (yearResult.type === "error") {
    return Result.error(createError(prefixIssuesWithSegment(0, yearResult.error)));
  }
  return Result.ok(instantiateCalendarYear(path, yearResult.value, edges));
};

const parseCalendarMonthNode = (
  path: ContainerPath,
  segments: ReadonlyArray<string>,
  edges: ReadonlyArray<Edge>,
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
    instantiateCalendarMonth(path, yearResult.value, monthResult.value, edges),
  );
};

const parseCalendarDayNode = (
  path: ContainerPath,
  segments: ReadonlyArray<string>,
  edges: ReadonlyArray<Edge>,
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
      edges,
    ),
  );
};

const parseItemNumberingNode = (
  path: ContainerPath,
  segments: ReadonlyArray<string>,
  ownerId: NodeId,
  edges: ReadonlyArray<Edge>,
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

  return Result.ok(instantiateItemNumbering(path, ownerId, indexes, edges));
};

const fromPath = (
  path: ContainerPath,
  edges: ReadonlyArray<Edge>,
): Result<ContainerNode, ContainerNodeValidationError> => {
  const segments = path.segments();

  if (segments.length === 0) {
    return Result.ok(instantiateWorkspaceRoot(path, edges));
  }

  const nodeIdResult = parseNodeId(segments[0]);
  if (nodeIdResult.type === "ok") {
    if (segments.length === 1) {
      return Result.ok(instantiateItemRoot(path, nodeIdResult.value, edges));
    }
    return parseItemNumberingNode(path, segments, nodeIdResult.value, edges);
  }

  if (segments.length === 1) {
    return parseCalendarYearNode(path, segments[0], edges);
  }
  if (segments.length === 2) {
    return parseCalendarMonthNode(path, segments, edges);
  }
  if (segments.length === 3) {
    return parseCalendarDayNode(path, segments, edges);
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
  snapshot: ContainerNodeSnapshot,
): Result<ContainerNode, ContainerNodeValidationError> => {
  const pathResult = parseContainerPath(snapshot.path);
  if (pathResult.type === "error") {
    return Result.error(createError(mapContainerPathError(pathResult.error)));
  }

  const edgesResult = parseEdges(snapshot.edges);
  if (edgesResult.type === "error") {
    return edgesResult;
  }

  return fromPath(pathResult.value, edgesResult.value);
};
