import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { DateTime } from "../primitives/date_time.ts";
import { Placement } from "../primitives/placement.ts";
import { parseTimezoneIdentifier, TimezoneIdentifier } from "../primitives/timezone_identifier.ts";
import { parsePathExpression } from "../../presentation/cli/path_parser.ts";
import { createPathResolver } from "../services/path_resolver.ts";
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

export const MoveItemWorkflow = {
  async execute(
    input: MoveItemInput,
    deps: MoveItemDependencies,
  ): Promise<Result<MoveItemResult, MoveItemError>> {
    const today = input.today ?? new Date();

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

    // 1. Resolve item expression
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

    // Get item by ID (placement head must be an item)
    if (itemPlacementResult.value.head.kind !== "item") {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue("item expression must resolve to an item, not a date", {
            code: "not_an_item",
            path: ["itemExpression"],
          }),
        ]),
      );
    }

    const loadResult = await deps.itemRepository.load(itemPlacementResult.value.head.id);
    if (loadResult.type === "error") {
      return Result.error(loadResult.error);
    }

    if (!loadResult.value) {
      return Result.error(
        createValidationError("MoveItem", [
          createValidationIssue("item not found", {
            code: "item_not_found",
            path: ["itemExpression"],
          }),
        ]),
      );
    }

    const item = loadResult.value;

    // 2. Parse target expression (handle special prefixes: head:, tail:, after:, before:)
    let targetPlacement: Placement;
    let newRank;

    // Check for special positioning syntax
    if (input.targetExpression.startsWith("head:")) {
      // head:placement - move to head (minimum rank) of specified placement
      const placementExpr = input.targetExpression.slice(5); // Remove "head:" prefix
      const exprResult = parsePathExpression(placementExpr);
      if (exprResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `invalid head: placement expression: ${
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

      const placementResult = await pathResolver.resolvePath(input.cwd, exprResult.value);
      if (placementResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `failed to resolve head: placement: ${
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

      targetPlacement = placementResult.value;
      const rankResult = deps.rankService.minRank();
      if (rankResult.type === "error") {
        return Result.error(createValidationError("MoveItem", rankResult.error.issues));
      }
      newRank = rankResult.value;
    } else if (input.targetExpression.startsWith("tail:")) {
      // tail:placement - move to tail (maximum rank) of specified placement
      const placementExpr = input.targetExpression.slice(5); // Remove "tail:" prefix
      const exprResult = parsePathExpression(placementExpr);
      if (exprResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `invalid tail: placement expression: ${
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

      const placementResult = await pathResolver.resolvePath(input.cwd, exprResult.value);
      if (placementResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `failed to resolve tail: placement: ${
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

      targetPlacement = placementResult.value;
      const rankResult = deps.rankService.maxRank();
      if (rankResult.type === "error") {
        return Result.error(createValidationError("MoveItem", rankResult.error.issues));
      }
      newRank = rankResult.value;
    } else if (
      input.targetExpression.startsWith("after:") || input.targetExpression.startsWith("before:")
    ) {
      // after:item or before:item - move relative to another item
      const isAfter = input.targetExpression.startsWith("after:");
      const itemExpr = input.targetExpression.slice(isAfter ? 6 : 7);

      const exprResult = parsePathExpression(itemExpr);
      if (exprResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `invalid ${isAfter ? "after" : "before"}: item expression: ${
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

      const refPlacementResult = await pathResolver.resolvePath(input.cwd, exprResult.value);
      if (refPlacementResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `failed to resolve ${isAfter ? "after" : "before"}: item: ${
                refPlacementResult.error.issues.map((i) => i.message).join(", ")
              }`,
              {
                code: "target_resolution_failed",
                path: ["targetExpression"],
              },
            ),
          ]),
        );
      }

      if (refPlacementResult.value.head.kind !== "item") {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue(
              `${isAfter ? "after" : "before"}: target must be an item, not a date`,
              {
                code: "invalid_reference_item",
                path: ["targetExpression"],
              },
            ),
          ]),
        );
      }

      const refItemResult = await deps.itemRepository.load(refPlacementResult.value.head.id);
      if (refItemResult.type === "error") {
        return Result.error(refItemResult.error);
      }
      if (!refItemResult.value) {
        return Result.error(
          createValidationError("MoveItem", [
            createValidationIssue("reference item not found", {
              code: "reference_item_not_found",
              path: ["targetExpression"],
            }),
          ]),
        );
      }

      const refItem = refItemResult.value;
      targetPlacement = refItem.data.placement;

      // Load all siblings at the target placement to find adjacent items
      const siblingsResult = await deps.itemRepository.listByPlacement({
        kind: "single",
        at: targetPlacement,
      });
      if (siblingsResult.type === "error") {
        return Result.error(siblingsResult.error);
      }

      const siblings = siblingsResult.value;
      // Sort siblings by rank to find adjacent items
      const sortedSiblings = siblings.slice().sort((a, b) =>
        deps.rankService.compareRanks(a.data.rank, b.data.rank)
      );

      // Find the reference item's index in sorted siblings
      const refIndex = sortedSiblings.findIndex((s) =>
        s.data.id.toString() === refItem.data.id.toString()
      );

      let rankResult;
      if (isAfter) {
        // Moving after reference item: find next item and generate rank between
        const nextItem = sortedSiblings[refIndex + 1];
        if (nextItem) {
          // Generate rank between reference item and next item
          rankResult = deps.rankService.betweenRanks(refItem.data.rank, nextItem.data.rank);
        } else {
          // No next item, append after reference item
          rankResult = deps.rankService.nextRank(refItem.data.rank);
        }
      } else {
        // Moving before reference item: find previous item and generate rank between
        const prevItem = sortedSiblings[refIndex - 1];
        if (prevItem) {
          // Generate rank between previous item and reference item
          rankResult = deps.rankService.betweenRanks(prevItem.data.rank, refItem.data.rank);
        } else {
          // No previous item, prepend before reference item
          rankResult = deps.rankService.prevRank(refItem.data.rank);
        }
      }

      if (rankResult.type === "error") {
        return Result.error(createValidationError("MoveItem", rankResult.error.issues));
      }
      newRank = rankResult.value;
    } else {
      // Regular placement expression
      const targetExprResult = parsePathExpression(input.targetExpression);
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

      const targetPlacementResult = await pathResolver.resolvePath(
        input.cwd,
        targetExprResult.value,
      );
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

      targetPlacement = targetPlacementResult.value;

      // Get new rank (at head of target placement)
      const newRankResult = deps.rankService.minRank();
      if (newRankResult.type === "error") {
        return Result.error(
          createValidationError("MoveItem", newRankResult.error.issues),
        );
      }
      newRank = newRankResult.value;
    }

    // 4. Relocate item
    const relocated = item.relocate(
      targetPlacement,
      newRank,
      input.occurredAt,
    );

    // 5. Save
    const saveResult = await deps.itemRepository.save(relocated);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }

    return Result.ok({
      item: relocated,
    });
  },
};
