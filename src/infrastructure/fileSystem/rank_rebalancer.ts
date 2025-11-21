/**
 * Rank Rebalancer for doctor rebalance-rank command
 *
 * Redistributes LexoRank values evenly within a sibling group
 * to restore insertion headroom and optimize rank performance.
 */

import { Result } from "../../shared/result.ts";
import { Item } from "../../domain/models/item.ts";
import { ItemId, ItemRank } from "../../domain/primitives/mod.ts";
import { RankService } from "../../domain/services/rank_service.ts";

/**
 * Represents a rank update for a single item
 */
export type ItemRankUpdate = Readonly<{
  itemId: ItemId;
  oldRank: ItemRank;
  newRank: ItemRank;
}>;

/**
 * Error types for rebalance operations
 */
export type RebalanceError = Readonly<{
  kind: "rank_generation_failed" | "empty_group";
  message: string;
}>;

/**
 * Rebalance ranks for a group of sibling items
 *
 * Process:
 * 1. Sort siblings by current rank (with createdAt tiebreak for stability)
 * 2. Generate evenly-spaced new ranks using RankService
 * 3. Return updates only for items whose rank actually changed
 */
export const rebalanceGroup = (
  siblings: ReadonlyArray<Item>,
  rankService: RankService,
): Result<ReadonlyArray<ItemRankUpdate>, RebalanceError> => {
  if (siblings.length === 0) {
    return Result.ok([]);
  }

  // Sort siblings by current rank, with createdAt as tiebreak
  const sorted = [...siblings].sort((a, b) => {
    const rankComparison = a.data.rank.compare(b.data.rank);
    if (rankComparison !== 0) {
      return rankComparison;
    }
    // Use createdAt as tiebreak for stability
    return a.data.createdAt.toString().localeCompare(b.data.createdAt.toString());
  });

  // Generate evenly-spaced ranks
  const ranksResult = rankService.generateEquallySpacedRanks(sorted.length);
  if (ranksResult.type === "error") {
    return Result.error({
      kind: "rank_generation_failed",
      message: `failed to generate ranks: ${
        ranksResult.error.issues.map((i) => i.message).join(", ")
      }`,
    });
  }

  const newRanks = ranksResult.value;

  // Create updates only for items whose rank changed
  const updates: ItemRankUpdate[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const newRank = newRanks[i];

    // Only create update if rank actually changed
    if (item.data.rank.compare(newRank) !== 0) {
      updates.push({
        itemId: item.data.id,
        oldRank: item.data.rank,
        newRank,
      });
    }
  }

  return Result.ok(updates);
};

/**
 * Group items by their placement (parent + section)
 *
 * Items are grouped by their placement string, which includes:
 * - Parent (date YYYY-MM-DD or item UUID)
 * - Section path (e.g., /1/3)
 *
 * This allows rebalancing siblings within the same container/section.
 */
export type PlacementGroup = Readonly<{
  placementKey: string;
  siblings: ReadonlyArray<Item>;
}>;

export const groupByPlacement = (
  items: ReadonlyArray<Item>,
): ReadonlyArray<PlacementGroup> => {
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const key = item.data.placement.toString();
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const result: PlacementGroup[] = [];
  for (const [placementKey, siblings] of groups) {
    result.push({
      placementKey,
      siblings: Object.freeze(siblings),
    });
  }

  return Object.freeze(result);
};
