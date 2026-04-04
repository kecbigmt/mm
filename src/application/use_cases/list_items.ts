import { Result } from "../../shared/result.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";
import { Item } from "../../domain/models/item.ts";
import { Directory } from "../../domain/primitives/directory.ts";
import {
  parseTimezoneIdentifier,
  TimezoneIdentifier,
} from "../../domain/primitives/timezone_identifier.ts";
import type { ItemIconValue } from "../../domain/primitives/item_icon.ts";
import { createSingleRange } from "../../domain/primitives/directory_range.ts";
import { parseRangeExpression } from "../../domain/primitives/path_expression_parser.ts";
import { createPathResolver } from "../../domain/services/path_resolver.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { dateTimeFromDate } from "../../domain/primitives/date_time.ts";
import { profileAsync, profileSync } from "../../shared/profiler.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type ListItemsStatusFilter = "open" | "closed" | "all";

/** Application-level input DTO */
export type ListItemsRequest = Readonly<{
  expression?: string;
  cwd: Directory;
  timezone?: TimezoneIdentifier;
  today?: Date;
  status?: ListItemsStatusFilter;
  icon?: ItemIconValue;
}>;

/** Application-level dependencies (subset of CoreDependencies) */
export type ListItemsDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

/** Presentation-free item DTO for structured responses */
export type ListItemDto = ItemDto;

/** Application-level result DTO */
export type ListItemsResponse = Readonly<{
  items: ReadonlyArray<ListItemDto>;
}>;

type ListItemsDomainResponse = Readonly<{
  items: ReadonlyArray<Item>;
}>;

/** Application-level error type */
export type ListItemsApplicationError =
  | ValidationError<"ListItems">
  | RepositoryError;

/** Execute the list-items use case, returning presentation-free DTOs */
export const listItemsForDomain = async (
  request: ListItemsRequest,
  deps: ListItemsDeps,
): Promise<Result<ListItemsDomainResponse, ListItemsApplicationError>> => {
  const today = request.today ?? new Date();

  const timezoneResult = request.timezone
    ? Result.ok(request.timezone)
    : parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") {
    return Result.error(
      createValidationError("ListItems", timezoneResult.error.issues),
    );
  }

  const pathResolver = createPathResolver({
    aliasRepository: deps.aliasRepository,
    itemRepository: deps.itemRepository,
    timezone: timezoneResult.value,
    today,
    prefixCandidates: deps.prefixCandidates,
  });

  let directoryRange;

  if (request.expression) {
    const rangeExprResult = parseRangeExpression(request.expression);
    if (rangeExprResult.type === "error") {
      return Result.error(
        createValidationError("ListItems", rangeExprResult.error.issues),
      );
    }

    const resolveResult = await profileAsync(
      "usecase:resolveRange",
      () => pathResolver.resolveRange(request.cwd, rangeExprResult.value),
    );
    if (resolveResult.type === "error") {
      return Result.error(
        createValidationError("ListItems", resolveResult.error.issues),
      );
    }

    directoryRange = resolveResult.value;
  } else {
    directoryRange = createSingleRange(request.cwd);
  }

  const itemsResult = await profileAsync(
    "usecase:listByDirectory",
    () => deps.itemRepository.listByDirectory(directoryRange),
  );
  if (itemsResult.type === "error") {
    return Result.error(itemsResult.error);
  }

  const statusFilter = request.status ?? "open";
  let filtered = itemsResult.value;

  if (statusFilter !== "all") {
    filtered = filtered.filter((item) =>
      statusFilter === "open" ? item.data.status.isOpen() : item.data.status.isClosed()
    );
  }

  if (statusFilter !== "all") {
    const nowResult = dateTimeFromDate(today);
    if (nowResult.type === "error") {
      return Result.error(
        createValidationError("ListItems", nowResult.error.issues),
      );
    }
    const now = nowResult.value;
    filtered = filtered.filter((item) => !item.isSnoozing(now));
  }

  if (request.icon) {
    filtered = filtered.filter((item) => item.data.icon.toString() === request.icon);
  }

  const sorted = profileSync("usecase:sort", () =>
    [...filtered].sort((a, b) => {
      const rankCmp = a.data.rank.compare(b.data.rank);
      if (rankCmp !== 0) return rankCmp;
      const aCreated = a.data.createdAt.toString();
      const bCreated = b.data.createdAt.toString();
      if (aCreated < bCreated) return -1;
      if (aCreated > bCreated) return 1;
      const aId = a.data.id.toString();
      const bId = b.data.id.toString();
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      return 0;
    }));

  return Result.ok({ items: sorted });
};

export const listItems = async (
  request: ListItemsRequest,
  deps: ListItemsDeps,
): Promise<Result<ListItemsResponse, ListItemsApplicationError>> => {
  const result = await listItemsForDomain(request, deps);
  if (result.type === "error") {
    return result;
  }

  return Result.ok(
    Object.freeze({ items: Object.freeze(result.value.items.map(toItemDto)) }),
  );
};
