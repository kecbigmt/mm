/**
 * E2E Test Scenario 21: Item Removal
 *
 * Purpose:
 *   Verify that item removal (delete) works correctly and that
 *   deleted items are removed from filesystem and no longer appear in listings.
 *
 * Overview:
 *   This scenario tests item deletion operations:
 *   - Single item removal by ID with filesystem verification
 *   - Item removal by alias
 *   - Batch removal of multiple items
 *   - Integration with ls command (removed items don't appear)
 *   - Error handling for non-existent items
 *   - Partial failure scenarios
 *   - rm alias command support
 */

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  findItemFileById,
  getCurrentDateFromCli,
  getItemIdsFromDate,
  getLatestItemId,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";
// Helper to check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

describe("Scenario 21: Item removal", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("removes an item and verifies file is deleted", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create item
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Item to remove",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    // Find item file path
    const itemFileBefore = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFileBefore, "Item file should exist before removal");
    const fileExistsBefore = await fileExists(itemFileBefore!);
    assertEquals(fileExistsBefore, true, "Item file should exist before removal");

    // Remove item
    const removeResult = await runCommand(ctx.testHome, ["remove", itemId]);
    assertEquals(removeResult.success, true, `remove failed: ${removeResult.stderr}`);
    assertEquals(
      removeResult.stdout.includes("Removed") || removeResult.stdout.includes("✅"),
      true,
      "Remove command should show success message",
    );

    // Verify file is deleted
    const fileExistsAfter = await fileExists(itemFileBefore!);
    assertEquals(fileExistsAfter, false, "Item file should be deleted after removal");
  });

  it("removes an item by alias", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create item with alias
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Item with alias",
      "--alias",
      "test-alias",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    // Find item file path
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");

    // Remove by alias
    const removeResult = await runCommand(ctx.testHome, ["remove", "test-alias"]);
    assertEquals(removeResult.success, true, `remove by alias failed: ${removeResult.stderr}`);
    assertEquals(
      removeResult.stdout.includes("test-alias"),
      true,
      "Remove output should show alias",
    );

    // Verify file is deleted
    const fileExistsResult = await fileExists(itemFile!);
    assertEquals(fileExistsResult, false, "Item file should be deleted");
  });

  it("removes multiple items in one command", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Create multiple items
    await runCommand(ctx.testHome, ["note", "Item 1"]);
    await runCommand(ctx.testHome, ["note", "Item 2"]);
    await runCommand(ctx.testHome, ["note", "Item 3"]);

    const itemIds = await getItemIdsFromDate(ctx.testHome, "test-workspace", today);
    assertEquals(itemIds.length, 3, "Should have 3 items");

    const [item1Id, item2Id, item3Id] = itemIds;

    // Get file paths
    const file1 = await findItemFileById(ctx.testHome, "test-workspace", item1Id);
    const file2 = await findItemFileById(ctx.testHome, "test-workspace", item2Id);
    const file3 = await findItemFileById(ctx.testHome, "test-workspace", item3Id);

    assertExists(file1, "Item 1 file should exist");
    assertExists(file2, "Item 2 file should exist");
    assertExists(file3, "Item 3 file should exist");

    // Remove all three items
    const removeResult = await runCommand(ctx.testHome, [
      "remove",
      item1Id,
      item2Id,
      item3Id,
    ]);
    assertEquals(removeResult.success, true, `batch remove failed: ${removeResult.stderr}`);
    assertEquals(
      removeResult.stdout.includes("Removed 3 item(s)"),
      true,
      "Should indicate 3 items removed",
    );

    // Verify all files are deleted
    assertEquals(await fileExists(file1!), false, "Item 1 should be deleted");
    assertEquals(await fileExists(file2!), false, "Item 2 should be deleted");
    assertEquals(await fileExists(file3!), false, "Item 3 should be deleted");
  });

  it("removes item and verifies it no longer appears in ls", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Create item
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Visible item",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    // Verify item appears in ls
    const lsBefore = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsBefore.success, true, `ls failed: ${lsBefore.stderr}`);
    assertEquals(
      lsBefore.stdout.includes("Visible item"),
      true,
      "Item should appear in ls before removal",
    );

    // Remove item
    const removeResult = await runCommand(ctx.testHome, ["remove", itemId]);
    assertEquals(removeResult.success, true, `remove failed: ${removeResult.stderr}`);

    // Verify item does not appear in ls
    const lsAfter = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsAfter.success, true, `ls failed after removal: ${lsAfter.stderr}`);
    assertEquals(
      lsAfter.stdout.includes("Visible item"),
      false,
      "Item should not appear in ls after removal",
    );
  });

  it("handles non-existent item gracefully", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const fakeId = "0193d6c0-9999-7000-8000-000000000000";

    // Attempt to remove non-existent item
    const removeResult = await runCommand(ctx.testHome, ["remove", fakeId]);
    assertEquals(removeResult.success, false, "Should fail when item doesn't exist");
    assertEquals(
      removeResult.stderr.includes("error") || removeResult.stderr.includes("❌"),
      true,
      "Should show error message",
    );
  });

  it("handles partial failure (some exist, some don't)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Create one item
    await runCommand(ctx.testHome, ["note", "Real item"]);
    const realItemId = await getLatestItemId(ctx.testHome, "test-workspace", today);
    const realItemFile = await findItemFileById(ctx.testHome, "test-workspace", realItemId);
    assertExists(realItemFile, "Real item file should exist");

    const fakeId = "0193d6c0-9999-7000-8000-000000000000";

    // Try to remove both real and fake items
    const removeResult = await runCommand(ctx.testHome, [
      "remove",
      realItemId,
      fakeId,
    ]);

    // Command should fail overall (exit code 1) due to partial failure
    assertEquals(removeResult.success, false, "Should fail due to partial failure");

    // But should show success for the real item
    assertEquals(
      removeResult.stdout.includes("Removed 1 item(s)") ||
        removeResult.stdout.includes("Real item"),
      true,
      "Should show successful removal of real item",
    );

    // And error for the fake item
    assertEquals(
      removeResult.stderr.includes("error") || removeResult.stderr.includes("❌"),
      true,
      "Should show error for fake item",
    );

    // Verify real item is actually deleted
    assertEquals(
      await fileExists(realItemFile!),
      false,
      "Real item should be deleted despite partial failure",
    );
  });

  it("supports rm alias command", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Create item
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Item for rm test",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");

    // Remove using rm alias
    const removeResult = await runCommand(ctx.testHome, ["rm", itemId]);
    assertEquals(removeResult.success, true, `rm command failed: ${removeResult.stderr}`);

    // Verify deletion
    assertEquals(await fileExists(itemFile!), false, "Item should be deleted using rm alias");
  });
});
