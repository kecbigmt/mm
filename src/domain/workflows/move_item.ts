import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { ItemRank } from "../primitives/item_rank.ts";
import { Placement } from "../primitives/placement.ts";
import { parseTimezoneIdentifier, TimezoneIdentifier } from "../primitives/timezone_identifier.ts";
import { parsePathExpression } from "../../presentation/cli/path_parser.ts";
import { createPathResolver, PathResolver } from "../services/path_resolver.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RankService } from "../services/rank_service.ts";

export type MoveItemInput = Readonly<{
  itemExpression: string; // PathExpression to identify the item
  targetExpression: string; // PathExpression for target placement
  cwd: Placement;
  timezone?: TimezoneIdentifier;
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

type TargetPlacementAndRank = Readonly<{
  placement: Placement;
  rank: ItemRank;
}>;

async function resolvePlacementExpression(
  expression: string,
  expressionType: string,
  cwd: Placement,
  pathResolver: PathResolver,
): Promise<Result<Placement, MoveItemValidationError>> {
  const exprResult = parsePathExpression(expression);
  if (exprResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `invalid ${expressionType} expression: ${
            exprResult.error.issues.map((i) => i.message).join(", ")
          }`,
          {
            code: "invalid_target_expression",
            path: ["targetExpression"],
          },
        ),
      ]),
    );
  }

  const placementResult = await pathResolver.resolvePath(cwd, exprResult.value);
  if (placementResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `failed to resolve ${expressionType}: ${
            placementResult.error.issues.map((i) => i.message).join(", ")
          }`,
          {
            code: "target_resolution_failed",
            path: ["targetExpression"],
          },
        ),
      ]),
    );
  }

  return Result.ok(placementResult.value);
}

async function loadItemFromPlacement(
  placement: Placement,
  itemRepository: ItemRepository,
  errorCode: string,
): Promise<Result<Item, MoveItemValidationError | RepositoryError>> {
  if (placement.head.kind !== "item") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue("expression must resolve to an item, not a date", {
          code: errorCode,
          path: ["targetExpression"],
        }),
      ]),
    );
  }

  const loadResult = await itemRepository.load(placement.head.id);
  if (loadResult.type === "error") {
    return Result.error(loadResult.error);
  }

  if (!loadResult.value) {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue("item not found", {
          code: errorCode,
          path: ["targetExpression"],
        }),
      ]),
    );
  }

  return Result.ok(loadResult.value);
}

async function loadSiblings(
  placement: Placement,
  itemRepository: ItemRepository,
): Promise<Result<ReadonlyArray<Item>, RepositoryError>> {
  return await itemRepository.listByPlacement({
    kind: "single",
    at: placement,
  });
}

/**
 * Calculate rank for head: positioning.
 * Places item before all existing items.
 */
async function calculateRankForHead(
  placementExpr: string,
  cwd: Placement,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetPlacementAndRank, MoveItemError>> {
  const placementResult = await resolvePlacementExpression(
    placementExpr,
    "head: placement",
    cwd,
    pathResolver,
  );
  if (placementResult.type === "error") {
    return Result.error(placementResult.error);
  }

  const targetPlacement = placementResult.value;

  const siblingsResult = await loadSiblings(targetPlacement, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.headRank(existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    placement: targetPlacement,
    rank: rankResult.value,
  });
}

/**
 * Calculate rank for tail: positioning.
 * Places item after all existing items.
 */
async function calculateRankForTail(
  placementExpr: string,
  cwd: Placement,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetPlacementAndRank, MoveItemError>> {
  const placementResult = await resolvePlacementExpression(
    placementExpr,
    "tail: placement",
    cwd,
    pathResolver,
  );
  if (placementResult.type === "error") {
    return Result.error(placementResult.error);
  }

  const targetPlacement = placementResult.value;

  const siblingsResult = await loadSiblings(targetPlacement, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    placement: targetPlacement,
    rank: rankResult.value,
  });
}

/**
 * Calculate rank for after: positioning.
 */
async function calculateRankForAfter(
  itemExpr: string,
  cwd: Placement,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetPlacementAndRank, MoveItemError>> {
  const refPlacementResult = await resolvePlacementExpression(
    itemExpr,
    "after: item",
    cwd,
    pathResolver,
  );
  if (refPlacementResult.type === "error") {
    return Result.error(refPlacementResult.error);
  }

  const refItemResult = await loadItemFromPlacement(
    refPlacementResult.value,
    deps.itemRepository,
    "invalid_reference_item",
  );
  if (refItemResult.type === "error") {
    return Result.error(refItemResult.error);
  }

  const refItem = refItemResult.value;
  const targetPlacement = refItem.data.placement;

  const siblingsResult = await loadSiblings(targetPlacement, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const sortedSiblings = siblingsResult.value.slice().sort((a, b) =>
    deps.rankService.compareRanks(a.data.rank, b.data.rank)
  );
  const refIndex = sortedSiblings.findIndex((s) =>
    s.data.id.toString() === refItem.data.id.toString()
  );

  const nextItem = sortedSiblings[refIndex + 1];
  const rankResult = nextItem
    ? deps.rankService.betweenRanks(refItem.data.rank, nextItem.data.rank)
    : deps.rankService.nextRank(refItem.data.rank);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    placement: targetPlacement,
    rank: rankResult.value,
  });
}

/**
 * Calculate rank for before: positioning.
 */
async function calculateRankForBefore(
  itemExpr: string,
  cwd: Placement,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetPlacementAndRank, MoveItemError>> {
  const refPlacementResult = await resolvePlacementExpression(
    itemExpr,
    "before: item",
    cwd,
    pathResolver,
  );
  if (refPlacementResult.type === "error") {
    return Result.error(refPlacementResult.error);
  }

  const refItemResult = await loadItemFromPlacement(
    refPlacementResult.value,
    deps.itemRepository,
    "invalid_reference_item",
  );
  if (refItemResult.type === "error") {
    return Result.error(refItemResult.error);
  }

  const refItem = refItemResult.value;
  const targetPlacement = refItem.data.placement;

  const siblingsResult = await loadSiblings(targetPlacement, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const sortedSiblings = siblingsResult.value.slice().sort((a, b) =>
    deps.rankService.compareRanks(a.data.rank, b.data.rank)
  );
  const refIndex = sortedSiblings.findIndex((s) =>
    s.data.id.toString() === refItem.data.id.toString()
  );

  const prevItem = sortedSiblings[refIndex - 1];
  const rankResult = prevItem
    ? deps.rankService.betweenRanks(prevItem.data.rank, refItem.data.rank)
    : deps.rankService.prevRank(refItem.data.rank);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    placement: targetPlacement,
    rank: rankResult.value,
  });
}

/**
 * Default behavior when no positioning prefix is specified: moves item to tail of target placement.
 */
async function calculateRankForRegularPlacement(
  targetExpression: string,
  cwd: Placement,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetPlacementAndRank, MoveItemError>> {
  const targetExprResult = parsePathExpression(targetExpression);
  if (targetExprResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `invalid target expression: ${
            targetExprResult.error.issues.map((i) => i.message).join(", ")
          }`,
          {
            code: "invalid_target_expression",
            path: ["targetExpression"],
          },
        ),
      ]),
    );
  }

  const targetPlacementResult = await pathResolver.resolvePath(cwd, targetExprResult.value);
  if (targetPlacementResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `failed to resolve target: ${
            targetPlacementResult.error.issues.map((i) => i.message).join(", ")
          }`,
          {
            code: "target_resolution_failed",
            path: ["targetExpression"],
          },
        ),
      ]),
    );
  }

  const targetPlacement = targetPlacementResult.value;

  const siblingsResult = await loadSiblings(targetPlacement, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    placement: targetPlacement,
    rank: rankResult.value,
  });
}

/**
 * Routes to appropriate rank calculation strategy based on target expression prefix.
 */
async function determineTargetPlacementAndRank(
  targetExpression: string,
  cwd: Placement,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetPlacementAndRank, MoveItemError>> {
  if (targetExpression.startsWith("head:")) {
    const placementExpr = targetExpression.slice(5);
    return await calculateRankForHead(placementExpr, cwd, pathResolver, deps);
  }

  if (targetExpression.startsWith("tail:")) {
    const placementExpr = targetExpression.slice(5);
    return await calculateRankForTail(placementExpr, cwd, pathResolver, deps);
  }

  if (targetExpression.startsWith("after:")) {
    const itemExpr = targetExpression.slice(6);
    return await calculateRankForAfter(itemExpr, cwd, pathResolver, deps);
  }

  if (targetExpression.startsWith("before:")) {
    const itemExpr = targetExpression.slice(7);
    return await calculateRankForBefore(itemExpr, cwd, pathResolver, deps);
  }

  return await calculateRankForRegularPlacement(targetExpression, cwd, pathResolver, deps);
}

export const MoveItemWorkflow = {
  async execute(
    input: MoveItemInput,
    deps: MoveItemDependencies,
  ): Promise<Result<MoveItemResult, MoveItemError>> {
    const today = input.today ?? new Date();

    // Resolve timezone
    const timezoneResult = input.timezone
      ? Result.ok(input.timezone)
      : parseTimezoneIdentifier("UTC");
    if (timezoneResult.type === "error") {
      return Result.error(
        createValidationError("MoveItem", timezoneResult.error.issues),
      );
    }

    const pathResolver = createPathResolver({
      aliasRepository: deps.aliasRepository,
      itemRepository: deps.itemRepository,
      timezone: timezoneResult.value,
      today,
    });

    // Resolve item to move
    const itemExprResult = parsePathExpression(input.itemExpression);
    if (itemExprResult.type === "error") {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue(
            `invalid item expression: ${
              itemExprResult.error.issues.map((i) => i.message).join(", ")
            }`,
            {
              code: "invalid_item_expression",
              path: ["itemExpression"],
            },
          ),
        ]),
      );
    }

    const itemPlacementResult = await pathResolver.resolvePath(
      input.cwd,
      itemExprResult.value,
    );
    if (itemPlacementResult.type === "error") {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue(
            `failed to resolve item: ${
              itemPlacementResult.error.issues.map((i) => i.message).join(", ")
            }`,
            {
              code: "item_resolution_failed",
              path: ["itemExpression"],
            },
          ),
        ]),
      );
    }

    const itemResult = await loadItemFromPlacement(
      itemPlacementResult.value,
      deps.itemRepository,
      "not_an_item",
    );
    if (itemResult.type === "error") {
      return Result.error(itemResult.error);
    }

    const item = itemResult.value;

    // Determine target placement and rank
    const targetResult = await determineTargetPlacementAndRank(
      input.targetExpression,
      input.cwd,
      pathResolver,
      deps,
    );
    if (targetResult.type === "error") {
      return Result.error(targetResult.error);
    }

    // Relocate and save
    const relocated = item.relocate(
      targetResult.value.placement,
      targetResult.value.rank,
      input.occurredAt,
    );

    const saveResult = await deps.itemRepository.save(relocated);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }

    return Result.ok({
      item: relocated,
    });
  },
};
