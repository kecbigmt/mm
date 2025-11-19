/**
 * E2E Test Scenario 17: Doctor Rebuild Index
 *
 * Purpose:
 *   Verify that `mm doctor rebuild-index` correctly rebuilds the .index/
 *   directory from Item frontmatter.
 *
 * Overview:
 *   This scenario tests the index rebuild functionality:
 *   - Create items in a workspace
 *   - Verify index files are created
 *   - Delete the index directory
 *   - Run `mm doctor rebuild-index`
 *   - Verify index is correctly rebuilt
 *   - Verify aliases are rebuilt for items with alias field
 *   - Test with items that have parent placements
 *
 * Design Reference:
 *   See docs/specs/002_doctor/design.md
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  getLatestItemId,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 17: Doctor rebuild-index", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("rebuilds index from empty workspace", async () => {
    // Run rebuild-index on empty workspace
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Scanned 0 items"),
      true,
      "Should report 0 items scanned",
    );
    assertEquals(
      result.stdout.includes("Index rebuild complete"),
      true,
      "Should report completion",
    );
  });

  it("rebuilds index after creating items", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create multiple items
    await runCommand(ctx.testHome, ["note", "First item"]);
    await runCommand(ctx.testHome, ["note", "Second item"]);
    await runCommand(ctx.testHome, ["note", "Third item"]);

    // Get workspace path
    const workspacePath = join(ctx.testHome, "workspaces", "test-workspace");
    const indexPath = join(workspacePath, ".index");
    const graphPath = join(indexPath, "graph");

    // Verify index directory exists
    const indexStat = await Deno.stat(indexPath).catch(() => null);
    assertExists(indexStat, "Index directory should exist");

    // Delete index directory
    await Deno.remove(indexPath, { recursive: true });

    // Verify index is gone
    const indexStatAfterDelete = await Deno.stat(indexPath).catch(() => null);
    assertEquals(indexStatAfterDelete, null, "Index directory should be deleted");

    // Run rebuild-index
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Scanned 3 items"),
      true,
      "Should report 3 items scanned",
    );
    assertEquals(
      result.stdout.includes("3 edges"),
      true,
      "Should report 3 edges created",
    );

    // Verify index is rebuilt
    const indexStatAfterRebuild = await Deno.stat(indexPath).catch(() => null);
    assertExists(indexStatAfterRebuild, "Index directory should be rebuilt");

    const graphStatAfterRebuild = await Deno.stat(graphPath).catch(() => null);
    assertExists(graphStatAfterRebuild, "Graph directory should be rebuilt");

    // Verify edge files exist for today's date
    const today = await getCurrentDateFromCli(ctx.testHome);
    const dateEdgePath = join(graphPath, "dates", today);
    const dateEdgeStat = await Deno.stat(dateEdgePath).catch(() => null);
    assertExists(dateEdgeStat, "Date edge directory should exist");

    // Count edge files
    let edgeCount = 0;
    for await (const entry of Deno.readDir(dateEdgePath)) {
      if (entry.isFile && entry.name.endsWith(".edge.json")) {
        edgeCount++;
      }
    }
    assertEquals(edgeCount, 3, "Should have 3 edge files");
  });

  it("rebuilds alias index for items with aliases", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create item with alias
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Item with alias",
      "--alias",
      "my-alias",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    // Get workspace path
    const workspacePath = join(ctx.testHome, "workspaces", "test-workspace");
    const indexPath = join(workspacePath, ".index");
    const aliasesPath = join(indexPath, "aliases");

    // Delete index directory
    await Deno.remove(indexPath, { recursive: true });

    // Run rebuild-index
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("1 aliases"),
      true,
      "Should report 1 alias created",
    );

    // Verify aliases directory is rebuilt
    const aliasesStatAfterRebuild = await Deno.stat(aliasesPath).catch(() => null);
    assertExists(aliasesStatAfterRebuild, "Aliases directory should be rebuilt");

    // Count alias files
    let aliasCount = 0;
    for await (const entry of Deno.readDir(aliasesPath)) {
      if (entry.isDirectory) {
        for await (const file of Deno.readDir(join(aliasesPath, entry.name))) {
          if (file.isFile && file.name.endsWith(".alias.json")) {
            aliasCount++;
          }
        }
      }
    }
    assertEquals(aliasCount, 1, "Should have 1 alias file");
  });

  it("rebuilds index with items under parent placement", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create parent item
    const createParent = await runCommand(ctx.testHome, [
      "note",
      "Parent item",
      "--alias",
      "parent",
    ]);
    assertEquals(createParent.success, true, `Failed to create parent: ${createParent.stderr}`);

    const parentId = await getLatestItemId(ctx.testHome, "test-workspace");

    // Create child item under parent
    const createChild = await runCommand(ctx.testHome, [
      "note",
      "Child item",
      "-p",
      "parent",
    ]);
    assertEquals(createChild.success, true, `Failed to create child: ${createChild.stderr}`);

    // Get workspace path
    const workspacePath = join(ctx.testHome, "workspaces", "test-workspace");
    const indexPath = join(workspacePath, ".index");

    // Delete index directory
    await Deno.remove(indexPath, { recursive: true });

    // Run rebuild-index
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Scanned 2 items"),
      true,
      "Should report 2 items scanned",
    );

    // Verify parent edge directory exists
    const parentsPath = join(indexPath, "graph", "parents", parentId);
    const parentsStat = await Deno.stat(parentsPath).catch(() => null);
    assertExists(parentsStat, "Parent edge directory should exist");

    // Count edge files under parent
    let edgeCount = 0;
    for await (const entry of Deno.readDir(parentsPath)) {
      if (entry.isFile && entry.name.endsWith(".edge.json")) {
        edgeCount++;
      }
    }
    assertEquals(edgeCount, 1, "Should have 1 edge file under parent");
  });

  it("is idempotent - running twice produces same result", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create items
    await runCommand(ctx.testHome, ["note", "Test item"]);

    // Run rebuild-index first time
    const result1 = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result1.success, true, `First rebuild-index failed: ${result1.stderr}`);

    // Run rebuild-index second time
    const result2 = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result2.success, true, `Second rebuild-index failed: ${result2.stderr}`);

    // Both should report same counts
    assertEquals(
      result1.stdout.includes("Scanned 1 items"),
      true,
      "First run should report 1 item",
    );
    assertEquals(
      result2.stdout.includes("Scanned 1 items"),
      true,
      "Second run should report 1 item",
    );
  });

  it("handles items across multiple dates", async () => {
    // Create item on specific date
    const createResult1 = await runCommand(ctx.testHome, [
      "note",
      "Item on date 1",
      "-p",
      "/2025-01-15",
    ]);
    assertEquals(createResult1.success, true, `Failed to create note 1: ${createResult1.stderr}`);

    const createResult2 = await runCommand(ctx.testHome, [
      "note",
      "Item on date 2",
      "-p",
      "/2025-01-16",
    ]);
    assertEquals(createResult2.success, true, `Failed to create note 2: ${createResult2.stderr}`);

    // Get workspace path
    const workspacePath = join(ctx.testHome, "workspaces", "test-workspace");
    const indexPath = join(workspacePath, ".index");

    // Delete index directory
    await Deno.remove(indexPath, { recursive: true });

    // Run rebuild-index
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Scanned 2 items"),
      true,
      "Should report 2 items scanned",
    );

    // Verify edge directories exist for both dates
    const date1Path = join(indexPath, "graph", "dates", "2025-01-15");
    const date2Path = join(indexPath, "graph", "dates", "2025-01-16");

    const date1Stat = await Deno.stat(date1Path).catch(() => null);
    const date2Stat = await Deno.stat(date2Path).catch(() => null);

    assertExists(date1Stat, "Date 1 edge directory should exist");
    assertExists(date2Stat, "Date 2 edge directory should exist");
  });

  it("shows progress for large number of items", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create 5 items (not 100 to keep test fast, but enough to verify counting)
    for (let i = 0; i < 5; i++) {
      await runCommand(ctx.testHome, ["note", `Item ${i + 1}`]);
    }

    // Get workspace path and delete index
    const workspacePath = join(ctx.testHome, "workspaces", "test-workspace");
    const indexPath = join(workspacePath, ".index");
    await Deno.remove(indexPath, { recursive: true });

    // Run rebuild-index
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Scanned 5 items"),
      true,
      "Should report 5 items scanned",
    );
    assertEquals(
      result.stdout.includes("5 edges"),
      true,
      "Should report 5 edges created",
    );
  });

  it("displays correct edge type counts", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create items with different placements
    await runCommand(ctx.testHome, ["note", "Date item 1"]);
    await runCommand(ctx.testHome, ["note", "Date item 2"]);

    // Create parent and child
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"]);
    await runCommand(ctx.testHome, ["note", "Child", "-p", "parent"]);

    // Get workspace path and delete index
    const workspacePath = join(ctx.testHome, "workspaces", "test-workspace");
    const indexPath = join(workspacePath, ".index");
    await Deno.remove(indexPath, { recursive: true });

    // Run rebuild-index
    const result = await runCommand(ctx.testHome, ["doctor", "rebuild-index"]);
    assertEquals(result.success, true, `rebuild-index failed: ${result.stderr}`);

    // Should show breakdown of edge types
    assertEquals(
      result.stdout.includes("Date sections:"),
      true,
      "Should show date sections count",
    );
    assertEquals(
      result.stdout.includes("Parent sections:"),
      true,
      "Should show parent sections count",
    );
  });
});
