import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const ITEM_ICON_KIND = "ItemIcon" as const;
const ITEM_ICON_BRAND: unique symbol = Symbol(ITEM_ICON_KIND);

export type ItemIconValue = "note" | "task" | "event";

export type ItemIcon = Readonly<{
  readonly data: Readonly<{
    readonly value: ItemIconValue;
  }>;
  toString(): ItemIconValue;
  toJSON(): ItemIconValue;
  equals(other: ItemIcon): boolean;
  readonly [ITEM_ICON_BRAND]: true;
}>;

const toString = function (this: ItemIcon): ItemIconValue {
  return this.data.value;
};

const toJSON = function (this: ItemIcon): ItemIconValue {
  return this.toString();
};

const equals = function (this: ItemIcon, other: ItemIcon): boolean {
  return this.data.value === other.data.value;
};

const instantiate = (value: ItemIconValue): ItemIcon =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    toJSON,
    equals,
    [ITEM_ICON_BRAND]: true,
  });

export type ItemIconValidationError = ValidationError<typeof ITEM_ICON_KIND>;

export const isItemIcon = (value: unknown): value is ItemIcon =>
  typeof value === "object" && value !== null && ITEM_ICON_BRAND in value;

const ITEM_ICON_VALUES: ReadonlyArray<ItemIconValue> = ["note", "task", "event"];

export const parseItemIcon = (
  input: unknown,
): Result<ItemIcon, ItemIconValidationError> => {
  if (isItemIcon(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(ITEM_ICON_KIND, [
        createValidationIssue("icon must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const normalized = input.trim().toLowerCase();
  if (!ITEM_ICON_VALUES.includes(normalized as ItemIconValue)) {
    return Result.error(
      createValidationError(ITEM_ICON_KIND, [
        createValidationIssue("icon must be 'note', 'task', or 'event'", {
          path: ["value"],
          code: "invalid_value",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(normalized as ItemIconValue));
};

export const createItemIcon = (value: ItemIconValue): ItemIcon => instantiate(value);
