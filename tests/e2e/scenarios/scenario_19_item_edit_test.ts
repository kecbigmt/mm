/**
 * E2E Test Scenario 19: Item Edit
 *
 * Purpose:
 *   Verify that item editing works correctly via the `edit` command, including:
 *   - Editing item title, icon, body, and metadata via command-line options
 *   - Editing items by UUID and alias
 *   - Verifying that changes are persisted in the filesystem
 *
 * Overview:
 *   This scenario tests item editing operations:
 *   - Create an item with `note` command
 *   - Edit the item's title using `edit <id> --title`
 *   - Edit the item's icon using `edit <id> --icon`
 *   - Edit the item's body using `edit <id> --body`
 *   - Edit multiple fields at once
 *   - Edit item by alias instead of UUID
 *   - Verify all changes are persisted in frontmatter and body
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md and e2e-test-scenarios.md
 */

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  findItemFileById,
  getCurrentDateFromCli,
  getLatestItemId,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";
import { parseFrontmatter } from "../../../src/infrastructure/fileSystem/frontmatter.ts";

/**
 * Helper to create a permanent item with an alias.
 * This is required for using --project and --context options,
 * since they now resolve aliases to ItemIds (UUIDs).
 */
const createPermanentItem = async (
  testHome: string,
  title: string,
  aliasSlug: string,
): Promise<{ id: string }> => {
  const result = await runCommand(testHome, [
    "note",
    title,
    "--dir",
    "permanent",
    "--alias",
    aliasSlug,
  ]);
  if (!result.success) {
    throw new Error(`Failed to create permanent item: ${result.stderr}`);
  }

  // Get the UUID via mm show command
  const showResult = await runCommand(testHome, ["show", aliasSlug]);
  if (!showResult.success) {
    throw new Error(`Failed to show permanent item: ${showResult.stderr}`);
  }

  // Extract UUID from show output (format: "UUID: <uuid>")
  const idMatch = showResult.stdout.match(/UUID:\s*([0-9a-f-]{36})/i);
  if (!idMatch) {
    throw new Error(`Could not extract UUID from show output: ${showResult.stdout}`);
  }
  return { id: idMatch[1] };
};

describe("Scenario 19: Item edit", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("edits item title via command line", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Original title",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      itemId,
      "--title",
      "Updated title",
    ]);
    assertEquals(editResult.success, true, `edit failed: ${editResult.stderr}`);
    assertEquals(
      editResult.stdout.includes("Updated") || editResult.stdout.includes("✅"),
      true,
      "Edit command should succeed",
    );

    // Verify title in frontmatter and body
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");
    const fileContent = await Deno.readTextFile(itemFile!);
    const parseResult = parseFrontmatter(fileContent);
    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") throw new Error("Failed to parse frontmatter");

    // Check that the title appears in the body
    assertEquals(
      parseResult.value.body.includes("# Updated title"),
      true,
      "Title should be updated in body",
    );
  });

  it("edits item icon via command line", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Test note",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      itemId,
      "--icon",
      "task",
    ]);
    assertEquals(editResult.success, true, `edit failed: ${editResult.stderr}`);

    // Verify icon in frontmatter
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");
    const fileContent = await Deno.readTextFile(itemFile!);
    const parseResult = parseFrontmatter(fileContent);
    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") throw new Error("Failed to parse frontmatter");
    const meta = parseResult.value.frontmatter as Record<string, unknown>;

    assertEquals(meta.icon, "task", "Icon should be updated in frontmatter");
  });

  it("edits item body via command line", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Test note",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      itemId,
      "--body",
      "This is the new body content",
    ]);
    assertEquals(editResult.success, true, `edit failed: ${editResult.stderr}`);

    // Verify body content
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");
    const fileContent = await Deno.readTextFile(itemFile!);
    const parseResult = parseFrontmatter(fileContent);
    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") throw new Error("Failed to parse frontmatter");

    assertEquals(
      parseResult.value.body.includes("This is the new body content"),
      true,
      "Body should be updated",
    );
  });

  it("edits multiple fields at once", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Original note",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      itemId,
      "--title",
      "Updated note",
      "--icon",
      "event",
      "--body",
      "Updated body",
    ]);
    assertEquals(editResult.success, true, `edit failed: ${editResult.stderr}`);

    // Verify all changes
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");
    const fileContent = await Deno.readTextFile(itemFile!);
    const parseResult = parseFrontmatter(fileContent);
    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") throw new Error("Failed to parse frontmatter");
    const meta = parseResult.value.frontmatter as Record<string, unknown>;

    assertEquals(meta.icon, "event", "Icon should be updated");
    assertEquals(
      parseResult.value.body.includes("# Updated note"),
      true,
      "Title should be updated",
    );
    assertEquals(
      parseResult.value.body.includes("Updated body"),
      true,
      "Body should be updated",
    );
  });

  it("edits item context tag", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // First create the context item that will be referenced
    const workContext = await createPermanentItem(ctx.testHome, "Work Context", "work");

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Test note",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      itemId,
      "--context",
      "work",
    ]);
    assertEquals(editResult.success, true, `edit failed: ${editResult.stderr}`);

    // Verify contexts in frontmatter
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");
    const fileContent = await Deno.readTextFile(itemFile!);
    const parseResult = parseFrontmatter(fileContent);
    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") throw new Error("Failed to parse frontmatter");
    const meta = parseResult.value.frontmatter as Record<string, string[] | unknown>;

    // Contexts are now stored as UUIDs, not alias strings
    assertEquals(
      (meta.contexts as string[])?.[0],
      workContext.id,
      "Contexts should be updated in frontmatter with UUID",
    );
  });

  it("returns error for non-existent item", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      "nonexistent",
      "--title",
      "New title",
    ]);
    assertEquals(editResult.success, false, "Edit should fail for non-existent item");
    assertEquals(
      editResult.stderr.includes("not found") || editResult.stderr.includes("Item not found"),
      true,
      "Error message should indicate item not found",
    );
  });

  it("returns error for invalid icon value", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Test note",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const editResult = await runCommand(ctx.testHome, [
      "edit",
      itemId,
      "--icon",
      "invalid-icon",
    ]);
    assertEquals(editResult.success, false, "Edit should fail for invalid icon");
    assertEquals(
      editResult.stderr.includes("icon") ||
        editResult.stderr.includes("must be 'note', 'task', or 'event'"),
      true,
      "Error message should indicate invalid icon",
    );
  });

  it("uses alias 'e' for edit command", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Test note",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    // Use 'e' alias instead of 'edit'
    const editResult = await runCommand(ctx.testHome, [
      "e",
      itemId,
      "--title",
      "Updated via alias",
    ]);
    assertEquals(editResult.success, true, `edit with alias failed: ${editResult.stderr}`);

    // Verify the change
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", itemId);
    assertExists(itemFile, "Item file should exist");
    const fileContent = await Deno.readTextFile(itemFile!);
    const parseResult = parseFrontmatter(fileContent);
    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") throw new Error("Failed to parse frontmatter");

    assertEquals(
      parseResult.value.body.includes("# Updated via alias"),
      true,
      "Title should be updated using alias",
    );
  });
});
