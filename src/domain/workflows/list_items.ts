import { Result } from "../../shared/result.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { Placement } from "../primitives/placement.ts";
import { parseTimezoneIdentifier, TimezoneIdentifier } from "../primitives/timezone_identifier.ts";
import { createSingleRange } from "../primitives/placement_range.ts";
import { parseRangeExpression } from "../../presentation/cli/path_expression.ts";
import { createPathResolver } from "../services/path_resolver.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import type { ItemIconValue } from "../primitives/item_icon.ts";
import { dateTimeFromDate } from "../primitives/date_time.ts";

export type ListItemsStatusFilter = "open" | "closed" | "all";

export type ListItemsInput = Readonly<{
  expression?: string; // PathExpression or RangeExpression as string
  cwd: Placement;
  timezone?: TimezoneIdentifier;
  today?: Date;
  status?: ListItemsStatusFilter; // default: "open"
  icon?: ItemIconValue; // note, task, or event
}>;

export type ListItemsDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
}>;

export type ListItemsValidationError = ValidationError<"ListItems">;

export type ListItemsError = ListItemsValidationError | RepositoryError;

export type ListItemsResult = Readonly<{
  items: ReadonlyArray<Item>;
}>;

export const ListItemsWorkflow = {
  async execute(
    input: ListItemsInput,
    deps: ListItemsDependencies,
  ): Promise<Result<ListItemsResult, ListItemsError>> {
    const today = input.today ?? new Date();

    const timezoneResult = input.timezone
      ? Result.ok(input.timezone)
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
    });

    let placementRange;

    if (input.expression) {
      // Parse expression
      const rangeExprResult = parseRangeExpression(input.expression);
      if (rangeExprResult.type === "error") {
        return Result.error(
          createValidationError("ListItems", rangeExprResult.error.issues),
        );
      }

      // Resolve to PlacementRange
      const resolveResult = await pathResolver.resolveRange(
        input.cwd,
        rangeExprResult.value,
      );
      if (resolveResult.type === "error") {
        return Result.error(
          createValidationError("ListItems", resolveResult.error.issues),
        );
      }

      placementRange = resolveResult.value;
    } else {
      // No expression - use cwd as single range
      placementRange = createSingleRange(input.cwd);
    }

    // Query items using PlacementRange
    const itemsResult = await deps.itemRepository.listByPlacement(placementRange);
    if (itemsResult.type === "error") {
      return Result.error(itemsResult.error);
    }

    // Apply filters
    const statusFilter = input.status ?? "open";
    let filtered = itemsResult.value;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((item) =>
        statusFilter === "open" ? item.data.status.isOpen() : item.data.status.isClosed()
      );
    }

    // Snooze filter (only when status is not "all")
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

    // Icon filter
    if (input.icon) {
      const targetIcon = input.icon;
      filtered = filtered.filter((item) => item.data.icon.toString() === targetIcon);
    }

    // Sort: rank ascending, then createdAt ascending, then id ascending
    const sorted = [...filtered].sort((a, b) => {
      // 1. rank ascending
      const rankCmp = a.data.rank.compare(b.data.rank);
      if (rankCmp !== 0) return rankCmp;

      // 2. createdAt ascending
      const aCreated = a.data.createdAt.toString();
      const bCreated = b.data.createdAt.toString();
      if (aCreated < bCreated) return -1;
      if (aCreated > bCreated) return 1;

      // 3. id ascending (final tie-break)
      const aId = a.data.id.toString();
      const bId = b.data.id.toString();
      if (aId < bId) return -1;
      if (aId > bId) return 1;

      return 0;
    });

    return Result.ok({
      items: sorted,
    });
  },
};
