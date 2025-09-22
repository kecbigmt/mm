import { Result } from "../../shared/result.ts";
import { Item } from "../models/item.ts";
import { parseItemId } from "../primitives/item_id.ts";
import { parseItemShortId } from "../primitives/item_short_id.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AmbiguousShortIdError } from "../repositories/short_id_resolution_error.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

export type ItemResolutionError =
  | ValidationError<"ItemResolution">
  | RepositoryError
  | AmbiguousShortIdError;

export type ItemResolutionDependencies = Readonly<{
  itemRepository: ItemRepository;
}>;

/**
 * Service for resolving item identifiers to actual items.
 * Handles both full UUID v7 IDs and 7-character short IDs.
 */
export const ItemResolutionService = {
  /**
   * Resolves an item identifier (full ID or short ID) to an actual Item.
   *
   * @param itemIdString - Either a full UUID v7 or 7-character short ID
   * @param deps - Dependencies including item repository
   * @returns Result containing the resolved Item or undefined if not found
   */
  resolveItemId: async (
    itemIdString: string,
    deps: ItemResolutionDependencies,
  ): Promise<Result<Item | undefined, ItemResolutionError>> => {
    // First try to parse as full ItemId
    const parseResult = parseItemId(itemIdString);

    if (parseResult.type === "ok") {
      // Valid full ID - load directly
      const loadResult = await deps.itemRepository.load(parseResult.value);
      if (loadResult.type === "error") {
        return Result.error(loadResult.error);
      }
      return Result.ok(loadResult.value);
    }

    // Try parsing as short ID
    const shortIdParseResult = parseItemShortId(itemIdString);
    if (shortIdParseResult.type === "error") {
      // Not a valid full ID or short ID
      return Result.error(
        createValidationError("ItemResolution", [
          createValidationIssue(`Invalid item ID format: ${itemIdString}`, {
            code: "invalid_format",
            path: ["itemId"],
          }),
        ]),
      );
    }

    // Valid short ID - resolve to full item
    const findResult = await deps.itemRepository.findByShortId(shortIdParseResult.value);
    if (findResult.type === "error") {
      return Result.error(findResult.error);
    }

    return Result.ok(findResult.value);
  },
};
