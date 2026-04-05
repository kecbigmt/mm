import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import {
  DateTime,
  Directory,
  parseTimezoneIdentifier,
  TimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { createDurationFromHours } from "../../domain/primitives/duration.ts";
import { parseDirectory } from "../../domain/primitives/directory.ts";
import { createSingleRange } from "../../domain/primitives/directory_range.ts";
import { parsePathExpression } from "../../domain/primitives/path_expression_parser.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createPathResolver } from "../../domain/services/path_resolver.ts";
import { RankService } from "../../domain/services/rank_service.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type SnoozeItemRequest = Readonly<{
  itemLocator: string;
  cwd: Directory;
  snoozeUntil?: DateTime;
  clear?: boolean;
  timezone?: TimezoneIdentifier;
  today?: Date;
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
  const today = input.today ?? new Date();
  const timezoneResult = input.timezone
    ? Result.ok(input.timezone)
    : parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") {
    return Result.error(createValidationError("SnoozeItem", timezoneResult.error.issues));
  }
  const timezone = timezoneResult.value;

  const pathResolver = createPathResolver({
    aliasRepository: deps.aliasRepository,
    itemRepository: deps.itemRepository,
    timezone,
    today,
    prefixCandidates: deps.prefixCandidates,
  });

  // Resolve item locator via path expression (supports CWD-relative refs like 1, ./1, today/2)
  const exprResult = parsePathExpression(input.itemLocator);
  if (exprResult.type === "error") {
    return Result.error(
      createValidationError("SnoozeItem", [
        createValidationIssue(
          `invalid item expression: ${exprResult.error.issues.map((i) => i.message).join(", ")}`,
          { code: "invalid_item_expression", path: ["itemLocator"] },
        ),
      ]),
    );
  }

  const pathResult = await pathResolver.resolvePath(input.cwd, exprResult.value);
  if (pathResult.type === "error") {
    return Result.error(
      createValidationError("SnoozeItem", [
        createValidationIssue(
          `failed to resolve item: ${pathResult.error.issues.map((i) => i.message).join(", ")}`,
          { code: "item_resolution_failed", path: ["itemLocator"] },
        ),
      ]),
    );
  }

  if (pathResult.value.head.kind !== "item") {
    return Result.error(
      createValidationError("SnoozeItem", [
        createValidationIssue("expression must resolve to an item, not a date", {
          code: "not_an_item",
          path: ["itemLocator"],
        }),
      ]),
    );
  }

  const itemId = pathResult.value.head.id;
  const loadResult = await deps.itemRepository.load(itemId);
  if (loadResult.type === "error") {
    return Result.error(loadResult.error);
  }
  if (!loadResult.value) {
    return Result.error(
      createValidationError("SnoozeItem", [
        createValidationIssue(`Item not found: ${input.itemLocator}`, {
          code: "item_not_found",
          path: ["itemLocator"],
        }),
      ]),
    );
  }

  const item = loadResult.value;

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
    timeZone: timezone.toString(),
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
