import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ALIAS_SLUG_KIND = "AliasSlug" as const;
const aliasSlugFactory = createStringPrimitiveFactory({
  kind: ALIAS_SLUG_KIND,
});

export type AliasSlug = StringPrimitive<
  typeof aliasSlugFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): AliasSlug => aliasSlugFactory.instantiate(value);

export type AliasSlugValidationError = ValidationError<typeof ALIAS_SLUG_KIND>;

export const isAliasSlug = (value: unknown): value is AliasSlug => aliasSlugFactory.is(value);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 64;

export const parseAliasSlug = (
  input: unknown,
): Result<AliasSlug, AliasSlugValidationError> => {
  if (isAliasSlug(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ALIAS_SLUG_KIND, [
        createValidationIssue("alias must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const candidate = input.trim().toLowerCase();
  if (candidate.length < MIN_LENGTH) {
    return Result.error(
      createValidationError(ALIAS_SLUG_KIND, [
        createValidationIssue("alias is too short", {
          path: ["value"],
          code: "min_length",
        }),
      ]),
    );
  }

  if (candidate.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(ALIAS_SLUG_KIND, [
        createValidationIssue("alias is too long", {
          path: ["value"],
          code: "max_length",
        }),
      ]),
    );
  }

  if (!SLUG_REGEX.test(candidate)) {
    return Result.error(
      createValidationError(ALIAS_SLUG_KIND, [
        createValidationIssue("alias must use lowercase letters, numbers, and hyphen", {
          path: ["value"],
          code: "format",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate));
};

export const aliasSlugFromString = (
  input: string,
): Result<AliasSlug, AliasSlugValidationError> => parseAliasSlug(input);
