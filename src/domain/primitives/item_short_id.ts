import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const ITEM_SHORT_ID_KIND = "ItemShortId" as const;
const itemShortIdFactory = createStringPrimitiveFactory({
  kind: ITEM_SHORT_ID_KIND,
});

export type ItemShortId = StringPrimitive<
  typeof itemShortIdFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): ItemShortId => itemShortIdFactory.instantiate(value);

export type ItemShortIdValidationError = ValidationError<typeof ITEM_SHORT_ID_KIND>;

export const isItemShortId = (value: unknown): value is ItemShortId => itemShortIdFactory.is(value);

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
