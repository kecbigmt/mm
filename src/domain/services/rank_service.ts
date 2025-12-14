import { Result } from "../../shared/result.ts";
import { ValidationError } from "../../shared/errors.ts";
import { ItemRank, ItemRankValidationError } from "../primitives/item_rank.ts";

export type RankBoundaryError = ValidationError<"RankBoundary">;
export type RankServiceError = ItemRankValidationError | RankBoundaryError;

/**
 * Rank service interface for managing item ranks.
 * All operations that could reach rank boundaries return errors instead of duplicates.
 *
 * This is a domain service interface. The implementation is in the infrastructure layer
 * to encapsulate the specific ranking algorithm (e.g., Lexorank).
 */
export interface RankService {
  /**
   * Calculate rank for placing an item at the head of a list.
   * Returns middle rank if list is empty, otherwise returns rank before first item.
   */
  headRank(existingRanks: ReadonlyArray<ItemRank>): Result<ItemRank, RankServiceError>;

  /**
   * Calculate rank for placing an item at the tail of a list.
   * Returns middle rank if list is empty, otherwise returns rank after last item.
   */
  tailRank(existingRanks: ReadonlyArray<ItemRank>): Result<ItemRank, RankServiceError>;

  /**
   * Calculate rank for placing an item before a target item.
   * Returns error if target rank not found in existing ranks.
   */
  beforeRank(
    targetRank: ItemRank,
    existingRanks: ReadonlyArray<ItemRank>,
  ): Result<ItemRank, RankServiceError>;

  /**
   * Calculate rank for placing an item after a target item.
   * Returns error if target rank not found in existing ranks.
   */
  afterRank(
    targetRank: ItemRank,
    existingRanks: ReadonlyArray<ItemRank>,
  ): Result<ItemRank, RankServiceError>;

  /**
   * Compare two ranks.
   * Returns negative if first < second, 0 if equal, positive if first > second.
   */
  compareRanks(first: ItemRank, second: ItemRank): number;

  /**
   * Generate a list of equally spaced ranks.
   * Useful for initializing a new workspace or rebalancing ranks.
   */
  generateEquallySpacedRanks(count: number): Result<ItemRank[], ItemRankValidationError>;
}
