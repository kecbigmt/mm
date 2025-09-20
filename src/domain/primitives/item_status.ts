import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const ITEM_STATUS_KIND = "ItemStatus" as const;
const ITEM_STATUS_BRAND: unique symbol = Symbol(ITEM_STATUS_KIND);

export type ItemStatusValue = "open" | "closed";

export type ItemStatus = Readonly<{
  readonly data: Readonly<{
    readonly value: ItemStatusValue;
  }>;
  toString(): ItemStatusValue;
  toJSON(): ItemStatusValue;
  isOpen(): boolean;
  isClosed(): boolean;
  readonly [ITEM_STATUS_BRAND]: true;
}>;

const toString = function (this: ItemStatus): ItemStatusValue {
  return this.data.value;
};

const toJSON = function (this: ItemStatus): ItemStatusValue {
  return this.toString();
};

const isOpen = function (this: ItemStatus): boolean {
  return this.data.value === "open";
};

const isClosed = function (this: ItemStatus): boolean {
  return this.data.value === "closed";
};

const instantiate = (value: ItemStatusValue): ItemStatus =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    toJSON,
    isOpen,
    isClosed,
    [ITEM_STATUS_BRAND]: true,
  });

export type ItemStatusValidationError = ValidationError<typeof ITEM_STATUS_KIND>;

export const isItemStatus = (value: unknown): value is ItemStatus =>
  typeof value === "object" && value !== null && ITEM_STATUS_BRAND in value;

const ITEM_STATUS_VALUES: ReadonlyArray<ItemStatusValue> = ["open", "closed"];

export const parseItemStatus = (
  input: unknown,
): Result<ItemStatus, ItemStatusValidationError> => {
  if (isItemStatus(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ITEM_STATUS_KIND, [
        createValidationIssue("status must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const normalized = input.trim().toLowerCase();
  if (!ITEM_STATUS_VALUES.includes(normalized as ItemStatusValue)) {
    return Result.error(
      createValidationError(ITEM_STATUS_KIND, [
        createValidationIssue("status must be 'open' or 'closed'", {
          path: ["value"],
          code: "invalid_value",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(normalized as ItemStatusValue));
};

export const createItemStatus = (
  value: ItemStatusValue,
): ItemStatus => instantiate(value);

export const itemStatusOpen = (): ItemStatus => instantiate("open");
export const itemStatusClosed = (): ItemStatus => instantiate("closed");
