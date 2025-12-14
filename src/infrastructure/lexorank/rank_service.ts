import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import {
  ItemRank,
  itemRankFromString,
  ItemRankValidationError,
} from "../../domain/primitives/item_rank.ts";
import type { RankService } from "../../domain/services/rank_service.ts";
import lexorank from "lexorank";

const { LexoRank } = lexorank;

export type RankBoundaryError = ValidationError<"RankBoundary">;
export type RankServiceError = ItemRankValidationError | RankBoundaryError;

/**
 * Lexorank-based implementation of RankService.
 * All rank calculation logic and boundary validation is encapsulated here.
 */
export function createLexoRankService(): RankService {
  // Internal helper: parse ItemRank to LexoRank
  const toLexoRank = (rank: ItemRank) => LexoRank.parse(rank.toString());

  // Internal helper: compare two ItemRanks
  const compare = (first: ItemRank, second: ItemRank): number => {
    const firstLexo = toLexoRank(first);
    const secondLexo = toLexoRank(second);

    if (firstLexo.equals(secondLexo)) {
      return 0;
    }
    return firstLexo.compareTo(secondLexo);
  };

  // Internal helper: get middle rank
  const middleRank = (): Result<ItemRank, ItemRankValidationError> => {
    return itemRankFromString(LexoRank.middle().toString());
  };

  // Internal helper: generate rank between two ranks
  const betweenRanks = (
    first: ItemRank,
    second: ItemRank,
  ): Result<ItemRank, RankServiceError> => {
    // Check for duplicate ranks
    // Note: ItemRank.toString() returns canonical representations (guaranteed by smart constructor)
    if (compare(first, second) === 0) {
      return Result.error(
        createValidationError("RankBoundary", [
          createValidationIssue(
            "Cannot generate rank between identical ranks.",
            {
              code: "duplicate_ranks",
              path: ["rank"],
            },
          ),
        ]),
      );
    }

    const firstLexo = toLexoRank(first);
    const secondLexo = toLexoRank(second);
    return itemRankFromString(firstLexo.between(secondLexo).toString());
  };

  // Internal helper: generate next rank
  const nextRank = (rank: ItemRank): Result<ItemRank, RankServiceError> => {
    // Check if already at maximum
    const maxLexo = LexoRank.max();
    const rankLexo = toLexoRank(rank);

    if (rankLexo.equals(maxLexo)) {
      return Result.error(
        createValidationError("RankBoundary", [
          createValidationIssue(
            "Cannot generate next rank: already at maximum boundary.",
            {
              code: "no_headroom",
              path: ["rank"],
            },
          ),
        ]),
      );
    }

    return itemRankFromString(rankLexo.genNext().toString());
  };

  // Internal helper: generate previous rank
  const prevRank = (rank: ItemRank): Result<ItemRank, RankServiceError> => {
    // Check if already at minimum
    const minLexo = LexoRank.min();
    const rankLexo = toLexoRank(rank);

    if (rankLexo.equals(minLexo)) {
      return Result.error(
        createValidationError("RankBoundary", [
          createValidationIssue(
            "Cannot generate previous rank: already at minimum boundary.",
            {
              code: "no_headroom",
              path: ["rank"],
            },
          ),
        ]),
      );
    }

    return itemRankFromString(rankLexo.genPrev().toString());
  };

  // Public API implementation
  const headRank = (
    existingRanks: ReadonlyArray<ItemRank>,
  ): Result<ItemRank, RankServiceError> => {
    if (existingRanks.length === 0) {
      return middleRank();
    }
    const sorted = existingRanks.slice().sort(compare);
    return prevRank(sorted[0]);
  };

  const tailRank = (
    existingRanks: ReadonlyArray<ItemRank>,
  ): Result<ItemRank, RankServiceError> => {
    if (existingRanks.length === 0) {
      return middleRank();
    }
    const sorted = existingRanks.slice().sort(compare);
    return nextRank(sorted[sorted.length - 1]);
  };

  const beforeRank = (
    targetRank: ItemRank,
    existingRanks: ReadonlyArray<ItemRank>,
  ): Result<ItemRank, RankServiceError> => {
    const sorted = existingRanks.slice().sort(compare);
    const targetIndex = sorted.findIndex((rank) => compare(rank, targetRank) === 0);

    if (targetIndex === -1) {
      return Result.error(
        createValidationError("RankBoundary", [
          createValidationIssue("Target rank not found in existing ranks", {
            code: "target_not_found",
            path: ["targetRank"],
          }),
        ]),
      );
    }

    const prevItem = sorted[targetIndex - 1];
    return prevItem ? betweenRanks(prevItem, targetRank) : prevRank(targetRank);
  };

  const afterRank = (
    targetRank: ItemRank,
    existingRanks: ReadonlyArray<ItemRank>,
  ): Result<ItemRank, RankServiceError> => {
    const sorted = existingRanks.slice().sort(compare);
    const targetIndex = sorted.findIndex((rank) => compare(rank, targetRank) === 0);

    if (targetIndex === -1) {
      return Result.error(
        createValidationError("RankBoundary", [
          createValidationIssue("Target rank not found in existing ranks", {
            code: "target_not_found",
            path: ["targetRank"],
          }),
        ]),
      );
    }

    const nextItem = sorted[targetIndex + 1];
    return nextItem ? betweenRanks(targetRank, nextItem) : nextRank(targetRank);
  };

  const compareRanks = (first: ItemRank, second: ItemRank): number => {
    return compare(first, second);
  };

  const generateEquallySpacedRanks = (
    count: number,
  ): Result<ItemRank[], ItemRankValidationError> => {
    if (count <= 0) {
      return Result.ok([]);
    }

    if (count === 1) {
      const middleResult = middleRank();
      if (middleResult.type === "error") {
        return Result.error(middleResult.error);
      }
      return Result.ok([middleResult.value]);
    }

    const ranks: ItemRank[] = [];
    let current = LexoRank.min();

    for (let i = 0; i < count; i++) {
      const rankResult = itemRankFromString(current.toString());
      if (rankResult.type === "error") {
        return Result.error(rankResult.error);
      }
      ranks.push(rankResult.value);

      if (i < count - 1) {
        current = current.genNext();
      }
    }

    return Result.ok(ranks);
  };

  return {
    headRank,
    tailRank,
    beforeRank,
    afterRank,
    compareRanks,
    generateEquallySpacedRanks,
  };
}
