import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ITEM_TITLE_KIND = "ItemTitle" as const;
const itemTitleFactory = createStringPrimitiveFactory({
  kind: ITEM_TITLE_KIND,
  equals: (value, other) => value.localeCompare(other) === 0,
});

export type ItemTitle = StringPrimitive<
  typeof itemTitleFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): ItemTitle => itemTitleFactory.instantiate(value);

export type ItemTitleValidationError = ValidationError<typeof ITEM_TITLE_KIND>;

export const isItemTitle = (value: unknown): value is ItemTitle => itemTitleFactory.is(value);

const MAX_LENGTH = 200;

export const parseItemTitle = (
  input: unknown,
): Result<ItemTitle, ItemTitleValidationError> => {
  if (isItemTitle(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ITEM_TITLE_KIND, [
        createValidationIssue("title must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return Result.error(
      createValidationError(ITEM_TITLE_KIND, [
        createValidationIssue("title cannot be empty", {
          path: ["value"],
          code: "empty",
        }),
      ]),
    );
  }

  if (trimmed.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(ITEM_TITLE_KIND, [
        createValidationIssue("title is too long", {
          path: ["value"],
          code: "max_length",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(trimmed));
};

export const itemTitleFromString = (
  input: string,
): Result<ItemTitle, ItemTitleValidationError> => parseItemTitle(input);
