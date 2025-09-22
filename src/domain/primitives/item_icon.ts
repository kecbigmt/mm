import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ITEM_ICON_KIND = "ItemIcon" as const;

export type ItemIconValue = "note" | "task" | "event";

const itemIconFactory = createStringPrimitiveFactory<
  typeof ITEM_ICON_KIND,
  ItemIconValue,
  ItemIconValue
>({
  kind: ITEM_ICON_KIND,
});

export type ItemIcon = StringPrimitive<
  typeof itemIconFactory.brand,
  ItemIconValue,
  ItemIconValue,
  true,
  false
>;

const instantiate = (value: ItemIconValue): ItemIcon => itemIconFactory.instantiate(value);

export type ItemIconValidationError = ValidationError<typeof ITEM_ICON_KIND>;

export const isItemIcon = (value: unknown): value is ItemIcon => itemIconFactory.is(value);

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
