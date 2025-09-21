import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const ITEM_SHORT_ID_KIND = "ItemShortId" as const;
const ITEM_SHORT_ID_BRAND: unique symbol = Symbol(ITEM_SHORT_ID_KIND);

export type ItemShortId = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  equals(other: ItemShortId): boolean;
  toJSON(): string;
  readonly [ITEM_SHORT_ID_BRAND]: true;
}>;

const toString = function (this: ItemShortId): string {
  return this.data.value;
};

const equals = function (this: ItemShortId, other: ItemShortId): boolean {
  return this.data.value === other.data.value;
};

const toJSON = function (this: ItemShortId): string {
  return this.toString();
};

const instantiate = (value: string): ItemShortId =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    equals,
    toJSON,
    [ITEM_SHORT_ID_BRAND]: true,
  });

export type ItemShortIdValidationError = ValidationError<typeof ITEM_SHORT_ID_KIND>;

export const isItemShortId = (value: unknown): value is ItemShortId =>
  typeof value === "object" && value !== null && ITEM_SHORT_ID_BRAND in value;

export const parseItemShortId = (
  input: unknown,
): Result<ItemShortId, ItemShortIdValidationError> => {
  if (isItemShortId(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ITEM_SHORT_ID_KIND, [
        createValidationIssue("short id must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const candidate = input.trim().toLowerCase();
  if (candidate.length !== 7) {
    return Result.error(
      createValidationError(ITEM_SHORT_ID_KIND, [
        createValidationIssue("short id must be exactly 7 characters", {
          path: ["value"],
          code: "invalid_length",
        }),
      ]),
    );
  }

  // Validate hex characters
  if (!/^[0-9a-f]{7}$/i.test(candidate)) {
    return Result.error(
      createValidationError(ITEM_SHORT_ID_KIND, [
        createValidationIssue("short id must contain only hexadecimal characters", {
          path: ["value"],
          code: "invalid_format",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate));
};
