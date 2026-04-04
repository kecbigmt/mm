import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../../domain/models/item.ts";
import {
  DateTime,
  Directory,
  ItemRank,
  parseTimezoneIdentifier,
  TimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { parsePathExpression } from "../../domain/primitives/path_expression_parser.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createPathResolver, PathResolver } from "../../domain/services/path_resolver.ts";
import { RankService } from "../../domain/services/rank_service.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type MoveItemRequest = Readonly<{
  itemLocator: string;
  destination: string;
  cwd: Directory;
  timezone?: TimezoneIdentifier;
  today?: Date;
  occurredAt: DateTime;
}>;

export type MoveItemDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type MoveItemApplicationError = ValidationError<"MoveItem"> | RepositoryError;

export type MoveItemResponse = Readonly<{
  item: ItemDto;
}>;

type TargetDirectoryAndRank = Readonly<{
  directory: Directory;
  rank: ItemRank;
}>;

const resolveDirectoryExpression = async (
  expression: string,
  expressionType: string,
  cwd: Directory,
  pathResolver: PathResolver,
): Promise<Result<Directory, MoveItemApplicationError>> => {
  const exprResult = parsePathExpression(expression);
  if (exprResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `invalid ${expressionType} expression: ${
            exprResult.error.issues.map((issue) => issue.message).join(", ")
          }`,
          {
            code: "invalid_target_expression",
            path: ["destination"],
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
            directoryResult.error.issues.map((issue) => issue.message).join(", ")
          }`,
          {
            code: "target_resolution_failed",
            path: ["destination"],
          },
        ),
      ]),
    );
  }

  return Result.ok(directoryResult.value);
};

const loadItemFromDirectory = async (
  directory: Directory,
  itemRepository: ItemRepository,
  errorCode: string,
): Promise<Result<Item, MoveItemApplicationError>> => {
  if (directory.head.kind !== "item") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue("item expression must resolve to an item, not a date", {
          code: errorCode,
          path: ["destination"],
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
          path: ["destination"],
        }),
      ]),
    );
  }

  return Result.ok(loadResult.value);
};

const loadSiblings = (
  directory: Directory,
  itemRepository: ItemRepository,
): Promise<Result<ReadonlyArray<Item>, RepositoryError>> =>
  itemRepository.listByDirectory({ kind: "single", at: directory });

const calculateRankForHead = async (
  directoryExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDeps,
): Promise<Result<TargetDirectoryAndRank, MoveItemApplicationError>> => {
  const directoryResult = await resolveDirectoryExpression(
    directoryExpr,
    "head: directory",
    cwd,
    pathResolver,
  );
  if (directoryResult.type === "error") {
    return Result.error(directoryResult.error);
  }

  const siblingsResult = await loadSiblings(directoryResult.value, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const rankResult = deps.rankService.headRank(
    siblingsResult.value.map((item) => item.data.rank),
  );
  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: directoryResult.value,
    rank: rankResult.value,
  });
};

const calculateRankForTail = async (
  directoryExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDeps,
): Promise<Result<TargetDirectoryAndRank, MoveItemApplicationError>> => {
  const directoryResult = await resolveDirectoryExpression(
    directoryExpr,
    "tail: directory",
    cwd,
    pathResolver,
  );
  if (directoryResult.type === "error") {
    return Result.error(directoryResult.error);
  }

  const siblingsResult = await loadSiblings(directoryResult.value, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const rankResult = deps.rankService.tailRank(
    siblingsResult.value.map((item) => item.data.rank),
  );
  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: directoryResult.value,
    rank: rankResult.value,
  });
};

const calculateRankForAfter = async (
  itemExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDeps,
): Promise<Result<TargetDirectoryAndRank, MoveItemApplicationError>> => {
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

  const siblingsResult = await loadSiblings(
    refItemResult.value.data.directory,
    deps.itemRepository,
  );
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const rankResult = deps.rankService.afterRank(
    refItemResult.value.data.rank,
    siblingsResult.value.map((item) => item.data.rank),
  );
  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: refItemResult.value.data.directory,
    rank: rankResult.value,
  });
};

const calculateRankForBefore = async (
  itemExpr: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDeps,
): Promise<Result<TargetDirectoryAndRank, MoveItemApplicationError>> => {
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

  const siblingsResult = await loadSiblings(
    refItemResult.value.data.directory,
    deps.itemRepository,
  );
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const rankResult = deps.rankService.beforeRank(
    refItemResult.value.data.rank,
    siblingsResult.value.map((item) => item.data.rank),
  );
  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: refItemResult.value.data.directory,
    rank: rankResult.value,
  });
};

const calculateRankForRegularDirectory = async (
  destination: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDeps,
): Promise<Result<TargetDirectoryAndRank, MoveItemApplicationError>> => {
  const targetExprResult = parsePathExpression(destination);
  if (targetExprResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `invalid target expression: ${
            targetExprResult.error.issues.map((issue) => issue.message).join(", ")
          }`,
          {
            code: "invalid_target_expression",
            path: ["destination"],
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
            targetDirectoryResult.error.issues.map((issue) => issue.message).join(", ")
          }`,
          {
            code: "target_resolution_failed",
            path: ["destination"],
          },
        ),
      ]),
    );
  }

  const siblingsResult = await loadSiblings(targetDirectoryResult.value, deps.itemRepository);
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }

  const rankResult = deps.rankService.tailRank(
    siblingsResult.value.map((item) => item.data.rank),
  );
  if (rankResult.type === "error") {
    return Result.error(createValidationError("MoveItem", rankResult.error.issues));
  }

  return Result.ok({
    directory: targetDirectoryResult.value,
    rank: rankResult.value,
  });
};

const determineTargetDirectoryAndRank = async (
  destination: string,
  cwd: Directory,
  pathResolver: PathResolver,
  deps: MoveItemDeps,
): Promise<Result<TargetDirectoryAndRank, MoveItemApplicationError>> => {
  if (destination.startsWith("head:")) {
    return await calculateRankForHead(destination.slice(5), cwd, pathResolver, deps);
  }
  if (destination.startsWith("tail:")) {
    return await calculateRankForTail(destination.slice(5), cwd, pathResolver, deps);
  }
  if (destination.startsWith("after:")) {
    return await calculateRankForAfter(destination.slice(6), cwd, pathResolver, deps);
  }
  if (destination.startsWith("before:")) {
    return await calculateRankForBefore(destination.slice(7), cwd, pathResolver, deps);
  }
  return await calculateRankForRegularDirectory(destination, cwd, pathResolver, deps);
};

export const moveItem = async (
  input: MoveItemRequest,
  deps: MoveItemDeps,
): Promise<Result<MoveItemResponse, MoveItemApplicationError>> => {
  const today = input.today ?? new Date();
  const timezoneResult = input.timezone
    ? Result.ok(input.timezone)
    : parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") {
    return Result.error(createValidationError("MoveItem", timezoneResult.error.issues));
  }

  const pathResolver = createPathResolver({
    aliasRepository: deps.aliasRepository,
    itemRepository: deps.itemRepository,
    timezone: timezoneResult.value,
    today,
    prefixCandidates: deps.prefixCandidates,
  });

  const itemExprResult = parsePathExpression(input.itemLocator);
  if (itemExprResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `invalid item expression: ${
            itemExprResult.error.issues.map((issue) => issue.message).join(", ")
          }`,
          {
            code: "invalid_item_expression",
            path: ["itemLocator"],
          },
        ),
      ]),
    );
  }

  const itemDirectoryResult = await pathResolver.resolvePath(input.cwd, itemExprResult.value);
  if (itemDirectoryResult.type === "error") {
    return Result.error(
      createValidationError("MoveItem", [
        createValidationIssue(
          `failed to resolve item: ${
            itemDirectoryResult.error.issues.map((issue) => issue.message).join(", ")
          }`,
          {
            code: "item_resolution_failed",
            path: ["itemLocator"],
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

  const targetResult = await determineTargetDirectoryAndRank(
    input.destination,
    input.cwd,
    pathResolver,
    deps,
  );
  if (targetResult.type === "error") {
    return Result.error(targetResult.error);
  }

  const relocated = itemResult.value.relocate(
    targetResult.value.directory,
    targetResult.value.rank,
    input.occurredAt,
  );
  const saveResult = await deps.itemRepository.save(relocated);
  if (saveResult.type === "error") {
    return Result.error(saveResult.error);
  }

  return Result.ok(
    Object.freeze({
      item: toItemDto(relocated),
    }),
  );
};
