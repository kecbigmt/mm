import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { parseItemId } from "../primitives/item_id.ts";
import { parseAliasSlug } from "../primitives/alias_slug.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type RemoveItemInput = Readonly<{
  itemIds: ReadonlyArray<string>;
}>;

export type RemoveItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
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

    const succeeded: Item[] = [];
    const failed: Array<{
      itemId: string;
      error: RemoveItemError;
    }> = [];

    for (const itemId of input.itemIds) {
      // Try to resolve as UUID first, then as alias
      let item: Item | undefined;
      const uuidResult = parseItemId(itemId);

      if (uuidResult.type === "ok") {
        // It's a valid UUID
        const loadResult = await deps.itemRepository.load(uuidResult.value);
        if (loadResult.type === "error") {
          failed.push({
            itemId,
            error: loadResult.error,
          });
          continue;
        }
        item = loadResult.value;
      } else {
        // Try as alias
        const aliasResult = parseAliasSlug(itemId);
        if (aliasResult.type === "ok") {
          const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
          if (aliasLoadResult.type === "error") {
            failed.push({
              itemId,
              error: aliasLoadResult.error,
            });
            continue;
          }
          const alias = aliasLoadResult.value;
          if (alias) {
            const itemLoadResult = await deps.itemRepository.load(alias.data.itemId);
            if (itemLoadResult.type === "error") {
              failed.push({
                itemId,
                error: itemLoadResult.error,
              });
              continue;
            }
            item = itemLoadResult.value;
          }
        }
      }

      if (!item) {
        failed.push({
          itemId,
          error: createValidationError("RemoveItem", [
            createValidationIssue(`Item not found: ${itemId}`, {
              code: "not_found",
              path: ["itemId"],
            }),
          ]),
        });
        continue;
      }

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
