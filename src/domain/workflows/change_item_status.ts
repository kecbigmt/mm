import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { parseItemId } from "../primitives/item_id.ts";
import { parseAliasSlug } from "../primitives/alias_slug.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type StatusAction = "close" | "reopen";

export type ChangeItemStatusInput = Readonly<{
  itemIds: ReadonlyArray<string>;
  action: StatusAction;
  occurredAt: DateTime;
}>;

export type ChangeItemStatusDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
}>;

export type ChangeItemStatusValidationError = ValidationError<"ChangeItemStatus">;

export type ChangeItemStatusError =
  | ChangeItemStatusValidationError
  | RepositoryError;

export type ChangeItemStatusResult = Readonly<{
  succeeded: ReadonlyArray<Item>;
  failed: ReadonlyArray<{
    itemId: string;
    error: ChangeItemStatusError;
  }>;
}>;

export const ChangeItemStatusWorkflow = {
  execute: async (
    input: ChangeItemStatusInput,
    deps: ChangeItemStatusDependencies,
  ): Promise<Result<ChangeItemStatusResult, ChangeItemStatusError>> => {
    if (input.itemIds.length === 0) {
      return Result.error(
        createValidationError("ChangeItemStatus", [
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
      error: ChangeItemStatusError;
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
          error: createValidationError("ChangeItemStatus", [
            createValidationIssue(`Item not found: ${itemId}`, {
              code: "not_found",
              path: ["itemId"],
            }),
          ]),
        });
        continue;
      }

      let updatedItem: Item;
      if (input.action === "close") {
        // If already closed, still count as success (idempotent)
        if (item.data.status.isClosed()) {
          succeeded.push(item);
          continue;
        }
        updatedItem = item.close(input.occurredAt);
      } else {
        // If already open, still count as success (idempotent)
        if (item.data.status.isOpen()) {
          succeeded.push(item);
          continue;
        }
        updatedItem = item.reopen(input.occurredAt);
      }

      const saveResult = await deps.itemRepository.save(updatedItem);
      if (saveResult.type === "error") {
        failed.push({
          itemId,
          error: saveResult.error,
        });
        continue;
      }

      succeeded.push(updatedItem);
    }

    return Result.ok({
      succeeded,
      failed,
    });
  },
};
