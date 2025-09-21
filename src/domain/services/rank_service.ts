import { Result } from "../../shared/result.ts";
import { ItemRank, itemRankFromString, ItemRankValidationError } from "../primitives/item_rank.ts";

/**
 * External rank generation interface
 * This interface abstracts the lexorank library dependency
 */
export interface RankGenerator {
  min(): string;
  max(): string;
  middle(): string;
  between(first: string, second: string): string;
  next(rank: string): string;
  prev(rank: string): string;
  compare(first: string, second: string): number;
}

/**
 * Rank service interface for managing item ranks
 */
export interface RankService {
  minRank(): Result<ItemRank, ItemRankValidationError>;
  maxRank(): Result<ItemRank, ItemRankValidationError>;
  middleRank(): Result<ItemRank, ItemRankValidationError>;
  betweenRanks(first: ItemRank, second: ItemRank): Result<ItemRank, ItemRankValidationError>;
  nextRank(rank: ItemRank): Result<ItemRank, ItemRankValidationError>;
  prevRank(rank: ItemRank): Result<ItemRank, ItemRankValidationError>;
  compareRanks(first: ItemRank, second: ItemRank): number;
  generateEquallySpacedRanks(count: number): Result<ItemRank[], ItemRankValidationError>;
}

/**
 * Create a pure rank service with dependency injection
 * @param generator - External rank generation implementation
 */
export function createRankService(generator: RankGenerator): RankService {
  const minRank = (): Result<ItemRank, ItemRankValidationError> => {
    return itemRankFromString(generator.min());
  };

  const maxRank = (): Result<ItemRank, ItemRankValidationError> => {
    return itemRankFromString(generator.max());
  };

  const middleRank = (): Result<ItemRank, ItemRankValidationError> => {
    return itemRankFromString(generator.middle());
  };

  const betweenRanks = (
    first: ItemRank,
    second: ItemRank,
  ): Result<ItemRank, ItemRankValidationError> => {
    const betweenValue = generator.between(first.toString(), second.toString());
    return itemRankFromString(betweenValue);
  };

  const nextRank = (rank: ItemRank): Result<ItemRank, ItemRankValidationError> => {
    const nextValue = generator.next(rank.toString());
    return itemRankFromString(nextValue);
  };

  const prevRank = (rank: ItemRank): Result<ItemRank, ItemRankValidationError> => {
    const prevValue = generator.prev(rank.toString());
    return itemRankFromString(prevValue);
  };

  const compareRanks = (first: ItemRank, second: ItemRank): number => {
    return generator.compare(first.toString(), second.toString());
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
    let currentValue = generator.min();

    for (let i = 0; i < count; i++) {
      const rankResult = itemRankFromString(currentValue);
      if (rankResult.type === "error") {
        return Result.error(rankResult.error);
      }
      ranks.push(rankResult.value);

      if (i < count - 1) {
        currentValue = generator.next(currentValue);
      }
    }

    return Result.ok(ranks);
  };

  return {
    minRank,
    maxRank,
    middleRank,
    betweenRanks,
    nextRank,
    prevRank,
    compareRanks,
    generateEquallySpacedRanks,
  };
}
