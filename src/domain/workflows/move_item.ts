import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { ItemRank } from "../primitives/item_rank.ts";
import { Directory } from "../primitives/directory.ts";
import { parseTimezoneIdentifier, TimezoneIdentifier } from "../primitives/timezone_identifier.ts";
import { parsePathExpression } from "../../presentation/cli/path_parser.ts";
import { createPathResolver, PathResolver } from "../services/path_resolver.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RankService } from "../services/rank_service.ts";

export type MoveItemInput = Readonly<{
  itemExpression: string; // PathExpression to identify the item
  targetExpression: string; // PathExpression for target directory
  cwd: Directory;
  timezone?: TimezoneIdentifier;
  today?: Date;
  occurredAt: DateTime;
}>;

export type MoveItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type MoveItemValidationError = ValidationError<"MoveItem">;

export type MoveItemError = MoveItemValidationError | RepositoryError;

export type MoveItemResult = Readonly<{
  item: Item;
}>;

type TargetDirectoryAndRank = Readonly<{
  directory: Directory;
  rank: ItemRank;
}>;

async function resolveDirectoryExpression(
  expression: string,
  expressionType: string,
  cwd: Directory,
  pathResolver: PathResolver,
): Promise<Result<Directory, MoveItemValidationError>> {
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

  const directoryResult = await pathResolver.resolvePath(cwd, exprResult.value);
  if (directoryResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `failed to resolve ${expressionType}: ${
            directoryResult.error.issues.map((i) => i.message).join(", ")
          }`,
          {
            code: "target_resolution_failed",
            path: ["targetExpression"],
          },
        ),
      ]),
    );
  }

  return Result.ok(directoryResult.value);
}

async function loadItemFromDirectory(
  directory: Directory,
  itemRepository: ItemRepository,
  errorCode: string,
): Promise<Result<Item, MoveItemValidationError | RepositoryError>> {
  if (directory.head.kind !== "item") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue("item expression must resolve to an item, not a date", {
          code: errorCode,
          path: ["targetExpression"],
        }),
      ]),
    );
  }

  const loadResult = await itemRepository.load(directory.head.id);
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
  directory: Directory,
  itemRepository: ItemRepository,
): Promise<Result<ReadonlyArray<Item>, RepositoryError>> {
  return await itemRepository.listByDirectory({
    kind: "single",
    at: directory,
  });
}

/**
 * Calculate rank for head: positioning.
 * Places item before all existing items.
 */
async function calculateRankForHead(
  directoryExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetDirectoryAndRank, MoveItemError>> {
  const directoryResult = await resolveDirectoryExpression(
    directoryExpr,
    "head: directory",
    cwd,
    pathResolver,
  );
  if (directoryResult.type === "error") {
    return Result.error(directoryResult.error);
  }

  const targetDirectory = directoryResult.value;

  const siblingsResult = await loadSiblings(targetDirectory, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.headRank(existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: targetDirectory,
    rank: rankResult.value,
  });
}

/**
 * Calculate rank for tail: positioning.
 * Places item after all existing items.
 */
async function calculateRankForTail(
  directoryExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetDirectoryAndRank, MoveItemError>> {
  const directoryResult = await resolveDirectoryExpression(
    directoryExpr,
    "tail: directory",
    cwd,
    pathResolver,
  );
  if (directoryResult.type === "error") {
    return Result.error(directoryResult.error);
  }

  const targetDirectory = directoryResult.value;

  const siblingsResult = await loadSiblings(targetDirectory, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: targetDirectory,
    rank: rankResult.value,
  });
}

/**
 * Calculate rank for after: positioning.
 */
async function calculateRankForAfter(
  itemExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetDirectoryAndRank, MoveItemError>> {
  const refDirectoryResult = await resolveDirectoryExpression(
    itemExpr,
    "after: item",
    cwd,
    pathResolver,
  );
  if (refDirectoryResult.type === "error") {
    return Result.error(refDirectoryResult.error);
  }

  const refItemResult = await loadItemFromDirectory(
    refDirectoryResult.value,
    deps.itemRepository,
    "invalid_reference_item",
  );
  if (refItemResult.type === "error") {
    return Result.error(refItemResult.error);
  }

  const refItem = refItemResult.value;
  const targetDirectory = refItem.data.directory;

  const siblingsResult = await loadSiblings(targetDirectory, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.afterRank(refItem.data.rank, existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: targetDirectory,
    rank: rankResult.value,
  });
}

/**
 * Calculate rank for before: positioning.
 */
async function calculateRankForBefore(
  itemExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetDirectoryAndRank, MoveItemError>> {
  const refDirectoryResult = await resolveDirectoryExpression(
    itemExpr,
    "before: item",
    cwd,
    pathResolver,
  );
  if (refDirectoryResult.type === "error") {
    return Result.error(refDirectoryResult.error);
  }

  const refItemResult = await loadItemFromDirectory(
    refDirectoryResult.value,
    deps.itemRepository,
    "invalid_reference_item",
  );
  if (refItemResult.type === "error") {
    return Result.error(refItemResult.error);
  }

  const refItem = refItemResult.value;
  const targetDirectory = refItem.data.directory;

  const siblingsResult = await loadSiblings(targetDirectory, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.beforeRank(refItem.data.rank, existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: targetDirectory,
    rank: rankResult.value,
  });
}

/**
 * Default behavior when no positioning prefix is specified: moves item to tail of target directory.
 */
async function calculateRankForRegularDirectory(
  targetExpression: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetDirectoryAndRank, MoveItemError>> {
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

  const targetDirectoryResult = await pathResolver.resolvePath(cwd, targetExprResult.value);
  if (targetDirectoryResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `failed to resolve target: ${
            targetDirectoryResult.error.issues.map((i) => i.message).join(", ")
          }`,
          {
            code: "target_resolution_failed",
            path: ["targetExpression"],
          },
        ),
      ]),
    );
  }

  const targetDirectory = targetDirectoryResult.value;

  const siblingsResult = await loadSiblings(targetDirectory, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);

  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: targetDirectory,
    rank: rankResult.value,
  });
}

/**
 * Routes to appropriate rank calculation strategy based on target expression prefix.
 */
async function determineTargetDirectoryAndRank(
  targetExpression: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDependencies,
): Promise<Result<TargetDirectoryAndRank, MoveItemError>> {
  if (targetExpression.startsWith("head:")) {
    const directoryExpr = targetExpression.slice(5);
    return await calculateRankForHead(directoryExpr, cwd, pathResolver, deps);
  }

  if (targetExpression.startsWith("tail:")) {
    const directoryExpr = targetExpression.slice(5);
    return await calculateRankForTail(directoryExpr, cwd, pathResolver, deps);
  }

  if (targetExpression.startsWith("after:")) {
    const itemExpr = targetExpression.slice(6);
    return await calculateRankForAfter(itemExpr, cwd, pathResolver, deps);
  }

  if (targetExpression.startsWith("before:")) {
    const itemExpr = targetExpression.slice(7);
    return await calculateRankForBefore(itemExpr, cwd, pathResolver, deps);
  }

  return await calculateRankForRegularDirectory(targetExpression, cwd, pathResolver, deps);
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
      prefixCandidates: deps.prefixCandidates,
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

    const itemDirectoryResult = await pathResolver.resolvePath(
      input.cwd,
      itemExprResult.value,
    );
    if (itemDirectoryResult.type === "error") {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue(
            `failed to resolve item: ${
              itemDirectoryResult.error.issues.map((i) => i.message).join(", ")
            }`,
            {
              code: "item_resolution_failed",
              path: ["itemExpression"],
            },
          ),
        ]),
      );
    }

    const itemResult = await loadItemFromDirectory(
      itemDirectoryResult.value,
      deps.itemRepository,
      "not_an_item",
    );
    if (itemResult.type === "error") {
      return Result.error(itemResult.error);
    }

    const item = itemResult.value;

    // Determine target directory and rank
    const targetResult = await determineTargetDirectoryAndRank(
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
      targetResult.value.directory,
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
