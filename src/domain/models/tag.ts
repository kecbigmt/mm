import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  DateTime,
  DateTimeValidationError,
  parseDateTime,
  parseTagSlug,
  TagSlug,
  TagSlugValidationError,
} from "../primitives/mod.ts";

const TAG_KIND = "Tag" as const;

export type TagData = Readonly<{
  readonly alias: TagSlug;
  readonly createdAt: DateTime;
  readonly description?: string;
}>;

export type Tag = Readonly<{
  readonly kind: typeof TAG_KIND;
  readonly data: TagData;
  toJSON(): TagSnapshot;
}>;

export type TagSnapshot = Readonly<{
  readonly rawAlias: string;
  readonly canonicalAlias: string;
  readonly createdAt: string;
  readonly description?: string;
}>;

export type TagValidationError = ValidationError<typeof TAG_KIND>;

const instantiate = (data: TagData): Tag => {
  const normalizedDescription = typeof data.description === "string"
    ? data.description.trim() || undefined
    : undefined;
  const frozen = Object.freeze({ ...data, description: normalizedDescription });
  return Object.freeze({
    kind: TAG_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({
        rawAlias: frozen.alias.raw,
        canonicalAlias: frozen.alias.canonicalKey.toString(),
        createdAt: frozen.createdAt.toString(),
        description: frozen.description,
      });
    },
  });
};

const prefixIssues = (
  field: string,
  error: TagSlugValidationError | DateTimeValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createTag = (data: TagData): Tag => instantiate(data);

export const parseTag = (
  snapshot: TagSnapshot,
): Result<Tag, TagValidationError> => {
  const issues: ValidationIssue[] = [];

  const aliasResult = parseTagSlug(snapshot.rawAlias);
  const createdAtResult = parseDateTime(snapshot.createdAt);

  if (typeof snapshot.canonicalAlias !== "string") {
    issues.push(
      createValidationIssue("canonicalAlias must be a string", {
        path: ["canonicalAlias"],
        code: "not_string",
      }),
    );
  }

  if (aliasResult.type === "ok" && typeof snapshot.canonicalAlias === "string") {
    const expected = aliasResult.value.canonicalKey.toString();
    if (expected !== snapshot.canonicalAlias) {
      issues.push(
        createValidationIssue("canonicalAlias does not match raw value", {
          path: ["canonicalAlias"],
          code: "mismatch",
        }),
      );
    }
  }

  if (aliasResult.type === "error") {
    issues.push(...prefixIssues("rawAlias", aliasResult.error));
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
    aliasResult.type === "error" ||
    createdAtResult.type === "error" ||
    issues.length > 0
  ) {
    return Result.error(createValidationError(TAG_KIND, issues));
  }

  return Result.ok(
    instantiate({
      alias: aliasResult.value,
      createdAt: createdAtResult.value,
      description: snapshot.description,
    }),
  );
};
