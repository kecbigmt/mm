/**
 * E2E Test Scenario 18: Doctor Rebalance Rank
 *
 * Purpose:
 *   Verify that `mm doctor rebalance-rank` command executes successfully
 *   and preserves item ordering after rebalancing.
 *
 * Overview:
 *   This scenario tests rank rebalancing operations:
 *   - Create multiple items in the same placement
 *   - Run `doctor rebalance-rank` command
 *   - Verify command completes successfully
 *   - Verify item ordering is preserved
 *   - Verify updated_at timestamps are updated when ranks change
 *   - Verify item content is preserved
 *
 * Note:
 *   Detailed verification of rank distribution (dense → spread) is done
 *   in unit tests (rank_rebalancer_test.ts), not here.
 *
 * Design Reference:
 *   See docs/specs/002_doctor/design.md section 3.3
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  getItemIdsFromDate,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";
import { parseFrontmatter } from "../../../src/infrastructure/fileSystem/frontmatter.ts";

describe("Scenario 18: Doctor rebalance-rank", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("rebalances ranks for items in same date placement", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create multiple items
    const createResult1 = await runCommand(ctx.testHome, ["note", "First item"]);
    assertEquals(
      createResult1.success,
      true,
      `Failed to create first note: ${createResult1.stderr}`,
    );

    const createResult2 = await runCommand(ctx.testHome, ["note", "Second item"]);
    assertEquals(
      createResult2.success,
      true,
      `Failed to create second note: ${createResult2.stderr}`,
    );

    const createResult3 = await runCommand(ctx.testHome, ["note", "Third item"]);
    assertEquals(
      createResult3.success,
      true,
      `Failed to create third note: ${createResult3.stderr}`,
    );

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemIds = await getItemIdsFromDate(ctx.testHome, "test-workspace", today);
    assertEquals(itemIds.length, 3, "Should have 3 items");

    // Get initial ranks
    const workspacePath = getWorkspacePath(ctx.testHome, "test-workspace");
    const initialRanks = await getRanksForItems(workspacePath, today, itemIds);

    // Run rebalance-rank command for today's date
    const rebalanceResult = await runCommand(ctx.testHome, ["doctor", "rebalance-rank", today]);
    assertEquals(rebalanceResult.success, true, `rebalance-rank failed: ${rebalanceResult.stderr}`);

    // Verify command output
    assertEquals(
      rebalanceResult.stdout.includes("Rebalancing ranks"),
      true,
      "Should show rebalancing message",
    );
    assertEquals(
      rebalanceResult.stdout.includes("Rank rebalance complete"),
      true,
      "Should show completion message",
    );

    // Get updated ranks
    const updatedRanks = await getRanksForItems(workspacePath, today, itemIds);

    // Verify order is preserved after rebalance
    const sortedInitialRanks = [...initialRanks].sort();
    const sortedUpdatedRanks = [...updatedRanks].sort();
    for (let i = 0; i < itemIds.length; i++) {
      const initialIndex = initialRanks.indexOf(sortedInitialRanks[i]);
      const updatedIndex = updatedRanks.indexOf(sortedUpdatedRanks[i]);
      assertEquals(initialIndex, updatedIndex, "Item order should be preserved after rebalance");
    }
  });

  it("updates updated_at timestamp when rebalancing", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create an item
    const createResult = await runCommand(ctx.testHome, ["note", "Test item"]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemIds = await getItemIdsFromDate(ctx.testHome, "test-workspace", today);
    assertEquals(itemIds.length, 1, "Should have 1 item");

    // Get initial updated_at
    const workspacePath = getWorkspacePath(ctx.testHome, "test-workspace");
    const [year, month, day] = today.split("-");
    const itemPath = join(workspacePath, "items", year, month, day, `${itemIds[0]}.md`);
    const initialContent = await Deno.readTextFile(itemPath);
    const initialParseResult = parseFrontmatter(initialContent);
    assertEquals(initialParseResult.type, "ok", "Should parse initial frontmatter");
    if (initialParseResult.type === "error") throw new Error("Failed to parse");
    const initialMeta = initialParseResult.value.frontmatter as Record<string, unknown>;
    const initialUpdatedAt = initialMeta.updated_at as string;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Run rebalance-rank for today's date
    const rebalanceResult = await runCommand(ctx.testHome, ["doctor", "rebalance-rank", today]);
    assertEquals(rebalanceResult.success, true, `rebalance-rank failed: ${rebalanceResult.stderr}`);

    // Check if rank was actually changed (single item at middle rank may not change)
    const updatedContent = await Deno.readTextFile(itemPath);
    const updatedParseResult = parseFrontmatter(updatedContent);
    assertEquals(updatedParseResult.type, "ok", "Should parse updated frontmatter");
    if (updatedParseResult.type === "error") throw new Error("Failed to parse");
    const updatedMeta = updatedParseResult.value.frontmatter as Record<string, unknown>;
    const updatedUpdatedAt = updatedMeta.updated_at as string;

    // If rank changed, updated_at should also change
    if (initialMeta.rank !== updatedMeta.rank) {
      assertNotEquals(
        initialUpdatedAt,
        updatedUpdatedAt,
        "updated_at should change when rank is modified",
      );
    }
  });

  it("requires placement argument", async () => {
    // Run rebalance-rank without placement argument should fail
    const rebalanceResult = await runCommand(ctx.testHome, ["doctor", "rebalance-rank"]);
    assertEquals(
      rebalanceResult.success,
      false,
      "Should fail when no placement argument provided",
    );
  });

  it("handles non-existent placement gracefully", async () => {
    // Run rebalance-rank on non-existent date
    const rebalanceResult = await runCommand(ctx.testHome, [
      "doctor",
      "rebalance-rank",
      "2099-12-31",
    ]);
    assertEquals(
      rebalanceResult.success,
      false,
      "Should fail when no items found in placement",
    );

    // Should report no items found
    assertEquals(
      rebalanceResult.stdout.includes("No items found"),
      true,
      "Should report no items found",
    );
  });

  it("shows warning about git changes", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create multiple items
    await runCommand(ctx.testHome, ["note", "First item"]);
    await runCommand(ctx.testHome, ["note", "Second item"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Run rebalance-rank for today's date
    const rebalanceResult = await runCommand(ctx.testHome, ["doctor", "rebalance-rank", today]);
    assertEquals(rebalanceResult.success, true, `rebalance-rank failed: ${rebalanceResult.stderr}`);

    // Check for git warning in output
    assertEquals(
      rebalanceResult.stdout.includes("git status") ||
        rebalanceResult.stdout.includes("Changes made"),
      true,
      "Should show warning about reviewing changes",
    );
  });

  it("preserves item content after rebalancing", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create an item with specific content
    const createResult = await runCommand(ctx.testHome, ["note", "Important note"]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemIds = await getItemIdsFromDate(ctx.testHome, "test-workspace", today);
    const workspacePath = getWorkspacePath(ctx.testHome, "test-workspace");
    const [year, month, day] = today.split("-");
    const itemPath = join(workspacePath, "items", year, month, day, `${itemIds[0]}.md`);

    // Get initial content
    const initialContent = await Deno.readTextFile(itemPath);

    // Run rebalance-rank for today's date
    const rebalanceResult = await runCommand(ctx.testHome, ["doctor", "rebalance-rank", today]);
    assertEquals(rebalanceResult.success, true, `rebalance-rank failed: ${rebalanceResult.stderr}`);

    // Get updated content
    const updatedContent = await Deno.readTextFile(itemPath);

    // Verify title is preserved
    assertEquals(
      updatedContent.includes("# Important note"),
      true,
      "Item title should be preserved",
    );

    // Verify body section (after frontmatter) contains the title
    const initialParseResult = parseFrontmatter(initialContent);
    const updatedParseResult = parseFrontmatter(updatedContent);
    assertEquals(initialParseResult.type, "ok", "Should parse initial frontmatter");
    assertEquals(updatedParseResult.type, "ok", "Should parse updated frontmatter");
    if (initialParseResult.type === "error" || updatedParseResult.type === "error") {
      throw new Error("Failed to parse");
    }

    // Body content should be identical
    assertEquals(
      initialParseResult.value.body,
      updatedParseResult.value.body,
      "Body content should be preserved",
    );
  });

  it("reports rebalanced items in output", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create items
    await runCommand(ctx.testHome, ["note", "Item 1"]);
    await runCommand(ctx.testHome, ["note", "Item 2"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Run rebalance-rank for today's date
    const rebalanceResult = await runCommand(ctx.testHome, ["doctor", "rebalance-rank", today]);
    assertEquals(rebalanceResult.success, true, `rebalance-rank failed: ${rebalanceResult.stderr}`);

    // Should report rebalanced items
    assertEquals(
      rebalanceResult.stdout.includes("Rebalanced"),
      true,
      "Should report number of rebalanced items",
    );
    assertEquals(
      rebalanceResult.stdout.includes("items"),
      true,
      "Should report items count",
    );
  });

  it("deduplicates items when paths overlap", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create items
    await runCommand(ctx.testHome, ["note", "Item 1"]);
    await runCommand(ctx.testHome, ["note", "Item 2"]);
    await runCommand(ctx.testHome, ["note", "Item 3"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Run rebalance-rank with duplicate paths (today specified twice)
    const rebalanceResult = await runCommand(ctx.testHome, [
      "doctor",
      "rebalance-rank",
      today,
      today,
    ]);
    assertEquals(rebalanceResult.success, true, `rebalance-rank failed: ${rebalanceResult.stderr}`);

    // Should report 3 items (not 6), confirming deduplication
    assertEquals(
      rebalanceResult.stdout.includes("Found 3 items"),
      true,
      "Should report 3 deduplicated items, not 6",
    );

    // Verify ranks are still correct (3 distinct ranks, not 6)
    const itemIds = await getItemIdsFromDate(ctx.testHome, "test-workspace", today);
    assertEquals(itemIds.length, 3, "Should have 3 items");

    const ranks = await getRanksForItems(
      getWorkspacePath(ctx.testHome, "test-workspace"),
      today,
      itemIds,
    );

    // All ranks should be different (no duplicates from double-counting)
    const uniqueRanks = new Set(ranks);
    assertEquals(uniqueRanks.size, 3, "Should have 3 unique ranks");
  });
});

/**
 * Helper to get ranks for a list of items
 */
async function getRanksForItems(
  workspacePath: string,
  dateStr: string,
  itemIds: string[],
): Promise<string[]> {
  const [year, month, day] = dateStr.split("-");
  const ranks: string[] = [];

  for (const itemId of itemIds) {
    const itemPath = join(workspacePath, "items", year, month, day, `${itemId}.md`);
    const content = await Deno.readTextFile(itemPath);
    const parseResult = parseFrontmatter(content);
    if (parseResult.type === "error") {
      throw new Error(`Failed to parse frontmatter for ${itemId}`);
    }
    const meta = parseResult.value.frontmatter as Record<string, unknown>;
    ranks.push(meta.rank as string);
  }

  return ranks;
}
