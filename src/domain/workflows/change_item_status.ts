import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { TimezoneIdentifier } from "../primitives/timezone_identifier.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createItemLocatorService } from "../services/item_locator_service.ts";

export type StatusAction = "close" | "reopen";

export type ChangeItemStatusInput = Readonly<{
  itemIds: ReadonlyArray<string>;
  action: StatusAction;
  occurredAt: DateTime;
  timezone: TimezoneIdentifier;
}>;

export type ChangeItemStatusDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  prefixCandidates?: () => Promise<readonly string[]>;
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

    const locatorService = createItemLocatorService({
      itemRepository: deps.itemRepository,
      aliasRepository: deps.aliasRepository,
      timezone: input.timezone,
      prefixCandidates: deps.prefixCandidates,
    });

    const succeeded: Item[] = [];
    const failed: Array<{
      itemId: string;
      error: ChangeItemStatusError;
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
            error: createValidationError("ChangeItemStatus", [
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
            error: createValidationError("ChangeItemStatus", [
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
