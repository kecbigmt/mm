import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const ITEM_RANK_KIND = "ItemRank" as const;
const ITEM_RANK_BRAND: unique symbol = Symbol(ITEM_RANK_KIND);

export type ItemRank = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  toJSON(): string;
  compare(other: ItemRank): number;
  readonly [ITEM_RANK_BRAND]: true;
}>;

const ORDER_KEY_REGEX = /^[0-9A-Za-z:|]+$/;
const MIN_LENGTH = 1;
const MAX_LENGTH = 30;

const toString = function (this: ItemRank): string {
  return this.data.value;
};

const toJSON = function (this: ItemRank): string {
  return this.toString();
};

const compare = function (this: ItemRank, other: ItemRank): number {
  if (this.data.value === other.data.value) {
    return 0;
  }
  return this.data.value < other.data.value ? -1 : 1;
};

const instantiate = (value: string): ItemRank =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    toJSON,
    compare,
    [ITEM_RANK_BRAND]: true,
  });

export type ItemRankValidationError = ValidationError<typeof ITEM_RANK_KIND>;

export const isItemRank = (value: unknown): value is ItemRank =>
  typeof value === "object" && value !== null && ITEM_RANK_BRAND in value;

export const parseItemRank = (
  input: unknown,
): Result<ItemRank, ItemRankValidationError> => {
  if (isItemRank(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ITEM_RANK_KIND, [
        createValidationIssue("rank must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  if (trimmed.length < MIN_LENGTH) {
    return Result.error(
      createValidationError(ITEM_RANK_KIND, [
        createValidationIssue("rank cannot be empty", {
          path: ["value"],
          code: "min_length",
        }),
      ]),
    );
  }

  if (trimmed.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(ITEM_RANK_KIND, [
        createValidationIssue("rank is too long", {
          path: ["value"],
          code: "max_length",
        }),
      ]),
    );
  }

  if (!ORDER_KEY_REGEX.test(trimmed)) {
    return Result.error(
      createValidationError(ITEM_RANK_KIND, [
        createValidationIssue("rank has invalid characters", {
          path: ["value"],
          code: "format",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(trimmed));
};

export const itemRankFromString = (
  input: string,
): Result<ItemRank, ItemRankValidationError> => parseItemRank(input);
