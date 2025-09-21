import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  AliasSlug,
  AliasSlugValidationError,
  DateTime,
  DateTimeValidationError,
  ItemId,
  ItemIdValidationError,
  parseAliasSlug,
  parseDateTime,
  parseItemId,
} from "../primitives/mod.ts";

const ALIAS_KIND = "Alias" as const;

export type AliasData = Readonly<{
  readonly slug: AliasSlug;
  readonly itemId: ItemId;
  readonly createdAt: DateTime;
}>;

export type Alias = Readonly<{
  readonly kind: typeof ALIAS_KIND;
  readonly data: AliasData;
  toJSON(): AliasSnapshot;
}>;

export type AliasSnapshot = Readonly<{
  readonly slug: string;
  readonly itemId: string;
  readonly createdAt: string;
}>;

export type AliasValidationError = ValidationError<typeof ALIAS_KIND>;

const instantiate = (data: AliasData): Alias => {
  const frozen = Object.freeze({ ...data });
  return Object.freeze({
    kind: ALIAS_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({
        slug: frozen.slug.toString(),
        itemId: frozen.itemId.toString(),
        createdAt: frozen.createdAt.toString(),
      });
    },
  });
};

const prefixIssues = (
  field: string,
  error: AliasSlugValidationError | ItemIdValidationError | DateTimeValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createAlias = (data: AliasData): Alias => instantiate(data);

export const parseAlias = (snapshot: AliasSnapshot): Result<Alias, AliasValidationError> => {
  const issues: ValidationIssue[] = [];

  const slugResult = parseAliasSlug(snapshot.slug);
  const itemIdResult = parseItemId(snapshot.itemId);
  const createdAtResult = parseDateTime(snapshot.createdAt);

  if (slugResult.type === "error") {
    issues.push(...prefixIssues("slug", slugResult.error));
  }
  if (itemIdResult.type === "error") {
    issues.push(...prefixIssues("itemId", itemIdResult.error));
  }
  if (createdAtResult.type === "error") {
    issues.push(...prefixIssues("createdAt", createdAtResult.error));
  }

  if (
    slugResult.type === "error" ||
    itemIdResult.type === "error" ||
    createdAtResult.type === "error" ||
    issues.length > 0
  ) {
    return Result.error(createValidationError(ALIAS_KIND, issues));
  }

  return Result.ok(
    instantiate({
      slug: slugResult.value,
      itemId: itemIdResult.value,
      createdAt: createdAtResult.value,
    }),
  );
};
