import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const ITEM_ID_KIND = "ItemId" as const;
const ITEM_ID_BRAND: unique symbol = Symbol(ITEM_ID_KIND);
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ItemId = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  equals(other: ItemId): boolean;
  toJSON(): string;
  readonly [ITEM_ID_BRAND]: true;
}>;

const toString = function (this: ItemId): string {
  return this.data.value;
};

const equals = function (this: ItemId, other: ItemId): boolean {
  return this.data.value === other.data.value;
};

const toJSON = function (this: ItemId): string {
  return this.toString();
};

const instantiate = (value: string): ItemId =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    equals,
    toJSON,
    [ITEM_ID_BRAND]: true,
  });

export type ItemIdValidationError = ValidationError<typeof ITEM_ID_KIND>;

export const isItemId = (value: unknown): value is ItemId =>
  typeof value === "object" && value !== null && ITEM_ID_BRAND in value;

export const parseItemId = (
  input: unknown,
): Result<ItemId, ItemIdValidationError> => {
  if (isItemId(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ITEM_ID_KIND, [
        createValidationIssue("id must be a string", { path: ["value"] }),
      ]),
    );
  }

  const candidate = input.trim().toLowerCase();
  if (!UUID_V7_REGEX.test(candidate)) {
    return Result.error(
      createValidationError(ITEM_ID_KIND, [
        createValidationIssue("value must be a UUID v7", { path: ["value"] }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate));
};

export const itemIdFromString = (
  input: string,
): Result<ItemId, ItemIdValidationError> => parseItemId(input);
