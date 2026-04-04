import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { DateTime, TimezoneIdentifier } from "../../domain/primitives/mod.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createItemLocatorService } from "../../domain/services/item_locator_service.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type StatusAction = "close" | "reopen";

export type ChangeItemStatusRequest = Readonly<{
  itemIds: ReadonlyArray<string>;
  action: StatusAction;
  occurredAt: DateTime;
  timezone: TimezoneIdentifier;
}>;

export type ChangeItemStatusDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type ChangeItemStatusApplicationError =
  | ValidationError<"ChangeItemStatus">
  | RepositoryError;

export type ChangeItemStatusFailure = Readonly<{
  itemId: string;
  error: ChangeItemStatusApplicationError;
}>;

export type ChangeItemStatusResponse = Readonly<{
  succeeded: ReadonlyArray<ItemDto>;
  failed: ReadonlyArray<ChangeItemStatusFailure>;
}>;

export const changeItemStatus = async (
  input: ChangeItemStatusRequest,
  deps: ChangeItemStatusDeps,
): Promise<Result<ChangeItemStatusResponse, ChangeItemStatusApplicationError>> => {
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

  const succeeded = [];
  const failed: ChangeItemStatusFailure[] = [];

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
    let updatedItem;
    if (input.action === "close") {
      if (item.data.status.isClosed()) {
        succeeded.push(item);
        continue;
      }
      updatedItem = item.close(input.occurredAt);
    } else {
      if (item.data.status.isOpen()) {
        succeeded.push(item);
        continue;
      }
      updatedItem = item.reopen(input.occurredAt);
    }

    const saveResult = await deps.itemRepository.save(updatedItem);
    if (saveResult.type === "error") {
      failed.push({ itemId, error: saveResult.error });
      continue;
    }

    succeeded.push(updatedItem);
  }

  return Result.ok(
    Object.freeze({
      succeeded: Object.freeze(succeeded.map(toItemDto)),
      failed: Object.freeze(failed),
    }),
  );
};
