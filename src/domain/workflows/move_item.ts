import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { Path, parsePath } from "../primitives/path.ts";
import { Locator, parseLocator, ParseLocatorOptions } from "../primitives/locator.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { LocatorResolutionService } from "../services/locator_resolution_service.ts";
import { RankService } from "../services/rank_service.ts";
import { ItemRank } from "../primitives/item_rank.ts";

export type PlacementTarget = Readonly<
  | { readonly kind: "head"; readonly path: Path }
  | { readonly kind: "tail"; readonly path: Path }
  | { readonly kind: "after"; readonly itemId: string }
  | { readonly kind: "before"; readonly itemId: string }
>;

export type MoveItemInput = Readonly<{
  itemLocator: string;
  placement: string;
  cwd?: Path;
  today?: Date;
  occurredAt: DateTime;
}>;

export type MoveItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
}>;

export type MoveItemValidationError = ValidationError<"MoveItem">;

export type MoveItemError = MoveItemValidationError | RepositoryError;

export type MoveItemResult = Readonly<{
  item: Item;
}>;

const parsePlacement = (
  input: string,
  options: ParseLocatorOptions,
): Result<PlacementTarget, MoveItemValidationError> => {
  const trimmed = input.trim();

  if (trimmed.startsWith("head:")) {
    const pathStr = trimmed.slice(5);
    const pathResult = parsePath(pathStr, options);
    if (pathResult.type === "error") {
      return Result.error(
        createValidationError("MoveItem", pathResult.error.issues),
      );
    }
    if (pathResult.value.isRange()) {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue("placement target cannot be a range", {
            code: "range_not_allowed",
            path: ["placement"],
          }),
        ]),
      );
    }
    return Result.ok({ kind: "head", path: pathResult.value });
  }

  if (trimmed.startsWith("tail:")) {
    const pathStr = trimmed.slice(5);
    const pathResult = parsePath(pathStr, options);
    if (pathResult.type === "error") {
      return Result.error(
        createValidationError("MoveItem", pathResult.error.issues),
      );
    }
    if (pathResult.value.isRange()) {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue("placement target cannot be a range", {
            code: "range_not_allowed",
            path: ["placement"],
          }),
        ]),
      );
    }
    return Result.ok({ kind: "tail", path: pathResult.value });
  }

  if (trimmed.startsWith("after:")) {
    const itemId = trimmed.slice(6);
    return Result.ok({ kind: "after", itemId });
  }

  if (trimmed.startsWith("before:")) {
    const itemId = trimmed.slice(7);
    return Result.ok({ kind: "before", itemId });
  }

  const pathResult = parsePath(trimmed, options);
  if (pathResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", pathResult.error.issues),
    );
  }
  if (pathResult.value.isRange()) {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue("placement target cannot be a range", {
          code: "range_not_allowed",
          path: ["placement"],
        }),
      ]),
    );
  }
  return Result.ok({ kind: "tail", path: pathResult.value });
};

const resolveTargetItem = async (
  itemId: string,
  deps: MoveItemDependencies,
  options: ParseLocatorOptions,
): Promise<Result<Item | undefined, MoveItemError>> => {
  const resolveResult = await LocatorResolutionService.resolveItem(
    itemId,
    deps,
    options,
  );
  if (resolveResult.type === "error") {
    return Result.error(resolveResult.error as MoveItemError);
  }
  return Result.ok(resolveResult.value);
};

const calculateRankForPlacement = async (
  target: PlacementTarget,
  deps: MoveItemDependencies,
  options: ParseLocatorOptions,
): Promise<Result<{ path: Path; rank: ItemRank }, MoveItemError>> => {
  switch (target.kind) {
    case "head": {
      const minRankResult = deps.rankService.minRank();
      if (minRankResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("failed to generate minimum rank", {
              code: "rank_generation_failed",
              path: ["placement"],
            }),
          ]),
        );
      }
      return Result.ok({ path: target.path, rank: minRankResult.value });
    }
    case "tail": {
      const siblingsResult = await deps.itemRepository.listByPath(target.path);
      if (siblingsResult.type === "error") {
        return Result.error(siblingsResult.error);
      }

      const siblings = siblingsResult.value;
      if (siblings.length === 0) {
        const middleRankResult = deps.rankService.middleRank();
        if (middleRankResult.type === "error") {
          return Result.error(
            createValidationError("MoveItem", [
              createValidationIssue("failed to generate middle rank", {
                code: "rank_generation_failed",
                path: ["placement"],
              }),
            ]),
          );
        }
        return Result.ok({ path: target.path, rank: middleRankResult.value });
      }

      const lastItem = siblings[siblings.length - 1];
      const nextRankResult = deps.rankService.nextRank(lastItem.data.rank);
      if (nextRankResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("failed to generate next rank", {
              code: "rank_generation_failed",
              path: ["placement"],
            }),
          ]),
        );
      }
      return Result.ok({ path: target.path, rank: nextRankResult.value });
    }
    case "after": {
      const targetItemResult = await resolveTargetItem(target.itemId, deps, options);
      if (targetItemResult.type === "error") {
        return Result.error(targetItemResult.error);
      }
      const targetItem = targetItemResult.value;
      if (!targetItem) {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(`target item not found: ${target.itemId}`, {
              code: "target_not_found",
              path: ["placement"],
            }),
          ]),
        );
      }

      const siblingsResult = await deps.itemRepository.listByPath(targetItem.data.path);
      if (siblingsResult.type === "error") {
        return Result.error(siblingsResult.error);
      }

      const siblings = siblingsResult.value;
      const targetIndex = siblings.findIndex((item) => item.data.id.toString() === targetItem.data.id.toString());
      if (targetIndex === -1) {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("target item not found in siblings", {
              code: "target_not_in_siblings",
              path: ["placement"],
            }),
          ]),
        );
      }

      if (targetIndex === siblings.length - 1) {
        const nextRankResult = deps.rankService.nextRank(targetItem.data.rank);
        if (nextRankResult.type === "error") {
          return Result.error(
            createValidationError("MoveItem", [
              createValidationIssue("failed to generate next rank", {
                code: "rank_generation_failed",
                path: ["placement"],
              }),
            ]),
          );
        }
        return Result.ok({ path: targetItem.data.path, rank: nextRankResult.value });
      }

      const nextSibling = siblings[targetIndex + 1];
      const betweenRankResult = deps.rankService.betweenRanks(
        targetItem.data.rank,
        nextSibling.data.rank,
      );
      if (betweenRankResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("failed to generate between rank", {
              code: "rank_generation_failed",
              path: ["placement"],
            }),
          ]),
        );
      }
      return Result.ok({ path: targetItem.data.path, rank: betweenRankResult.value });
    }
    case "before": {
      const targetItemResult = await resolveTargetItem(target.itemId, deps, options);
      if (targetItemResult.type === "error") {
        return Result.error(targetItemResult.error);
      }
      const targetItem = targetItemResult.value;
      if (!targetItem) {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(`target item not found: ${target.itemId}`, {
              code: "target_not_found",
              path: ["placement"],
            }),
          ]),
        );
      }

      const siblingsResult = await deps.itemRepository.listByPath(targetItem.data.path);
      if (siblingsResult.type === "error") {
        return Result.error(siblingsResult.error);
      }

      const siblings = siblingsResult.value;
      const targetIndex = siblings.findIndex((item) => item.data.id.toString() === targetItem.data.id.toString());
      if (targetIndex === -1) {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("target item not found in siblings", {
              code: "target_not_in_siblings",
              path: ["placement"],
            }),
          ]),
        );
      }

      if (targetIndex === 0) {
        const prevRankResult = deps.rankService.prevRank(targetItem.data.rank);
        if (prevRankResult.type === "error") {
          return Result.error(
            createValidationError("MoveItem", [
              createValidationIssue("failed to generate previous rank", {
                code: "rank_generation_failed",
                path: ["placement"],
              }),
            ]),
          );
        }
        return Result.ok({ path: targetItem.data.path, rank: prevRankResult.value });
      }

      const prevSibling = siblings[targetIndex - 1];
      const betweenRankResult = deps.rankService.betweenRanks(
        prevSibling.data.rank,
        targetItem.data.rank,
      );
      if (betweenRankResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("failed to generate between rank", {
              code: "rank_generation_failed",
              path: ["placement"],
            }),
          ]),
        );
      }
      return Result.ok({ path: targetItem.data.path, rank: betweenRankResult.value });
    }
  }
};

export const MoveItemWorkflow = {
  execute: async (
    input: MoveItemInput,
    deps: MoveItemDependencies,
  ): Promise<Result<MoveItemResult, MoveItemError>> => {
    const options: ParseLocatorOptions = {
      cwd: input.cwd,
      today: input.today ?? new Date(),
    };

    const itemResolveResult = await LocatorResolutionService.resolveItem(
      input.itemLocator,
      deps,
      options,
    );
    if (itemResolveResult.type === "error") {
      return Result.error(itemResolveResult.error as MoveItemError);
    }

    const item = itemResolveResult.value;
    if (!item) {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue(`item not found: ${input.itemLocator}`, {
            code: "item_not_found",
            path: ["itemLocator"],
          }),
        ]),
      );
    }

    const placementResult = parsePlacement(input.placement, options);
    if (placementResult.type === "error") {
      return Result.error(placementResult.error);
    }

    const rankResult = await calculateRankForPlacement(
      placementResult.value,
      deps,
      options,
    );
    if (rankResult.type === "error") {
      return Result.error(rankResult.error);
    }

    const { path, rank } = rankResult.value;

    const updatedItem = item.relocate(path, rank, input.occurredAt);

    const saveResult = await deps.itemRepository.save(updatedItem);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }

    return Result.ok({ item: updatedItem });
  },
};

