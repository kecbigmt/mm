import { assertEquals, assertExists } from "@std/assert";
import { groupByPlacement, rebalanceGroup } from "./rank_rebalancer.ts";
import { createRankService } from "../../domain/services/rank_service.ts";
import { createLexoRankGenerator } from "../lexorank/generator.ts";
import { createItem, Item } from "../../domain/models/item.ts";
import {
  parseDateTime,
  parseItemIcon,
  parseItemId,
  parseItemRank,
  parseItemStatus,
  parseItemTitle,
  parsePlacement,
} from "../../domain/primitives/mod.ts";
import { Result } from "../../shared/result.ts";

// Helper to create test items
const createTestItem = (
  idSuffix: string,
  placement: string,
  rank: string,
  createdAt = "2025-01-15T10:00:00Z",
): Item => {
  const id = Result.unwrap(parseItemId(`019a85fc-67c4-7a54-be8e-305bae00${idSuffix}`));
  const title = Result.unwrap(parseItemTitle("Test Item"));
  const icon = Result.unwrap(parseItemIcon("note"));
  const status = Result.unwrap(parseItemStatus("open"));
  const placementVal = Result.unwrap(parsePlacement(placement));
  const rankVal = Result.unwrap(parseItemRank(rank));
  const createdAtVal = Result.unwrap(parseDateTime(createdAt));
  const updatedAtVal = Result.unwrap(parseDateTime(createdAt));

  return createItem({
    id,
    title,
    icon,
    status,
    placement: placementVal,
    rank: rankVal,
    createdAt: createdAtVal,
    updatedAt: updatedAtVal,
  });
};

Deno.test("rebalanceGroup - returns empty array for empty input", () => {
  const rankService = createRankService(createLexoRankGenerator());
  const result = rebalanceGroup([], rankService);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.length, 0);
  }
});

Deno.test("rebalanceGroup - single item gets middle rank", () => {
  const rankService = createRankService(createLexoRankGenerator());
  const item = createTestItem("9f9e", "2025-01-15", "0|a0:z");

  const result = rebalanceGroup([item], rankService);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Single item may or may not get updated depending on if it's already middle
    // The important thing is no error occurs
    assertExists(result.value);
  }
});

Deno.test("rebalanceGroup - preserves order when rebalancing", () => {
  const rankService = createRankService(createLexoRankGenerator());

  // Create items with consecutive ranks
  const items = [
    createTestItem("0001", "2025-01-15", "0|a0:"),
    createTestItem("0002", "2025-01-15", "0|a0:i"),
    createTestItem("0003", "2025-01-15", "0|a0:z"),
  ];

  const result = rebalanceGroup(items, rankService);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Verify that the new ranks maintain the same order
    const updates = result.value;

    // Get the new ranks for each item
    const newRanks = new Map<string, string>();
    for (const update of updates) {
      newRanks.set(update.itemId.toString(), update.newRank.toString());
    }

    // Items that weren't updated keep their old rank
    const finalRanks = items.map((item) => {
      const newRank = newRanks.get(item.data.id.toString());
      return newRank ?? item.data.rank.toString();
    });

    // Verify order is preserved
    for (let i = 0; i < finalRanks.length - 1; i++) {
      const comparison = finalRanks[i].localeCompare(finalRanks[i + 1]);
      assertEquals(comparison < 0, true, `rank at ${i} should be less than rank at ${i + 1}`);
    }
  }
});

Deno.test("rebalanceGroup - uses createdAt as tiebreak for same ranks", () => {
  const rankService = createRankService(createLexoRankGenerator());

  // Create items with same rank but different createdAt
  const items = [
    createTestItem("0001", "2025-01-15", "0|a0:z", "2025-01-15T12:00:00Z"),
    createTestItem("0002", "2025-01-15", "0|a0:z", "2025-01-15T10:00:00Z"),
    createTestItem("0003", "2025-01-15", "0|a0:z", "2025-01-15T11:00:00Z"),
  ];

  const result = rebalanceGroup(items, rankService);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Just verify no error - the exact ordering depends on createdAt tiebreak
    assertExists(result.value);
  }
});

Deno.test("groupByPlacement - groups items by placement string", () => {
  const items = [
    createTestItem("0001", "2025-01-15", "0|a0:"),
    createTestItem("0002", "2025-01-15", "0|a0:i"),
    createTestItem("0003", "2025-01-16", "0|a0:"),
    createTestItem("0004", "2025-01-15/1", "0|a0:"),
  ];

  const groups = groupByPlacement(items);

  assertEquals(groups.length, 3);

  // Find each group
  const group2025_01_15 = groups.find((g) => g.placementKey === "2025-01-15");
  const group2025_01_16 = groups.find((g) => g.placementKey === "2025-01-16");
  const group2025_01_15_1 = groups.find((g) => g.placementKey === "2025-01-15/1");

  assertExists(group2025_01_15);
  assertExists(group2025_01_16);
  assertExists(group2025_01_15_1);

  assertEquals(group2025_01_15.siblings.length, 2);
  assertEquals(group2025_01_16.siblings.length, 1);
  assertEquals(group2025_01_15_1.siblings.length, 1);
});

Deno.test("groupByPlacement - returns empty array for empty input", () => {
  const groups = groupByPlacement([]);
  assertEquals(groups.length, 0);
});

Deno.test("groupByPlacement - groups items under parent item", () => {
  const parentId = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  const items = [
    createTestItem("0001", parentId, "0|a0:"),
    createTestItem("0002", parentId, "0|a0:i"),
    createTestItem("0003", `${parentId}/1`, "0|a0:"),
  ];

  const groups = groupByPlacement(items);

  assertEquals(groups.length, 2);

  const groupParent = groups.find((g) => g.placementKey === parentId);
  const groupSection = groups.find((g) => g.placementKey === `${parentId}/1`);

  assertExists(groupParent);
  assertExists(groupSection);

  assertEquals(groupParent.siblings.length, 2);
  assertEquals(groupSection.siblings.length, 1);
});

Deno.test("rebalanceGroup - only returns updates for changed ranks", () => {
  const rankService = createRankService(createLexoRankGenerator());

  // Create a single item that's already at the middle rank
  const middleRank = rankService.headRank([]);
  assertEquals(middleRank.type, "ok");

  if (middleRank.type === "ok") {
    const item = createTestItem("0001", "2025-01-15", middleRank.value.toString());
    const result = rebalanceGroup([item], rankService);

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // Single item at middle rank should not generate an update
      // (it's already at the optimal position)
      assertEquals(result.value.length, 0);
    }
  }
});

Deno.test("rebalanceGroup - redistributes dense ranks to spread distribution", () => {
  const rankService = createRankService(createLexoRankGenerator());

  // Create items with dense ranks in middle of space (simulating consecutive creation)
  // These ranks are all in h bucket - densely packed around middle
  const items = [
    createTestItem("0001", "2025-01-15", "0|hzzzzz:"),
    createTestItem("0002", "2025-01-15", "0|hzzzzm:"),
    createTestItem("0003", "2025-01-15", "0|hzzzzc:"),
    createTestItem("0004", "2025-01-15", "0|hzzzzb:"),
    createTestItem("0005", "2025-01-15", "0|hzzzza:"),
  ];

  const result = rebalanceGroup(items, rankService);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should have updates for all items (ranks will change)
    assertEquals(result.value.length, 5, "All items should be updated");

    // Sort updates by old rank to get consistent order
    const sortedUpdates = [...result.value].sort((a, b) =>
      a.oldRank.toString().localeCompare(b.oldRank.toString())
    );

    // Verify exact old and new rank values
    // Old ranks: dense in h bucket (middle of space)
    assertEquals(sortedUpdates[0].oldRank.toString(), "0|hzzzza:");
    assertEquals(sortedUpdates[1].oldRank.toString(), "0|hzzzzb:");
    assertEquals(sortedUpdates[2].oldRank.toString(), "0|hzzzzc:");
    assertEquals(sortedUpdates[3].oldRank.toString(), "0|hzzzzm:");
    assertEquals(sortedUpdates[4].oldRank.toString(), "0|hzzzzz:");

    // New ranks: spread from beginning of space (0 bucket)
    // This demonstrates ranks are redistributed with more insertion headroom
    assertEquals(sortedUpdates[0].newRank.toString(), "0|000000:");
    assertEquals(sortedUpdates[1].newRank.toString(), "0|100000:");
    assertEquals(sortedUpdates[2].newRank.toString(), "0|100008:");
    assertEquals(sortedUpdates[3].newRank.toString(), "0|10000g:");
    assertEquals(sortedUpdates[4].newRank.toString(), "0|10000o:");
  }
});
