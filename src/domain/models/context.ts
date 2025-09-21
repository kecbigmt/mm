import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  ContextTag,
  ContextTagValidationError,
  DateTime,
  DateTimeValidationError,
  parseContextTag,
  parseDateTime,
} from "../primitives/mod.ts";

const CONTEXT_KIND = "Context" as const;

export type ContextData = Readonly<{
  readonly tag: ContextTag;
  readonly createdAt: DateTime;
  readonly description?: string;
}>;

export type Context = Readonly<{
  readonly kind: typeof CONTEXT_KIND;
  readonly data: ContextData;
  toJSON(): ContextSnapshot;
}>;

export type ContextSnapshot = Readonly<{
  readonly tag: string;
  readonly createdAt: string;
  readonly description?: string;
}>;

export type ContextValidationError = ValidationError<typeof CONTEXT_KIND>;

const instantiate = (data: ContextData): Context => {
  const normalizedDescription = typeof data.description === "string"
    ? data.description.trim() || undefined
    : undefined;
  const frozen = Object.freeze({ ...data, description: normalizedDescription });
  return Object.freeze({
    kind: CONTEXT_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({
        tag: frozen.tag.toString(),
        createdAt: frozen.createdAt.toString(),
        description: frozen.description,
      });
    },
  });
};

const prefixIssues = (
  field: string,
  error: ContextTagValidationError | DateTimeValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createContext = (data: ContextData): Context => instantiate(data);

export const parseContext = (
  snapshot: ContextSnapshot,
): Result<Context, ContextValidationError> => {
  const issues: ValidationIssue[] = [];

  const tagResult = parseContextTag(snapshot.tag);
  const createdAtResult = parseDateTime(snapshot.createdAt);

  if (tagResult.type === "error") {
    issues.push(...prefixIssues("tag", tagResult.error));
  }
  if (createdAtResult.type === "error") {
    issues.push(...prefixIssues("createdAt", createdAtResult.error));
  }

  if (snapshot.description !== undefined && typeof snapshot.description !== "string") {
    issues.push(
      createValidationIssue("description must be a string", {
        path: ["description"],
        code: "type",
      }),
    );
  }

  if (
    tagResult.type === "error" ||
    createdAtResult.type === "error" ||
    issues.length > 0
  ) {
    return Result.error(createValidationError(CONTEXT_KIND, issues));
  }

  return Result.ok(
    instantiate({
      tag: tagResult.value,
      createdAt: createdAtResult.value,
      description: snapshot.description,
    }),
  );
};
