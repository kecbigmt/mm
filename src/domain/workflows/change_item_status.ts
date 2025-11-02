import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import {
  LocatorResolutionDependencies,
  LocatorResolutionError,
  LocatorResolutionService,
} from "../services/locator_resolution_service.ts";

export type StatusAction = "close" | "reopen";

export type ChangeItemStatusInput = Readonly<{
  itemIds: ReadonlyArray<string>;
  action: StatusAction;
  occurredAt: DateTime;
}>;

export type ChangeItemStatusDependencies = LocatorResolutionDependencies;

export type ChangeItemStatusValidationError = ValidationError<"ChangeItemStatus">;

export type ChangeItemStatusError =
  | ChangeItemStatusValidationError
  | LocatorResolutionError
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
      const resolutionResult = await LocatorResolutionService.resolveItem(
        itemId,
        deps,
      );
      if (resolutionResult.type === "error") {
        failed.push({
          itemId,
          error: resolutionResult.error,
        });
        continue;
      }

      const item = resolutionResult.value;
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
