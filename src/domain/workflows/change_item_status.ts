import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { parseItemId } from "../primitives/item_id.ts";
import { DateTime } from "../primitives/date_time.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type StatusAction = "close" | "reopen";

export type ChangeItemStatusInput = Readonly<{
  itemIds: ReadonlyArray<string>;
  action: StatusAction;
  occurredAt: DateTime;
}>;

export type ChangeItemStatusDependencies = Readonly<{
  itemRepository: ItemRepository;
}>;

export type ChangeItemStatusValidationError = ValidationError<"ChangeItemStatus">;

export type ChangeItemStatusRepositoryError = Readonly<{
  kind: "repository";
  error: RepositoryError;
}>;

export type ChangeItemStatusError =
  | ChangeItemStatusValidationError
  | ChangeItemStatusRepositoryError;

export type ChangeItemStatusResult = Readonly<{
  succeeded: ReadonlyArray<Item>;
  failed: ReadonlyArray<{
    itemId: string;
    error: ChangeItemStatusError;
  }>;
}>;

const repositoryFailure = (error: RepositoryError): ChangeItemStatusRepositoryError => ({
  kind: "repository",
  error,
});

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
      const parseResult = parseItemId(itemId);
      if (parseResult.type === "error") {
        failed.push({
          itemId,
          error: createValidationError("ChangeItemStatus", parseResult.error.issues),
        });
        continue;
      }

      const loadResult = await deps.itemRepository.load(parseResult.value);
      if (loadResult.type === "error") {
        failed.push({
          itemId,
          error: repositoryFailure(loadResult.error),
        });
        continue;
      }

      const item = loadResult.value;
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
          error: repositoryFailure(saveResult.error),
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
