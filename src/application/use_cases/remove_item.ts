import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { TimezoneIdentifier } from "../../domain/primitives/mod.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createItemLocatorService } from "../../domain/services/item_locator_service.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type RemoveItemRequest = Readonly<{
  itemIds: ReadonlyArray<string>;
  timezone: TimezoneIdentifier;
}>;

export type RemoveItemDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type RemoveItemApplicationError = ValidationError<"RemoveItem"> | RepositoryError;

export type RemoveItemFailure = Readonly<{
  itemId: string;
  error: RemoveItemApplicationError;
}>;

export type RemoveItemResponse = Readonly<{
  succeeded: ReadonlyArray<ItemDto>;
  failed: ReadonlyArray<RemoveItemFailure>;
}>;

export const removeItem = async (
  input: RemoveItemRequest,
  deps: RemoveItemDeps,
): Promise<Result<RemoveItemResponse, RemoveItemApplicationError>> => {
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

  const succeeded = [];
  const failed: RemoveItemFailure[] = [];

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
    const deleteResult = await deps.itemRepository.delete(item.data.id);
    if (deleteResult.type === "error") {
      failed.push({ itemId, error: deleteResult.error });
      continue;
    }

    succeeded.push(item);
  }

  return Result.ok(
    Object.freeze({
      succeeded: Object.freeze(succeeded.map(toItemDto)),
      failed: Object.freeze(failed),
    }),
  );
};
