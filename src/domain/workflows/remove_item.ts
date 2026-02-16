import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { TimezoneIdentifier } from "../primitives/timezone_identifier.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createItemLocatorService } from "../services/item_locator_service.ts";

export type RemoveItemInput = Readonly<{
  itemIds: ReadonlyArray<string>;
  timezone: TimezoneIdentifier;
}>;

export type RemoveItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type RemoveItemValidationError = ValidationError<"RemoveItem">;

export type RemoveItemError = RemoveItemValidationError | RepositoryError;

export type RemoveItemResult = Readonly<{
  succeeded: ReadonlyArray<Item>;
  failed: ReadonlyArray<{ itemId: string; error: RemoveItemError }>;
}>;

export const RemoveItemWorkflow = {
  async execute(
    input: RemoveItemInput,
    deps: RemoveItemDependencies,
  ): Promise<Result<RemoveItemResult, RemoveItemError>> {
    if (input.itemIds.length === 0) {
      return Result.error(
        createValidationError("RemoveItem", [
          createValidationIssue("At least one item ID is required", {
            code: "empty_array",
            path: ["itemIds"],
          }),
        ]),
      );
    }

    const locatorService = createItemLocatorService({
      itemRepository: deps.itemRepository,
      aliasRepository: deps.aliasRepository,
      timezone: input.timezone,
      prefixCandidates: deps.prefixCandidates,
    });

    const succeeded: Item[] = [];
    const failed: Array<{
      itemId: string;
      error: RemoveItemError;
    }> = [];

    for (const itemId of input.itemIds) {
      const resolveResult = await locatorService.resolve(itemId);

      if (resolveResult.type === "error") {
        const locatorError = resolveResult.error;
        if (locatorError.kind === "repository_error") {
          failed.push({ itemId, error: locatorError.error });
        } else if (locatorError.kind === "ambiguous_prefix") {
          failed.push({
            itemId,
            error: createValidationError("RemoveItem", [
              createValidationIssue(
                `Ambiguous prefix '${locatorError.locator}': matches ${
                  locatorError.candidates.join(", ")
                }`,
                { code: "ambiguous_prefix", path: ["itemId"] },
              ),
            ]),
          });
        } else {
          failed.push({
            itemId,
            error: createValidationError("RemoveItem", [
              createValidationIssue(`Item not found: ${itemId}`, {
                code: "not_found",
                path: ["itemId"],
              }),
            ]),
          });
        }
        continue;
      }

      const item = resolveResult.value;

      // Delete the item
      const deleteResult = await deps.itemRepository.delete(item.data.id);
      if (deleteResult.type === "error") {
        failed.push({
          itemId,
          error: deleteResult.error,
        });
        continue;
      }

      succeeded.push(item);
    }

    return Result.ok({
      succeeded,
      failed,
    });
  },
};
