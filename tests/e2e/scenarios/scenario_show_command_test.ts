/**
 * E2E Test Scenario: Show Command
 *
 * Purpose:
 *   Verify that the `show` command displays item details correctly, including:
 *   - Displaying item metadata and body content
 *   - Resolving items by UUID and alias
 *   - Using pager or direct output based on --print flag
 *   - Error handling for non-existent items
 *
 * Overview:
 *   This scenario tests show command operations:
 *   - Create items with various metadata
 *   - Display item details using `show <id>`
 *   - Display with `--print` flag for direct output
 *   - Verify resolution by alias
 *   - Verify error for non-existent items
 */

import { assertEquals } from "@std/assert";
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
    "--placement",
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

describe("Scenario: Show command", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("displays item details with metadata and body", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // First create the context item that will be referenced
    await createPermanentItem(ctx.testHome, "Work Context", "work");

    // Create note with alias, context, and body
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Planning document",
      "--alias",
      "plan-doc",
      "--context",
      "work",
      "--body",
      "This is the planning content.",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);

    // Show item by alias with --print flag (direct output without pager)
    const showResult = await runCommand(ctx.testHome, [
      "show",
      "plan-doc",
      "--print",
    ]);
    assertEquals(showResult.success, true, `show failed: ${showResult.stderr}`);

    // Verify output contains expected elements
    const output = showResult.stdout;

    // Header line: alias, icon, title, context, date
    assertEquals(output.includes("plan-doc"), true, "Should include alias");
    assertEquals(output.includes("📝"), true, "Should include note icon");
    assertEquals(output.includes("Planning document"), true, "Should include title");
    // UUID→alias resolution is implemented, should display @work
    assertEquals(output.includes("@work"), true, "Should include context @work");
    assertEquals(output.includes(`on:${today}`), true, "Should include date");

    // Body content
    assertEquals(output.includes("This is the planning content."), true, "Should include body");

    // Metadata section
    assertEquals(output.includes("UUID:"), true, "Should include UUID");
    assertEquals(output.includes("Created:"), true, "Should include Created timestamp");
    assertEquals(output.includes("Updated:"), true, "Should include Updated timestamp");
  });

  it("displays item details using alias", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Test note",
      "--alias",
      "test-alias",
    ]);
    assertEquals(createResult.success, true);

    // Show using alias
    const showResult = await runCommand(ctx.testHome, [
      "show",
      "test-alias",
      "--print",
    ]);
    assertEquals(showResult.success, true, `show failed: ${showResult.stderr}`);
    assertEquals(showResult.stdout.includes("Test note"), true);
    assertEquals(showResult.stdout.includes("test-alias"), true);
  });

  it("displays closed task with Closed timestamp", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "task",
      "Complete report",
      "--alias",
      "task-xyz",
    ]);
    assertEquals(createResult.success, true);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    // Close the task
    const closeResult = await runCommand(ctx.testHome, ["close", itemId]);
    assertEquals(closeResult.success, true);

    // Show closed task
    const showResult = await runCommand(ctx.testHome, [
      "show",
      itemId,
      "--print",
    ]);
    assertEquals(showResult.success, true);

    const output = showResult.stdout;
    assertEquals(output.includes("✅"), true, "Should include closed task icon");
    assertEquals(output.includes("Closed:"), true, "Should include Closed timestamp");
  });

  it("displays event with start time and duration", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);

    const createResult = await runCommand(ctx.testHome, [
      "event",
      "Team meeting",
      "--start-at",
      `${today}T14:00:00Z`,
      "--duration",
      "1h30m",
    ]);
    assertEquals(createResult.success, true, `Failed to create event: ${createResult.stderr}`);

    // Event is placed on the date from start-at (today)
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const showResult = await runCommand(ctx.testHome, [
      "show",
      itemId,
      "--print",
    ]);
    assertEquals(showResult.success, true);

    const output = showResult.stdout;
    assertEquals(output.includes("🕒"), true, "Should include event icon");
    assertEquals(output.includes("Team meeting"), true);
    assertEquals(output.includes("Start:"), true, "Should include Start timestamp");
    assertEquals(output.includes("Duration:"), true, "Should include Duration");
  });

  it("displays item without alias using UUID", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Note without alias",
    ]);
    assertEquals(createResult.success, true);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const itemId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const showResult = await runCommand(ctx.testHome, [
      "show",
      itemId,
      "--print",
    ]);
    assertEquals(showResult.success, true);

    const output = showResult.stdout;
    assertEquals(output.includes(itemId), true, "Should display full UUID when no alias");
    assertEquals(output.includes("Note without alias"), true);
  });

  it("returns error for non-existent item", async () => {
    const showResult = await runCommand(ctx.testHome, [
      "show",
      "nonexistent-alias",
      "--print",
    ]);
    assertEquals(showResult.success, false, "Should fail for non-existent item");
    assertEquals(
      showResult.stderr.includes("not found") || showResult.stderr.includes("error"),
      true,
      "Error message should indicate item not found",
    );
  });
});
