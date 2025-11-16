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

export type ListItemsInput = Readonly<{
  expression?: string; // PathExpression or RangeExpression as string
  cwd: Placement;
  timezone?: TimezoneIdentifier;
  today?: Date;
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

    return Result.ok({
      items: itemsResult.value,
    });
  },
};
