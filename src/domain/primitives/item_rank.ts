import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ITEM_RANK_KIND = "ItemRank" as const;

const itemRankFactory = createStringPrimitiveFactory({
  kind: ITEM_RANK_KIND,
  includeEquals: false,
  includeCompare: true,
  compare: (value, other) => (value === other ? 0 : value < other ? -1 : 1),
});

export type ItemRank = StringPrimitive<
  typeof itemRankFactory.brand,
  string,
  string,
  false,
  true
>;

const ORDER_KEY_REGEX = /^[0-9A-Za-z:|]+$/;
const MIN_LENGTH = 1;
const MAX_LENGTH = 30;

const instantiate = (value: string): ItemRank => itemRankFactory.instantiate(value);

export type ItemRankValidationError = ValidationError<typeof ITEM_RANK_KIND>;

export const isItemRank = (value: unknown): value is ItemRank => itemRankFactory.is(value);

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
