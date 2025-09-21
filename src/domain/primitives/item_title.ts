import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const ITEM_TITLE_KIND = "ItemTitle" as const;
const ITEM_TITLE_BRAND: unique symbol = Symbol(ITEM_TITLE_KIND);

export type ItemTitle = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  equals(other: ItemTitle): boolean;
  toJSON(): string;
  readonly [ITEM_TITLE_BRAND]: true;
}>;

const toString = function (this: ItemTitle): string {
  return this.data.value;
};

const equals = function (this: ItemTitle, other: ItemTitle): boolean {
  return this.data.value.localeCompare(other.data.value) === 0;
};

const toJSON = function (this: ItemTitle): string {
  return this.toString();
};

const instantiate = (value: string): ItemTitle =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    equals,
    toJSON,
    [ITEM_TITLE_BRAND]: true,
  });

export type ItemTitleValidationError = ValidationError<typeof ITEM_TITLE_KIND>;

export const isItemTitle = (value: unknown): value is ItemTitle =>
  typeof value === "object" && value !== null && ITEM_TITLE_BRAND in value;

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
