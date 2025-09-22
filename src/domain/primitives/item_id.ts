import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { ItemShortId, parseItemShortId } from "./item_short_id.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ITEM_ID_KIND = "ItemId" as const;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const itemIdFactory = createStringPrimitiveFactory({
  kind: ITEM_ID_KIND,
});

export type ItemId = StringPrimitive<
  typeof itemIdFactory.brand,
  string,
  string,
  true,
  false,
  { toShortId(): ItemShortId }
>;

const toShortId = function (this: ItemId): ItemShortId {
  const shortIdString = this.data.value.slice(-7);
  const result = parseItemShortId(shortIdString);
  if (result.type === "error") {
    throw new Error(`Failed to create short ID from valid ItemId: ${result.error.message}`);
  }
  return result.value;
};

const instantiate = (value: string): ItemId => itemIdFactory.instantiate(value, { toShortId });

export type ItemIdValidationError = ValidationError<typeof ITEM_ID_KIND>;

export const isItemId = (value: unknown): value is ItemId =>
  itemIdFactory.is<{ toShortId(): ItemShortId }>(value);

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
