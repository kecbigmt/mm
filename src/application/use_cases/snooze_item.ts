import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { DateTime, TimezoneIdentifier } from "../../domain/primitives/mod.ts";
import { createDurationFromHours } from "../../domain/primitives/duration.ts";
import { parseDirectory } from "../../domain/primitives/directory.ts";
import { createSingleRange } from "../../domain/primitives/directory_range.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createItemLocatorService } from "../../domain/services/item_locator_service.ts";
import { RankService } from "../../domain/services/rank_service.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type SnoozeItemRequest = Readonly<{
  itemLocator: string;
  snoozeUntil?: DateTime;
  clear?: boolean;
  timezone: TimezoneIdentifier;
  occurredAt: DateTime;
}>;

export type SnoozeItemDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type SnoozeItemApplicationError =
  | ValidationError<"SnoozeItem">
  | RepositoryError;

export type SnoozeItemResponse = Readonly<{
  item: ItemDto;
}>;

export const snoozeItem = async (
  input: SnoozeItemRequest,
  deps: SnoozeItemDeps,
): Promise<Result<SnoozeItemResponse, SnoozeItemApplicationError>> => {
  const locatorService = createItemLocatorService({
    itemRepository: deps.itemRepository,
    aliasRepository: deps.aliasRepository,
    timezone: input.timezone,
    prefixCandidates: deps.prefixCandidates,
  });

  // Resolve item locator to a loaded Item
  const resolveResult = await locatorService.resolve(input.itemLocator);
  if (resolveResult.type === "error") {
    const err = resolveResult.error;
    if (err.kind === "repository_error") {
      return Result.error(err.error);
    }
    if (err.kind === "ambiguous_prefix") {
      return Result.error(
        createValidationError("SnoozeItem", [
          createValidationIssue(
            `Ambiguous prefix '${err.locator}': matches ${err.candidates.join(", ")}`,
            { code: "ambiguous_prefix", path: ["itemLocator"] },
          ),
        ]),
      );
    }
    return Result.error(
      createValidationError("SnoozeItem", [
        createValidationIssue(`Item not found: ${input.itemLocator}`, {
          code: "item_not_found",
          path: ["itemLocator"],
        }),
      ]),
    );
  }

  const item = resolveResult.value;

  // Handle unsnooze case (--clear flag)
  if (input.clear === true) {
    const unsnoozedItem = item.snooze(undefined, input.occurredAt);
    const saveResult = await deps.itemRepository.save(unsnoozedItem);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }
    return Result.ok(Object.freeze({ item: toItemDto(unsnoozedItem) }));
  }

  // Determine snoozeUntil datetime
  let finalSnoozeUntil: DateTime;
  if (input.snoozeUntil === undefined) {
    const defaultDurationResult = createDurationFromHours(8);
    if (defaultDurationResult.type === "error") {
      return Result.error(
        createValidationError("SnoozeItem", defaultDurationResult.error.issues),
      );
    }
    finalSnoozeUntil = input.occurredAt.addDuration(defaultDurationResult.value);
  } else {
    finalSnoozeUntil = input.snoozeUntil;
  }

  // Snooze the item
  let snoozedItem = item.snooze(finalSnoozeUntil, input.occurredAt);

  // Check if we need to relocate to a new date directory
  const snoozeUntilDate = finalSnoozeUntil.toDate();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(snoozeUntilDate);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const snoozeUntilDay = `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;

  const currentDirectoryStr = snoozedItem.data.directory.toString();
  const isDateDirectory = /^\d{4}-\d{2}-\d{2}$/.test(currentDirectoryStr);

  if (isDateDirectory && snoozeUntilDay > currentDirectoryStr) {
    const newDirectoryResult = parseDirectory(snoozeUntilDay);
    if (newDirectoryResult.type === "error") {
      return Result.error(
        createValidationError("SnoozeItem", newDirectoryResult.error.issues),
      );
    }

    const targetRange = createSingleRange(newDirectoryResult.value);
    const targetItemsResult = await deps.itemRepository.listByDirectory(targetRange);
    if (targetItemsResult.type === "error") {
      return Result.error(targetItemsResult.error);
    }

    const existingRanks = targetItemsResult.value.map((i) => i.data.rank);
    const rankResult = deps.rankService.tailRank(existingRanks);
    if (rankResult.type === "error") {
      return Result.error(createValidationError("SnoozeItem", rankResult.error.issues));
    }

    snoozedItem = snoozedItem.relocate(
      newDirectoryResult.value,
      rankResult.value,
      input.occurredAt,
    );
  }

  // Save the snoozed item
  const saveResult = await deps.itemRepository.save(snoozedItem);
  if (saveResult.type === "error") {
    return Result.error(saveResult.error);
  }

  return Result.ok(Object.freeze({ item: toItemDto(snoozedItem) }));
};
