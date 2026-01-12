import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ITEM_STATUS_KIND = "ItemStatus" as const;

export type ItemStatusValue = "open" | "closed" | "snoozing";

const itemStatusFactory = createStringPrimitiveFactory<
  typeof ITEM_STATUS_KIND,
  ItemStatusValue,
  ItemStatusValue
>({
  kind: ITEM_STATUS_KIND,
});

export type ItemStatus = StringPrimitive<
  typeof itemStatusFactory.brand,
  ItemStatusValue,
  ItemStatusValue,
  true,
  false,
  {
    isOpen(): boolean;
    isClosed(): boolean;
    isSnoozing(): boolean;
  }
>;

const isOpen = function (this: ItemStatus): boolean {
  return this.data.value === "open";
};

const isClosed = function (this: ItemStatus): boolean {
  return this.data.value === "closed";
};

const isSnoozing = function (this: ItemStatus): boolean {
  return this.data.value === "snoozing";
};

const instantiate = (value: ItemStatusValue): ItemStatus =>
  itemStatusFactory.instantiate(value, { isOpen, isClosed, isSnoozing });

export type ItemStatusValidationError = ValidationError<typeof ITEM_STATUS_KIND>;

export const isItemStatus = (value: unknown): value is ItemStatus =>
  itemStatusFactory.is<{ isOpen(): boolean; isClosed(): boolean; isSnoozing(): boolean }>(value);

const ITEM_STATUS_VALUES: ReadonlyArray<ItemStatusValue> = ["open", "closed", "snoozing"];

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
        createValidationIssue("status must be 'open', 'closed', or 'snoozing'", {
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
export const itemStatusSnoozing = (): ItemStatus => instantiate("snoozing");
