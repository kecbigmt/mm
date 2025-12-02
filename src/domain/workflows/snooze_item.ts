import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import type { Item } from "../models/item.ts";
import type { ItemRepository } from "../repositories/item_repository.ts";
import type { RepositoryError } from "../repositories/repository_error.ts";
import type { DateTime, ItemId, TimezoneIdentifier } from "../primitives/mod.ts";
import { createDurationFromHours } from "../primitives/duration.ts";
import { parsePlacement } from "../primitives/placement.ts";

export type SnoozeItemInput = Readonly<{
  itemId: ItemId;
  snoozeUntil: DateTime | undefined; // undefined = default 8h
  clear?: boolean;
  timezone: TimezoneIdentifier;
  occurredAt: DateTime;
}>;

export type SnoozeItemDependencies = Readonly<{
  itemRepository: ItemRepository;
}>;

export type SnoozeItemValidationError = ValidationError<"SnoozeItem">;

export type SnoozeItemError = SnoozeItemValidationError | RepositoryError;

export type SnoozeItemResult = Readonly<{
  item: Item;
}>;

/**
 * SnoozeItemWorkflow
 *
 * Snoozes an item until a future datetime.
 * - If clear flag is true, unsnoozes the item
 * - If snoozeUntil is undefined, defaults to 8h from occurredAt
 * - If snoozeUntil date is after the current placement date, moves item to that date
 */
const execute = async (
  input: SnoozeItemInput,
  dependencies: SnoozeItemDependencies,
): Promise<Result<SnoozeItemResult, SnoozeItemError>> => {
  const { itemId, snoozeUntil, clear, timezone, occurredAt } = input;
  const { itemRepository } = dependencies;

  // Load item
  const loadResult = await itemRepository.load(itemId);
  if (loadResult.type === "error") {
    return Result.error(loadResult.error);
  }
  const item = loadResult.value;
  if (!item) {
    return Result.error(
      createValidationError("SnoozeItem", [
        createValidationIssue("item not found", {
          code: "item_not_found",
          path: ["itemId"],
        }),
      ]),
    );
  }

  // Handle unsnooze case (--clear flag)
  if (clear === true) {
    const unsnoozedItem = item.snooze(undefined, occurredAt);
    const saveResult = await itemRepository.save(unsnoozedItem);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }
    return Result.ok({ item: unsnoozedItem });
  }

  // Determine snoozeUntil datetime
  let finalSnoozeUntil: DateTime;
  if (snoozeUntil === undefined) {
    // Default to 8h from occurredAt
    const defaultDurationResult = createDurationFromHours(8);
    if (defaultDurationResult.type === "error") {
      return Result.error(
        createValidationError("SnoozeItem", defaultDurationResult.error.issues),
      );
    }
    finalSnoozeUntil = occurredAt.addDuration(defaultDurationResult.value);
  } else {
    finalSnoozeUntil = snoozeUntil;
  }

  // Snooze the item
  let snoozedItem = item.snooze(finalSnoozeUntil, occurredAt);

  // Check if we need to move the item to a new date
  // Extract date from finalSnoozeUntil DateTime
  const snoozeUntilDate = finalSnoozeUntil.toDate();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(snoozeUntilDate);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const snoozeUntilDay = `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;

  const currentPlacementStr = snoozedItem.data.placement.toString();

  // Check if current placement is a date (not an item UUID)
  const isDatePlacement = /^\d{4}-\d{2}-\d{2}$/.test(currentPlacementStr);
  if (isDatePlacement && snoozeUntilDay > currentPlacementStr) {
    // Move item to snoozeUntil date
    const newPlacementResult = parsePlacement(snoozeUntilDay);
    if (newPlacementResult.type === "error") {
      return Result.error(
        createValidationError("SnoozeItem", newPlacementResult.error.issues),
      );
    }
    snoozedItem = snoozedItem.relocate(
      newPlacementResult.value,
      snoozedItem.data.rank,
      occurredAt,
    );
  }

  // Save the snoozed item
  const saveResult = await itemRepository.save(snoozedItem);
  if (saveResult.type === "error") {
    return Result.error(saveResult.error);
  }

  return Result.ok({ item: snoozedItem });
};

export const SnoozeItemWorkflow = {
  execute,
};
