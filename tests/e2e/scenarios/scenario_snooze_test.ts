/**
 * E2E Test Scenario: Snooze Feature
 *
 * Purpose:
 *   Verify that item snoozing works correctly, including:
 *   - Default snooze duration (8h)
 *   - Custom snooze durations and times
 *   - Auto-move when snoozed to future date
 *   - Unsnoozing items with --clear flag
 *   - Hiding snoozed items from ls
 *   - Showing snoozed items with ls --all
 *   - Command alias 'sn'
 *
 * Overview:
 *   This scenario tests the complete snooze workflow:
 *   - Create items
 *   - Snooze with various time formats
 *   - Verify items are hidden/shown appropriately
 *   - Verify auto-move behavior
 *   - Test unsnooze functionality with --clear flag
 */

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  extractItemLines,
  findItemFileById,
  getCurrentDateFromCli,
  getItemIdByTitle,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario: Snooze Feature", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("snoozes item with default duration (8h)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create a task
    const createResult = await runCommand(ctx.testHome, ["task", "Task to snooze"]);
    assertEquals(createResult.success, true, `Failed to create task: ${createResult.stderr}`);

    // Get task ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "Task to snooze");
    assertExists(taskId, "Task ID should be found");

    // Snooze with default duration (no argument)
    const snoozeResult = await runCommand(ctx.testHome, ["snooze", taskId]);
    assertEquals(snoozeResult.success, true, `Snooze failed: ${snoozeResult.stderr}`);
    assertEquals(
      snoozeResult.stdout.includes("is snoozing until"),
      true,
      `Snooze should report success: ${snoozeResult.stdout}`,
    );

    // Verify frontmatter contains snooze_until
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", taskId);
    assertExists(itemFile, "Item file should exist");
    const content = await Deno.readTextFile(itemFile);
    assertEquals(
      content.includes("snooze_until:"),
      true,
      "Item frontmatter should contain snooze_until",
    );
  });

  it("snoozes item with explicit duration", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create a task
    await runCommand(ctx.testHome, ["task", "Task with duration"]);

    // Get task ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskId = await getItemIdByTitle(
      ctx.testHome,
      "test-workspace",
      today,
      "Task with duration",
    );
    assertExists(taskId, "Task ID should be found");

    // Snooze with 2h duration
    const snoozeResult = await runCommand(ctx.testHome, ["snooze", taskId, "2h"]);
    assertEquals(snoozeResult.success, true, `Snooze failed: ${snoozeResult.stderr}`);
    assertEquals(
      snoozeResult.stdout.includes("is snoozing until"),
      true,
      `Snooze should report success: ${snoozeResult.stdout}`,
    );
  });

  it("snoozes item to tomorrow and auto-moves directory", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create a task
    await runCommand(ctx.testHome, ["task", "Task for tomorrow"]);

    // Get task ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskId = await getItemIdByTitle(
      ctx.testHome,
      "test-workspace",
      today,
      "Task for tomorrow",
    );
    assertExists(taskId, "Task ID should be found");

    // Snooze until tomorrow
    const snoozeResult = await runCommand(ctx.testHome, ["snooze", taskId, "tomorrow"]);
    assertEquals(snoozeResult.success, true, `Snooze failed: ${snoozeResult.stderr}`);

    // Verify item was moved to tomorrow (use --logical to see directory date)
    const whereResult = await runCommand(ctx.testHome, ["where", taskId, "--logical"]);
    assertEquals(whereResult.success, true, `where failed: ${whereResult.stderr}`);

    // Calculate tomorrow's date
    const [year, month, day] = today.split("-").map(Number);
    const todayDate = new Date(year, month - 1, day);
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(todayDate.getDate() + 1);
    const tomorrow = `${tomorrowDate.getFullYear()}-${
      String(tomorrowDate.getMonth() + 1).padStart(2, "0")
    }-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

    assertEquals(
      whereResult.stdout.includes(tomorrow),
      true,
      `Item should be moved to tomorrow ${tomorrow}: ${whereResult.stdout}`,
    );
  });

  it("unsnoozes item with --clear flag", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create and snooze a task
    await runCommand(ctx.testHome, ["task", "Task to unsnooze"]);
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskId = await getItemIdByTitle(
      ctx.testHome,
      "test-workspace",
      today,
      "Task to unsnooze",
    );
    assertExists(taskId, "Task ID should be found");

    // Snooze it first
    const snoozeResult = await runCommand(ctx.testHome, ["snooze", taskId, "2h"]);
    assertEquals(snoozeResult.success, true, "Initial snooze should succeed");

    // Unsnooze with --clear flag
    const unsnoozeResult = await runCommand(ctx.testHome, ["snooze", taskId, "--clear"]);
    assertEquals(unsnoozeResult.success, true, `Unsnooze failed: ${unsnoozeResult.stderr}`);
    assertEquals(
      unsnoozeResult.stdout.includes("is no longer snoozing"),
      true,
      `Unsnooze should report success: ${unsnoozeResult.stdout}`,
    );

    // Verify frontmatter does not contain snooze_until
    const itemFile = await findItemFileById(ctx.testHome, "test-workspace", taskId);
    assertExists(itemFile, "Item file should exist");
    const content = await Deno.readTextFile(itemFile);
    assertEquals(
      content.includes("snooze_until:"),
      false,
      "Item frontmatter should not contain snooze_until after unsnooze",
    );
  });

  it("hides snoozed items from ls by default", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create two tasks
    await runCommand(ctx.testHome, ["task", "Normal Task"]);
    await runCommand(ctx.testHome, ["task", "Snoozed Task"]);

    // Get task IDs
    const today = await getCurrentDateFromCli(ctx.testHome);
    const snoozedTaskId = await getItemIdByTitle(
      ctx.testHome,
      "test-workspace",
      today,
      "Snoozed Task",
    );
    assertExists(snoozedTaskId, "Snoozed task ID should be found");

    // Snooze the second task
    const snoozeResult = await runCommand(ctx.testHome, ["snooze", snoozedTaskId, "2h"]);
    assertEquals(snoozeResult.success, true, "Snooze should succeed");

    // List items (default should hide snoozed)
    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
    const lines = extractItemLines(lsResult.stdout);

    // Should only show the normal task
    assertEquals(lines.length, 1, "Should list only 1 unsnoozed item");
    assertEquals(lines[0].includes("Normal Task"), true, "Should show Normal Task");
    assertEquals(lines[0].includes("Snoozed Task"), false, "Should not show Snoozed Task");
  });

  it("shows snoozed items with ls --all", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create two tasks
    await runCommand(ctx.testHome, ["task", "Normal Task"]);
    await runCommand(ctx.testHome, ["task", "Snoozed Task"]);

    // Get task IDs
    const today = await getCurrentDateFromCli(ctx.testHome);
    const snoozedTaskId = await getItemIdByTitle(
      ctx.testHome,
      "test-workspace",
      today,
      "Snoozed Task",
    );
    assertExists(snoozedTaskId, "Snoozed task ID should be found");

    // Snooze the second task
    await runCommand(ctx.testHome, ["snooze", snoozedTaskId, "2h"]);

    // List all items (including snoozed)
    const lsAllResult = await runCommand(ctx.testHome, ["ls", "--all"]);
    assertEquals(lsAllResult.success, true, `ls --all failed: ${lsAllResult.stderr}`);
    const allLines = extractItemLines(lsAllResult.stdout);

    // Should show both tasks
    assertEquals(allLines.length, 2, "Should list both items with --all");
    const hasNormal = allLines.some((line) => line.includes("Normal Task"));
    const hasSnoozed = allLines.some((line) => line.includes("Snoozed Task"));
    assertEquals(hasNormal, true, "Should show Normal Task");
    assertEquals(hasSnoozed, true, "Should show Snoozed Task");
  });

  it("supports 'sn' alias for snooze command", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create a task
    await runCommand(ctx.testHome, ["task", "Task via alias"]);

    // Get task ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "Task via alias");
    assertExists(taskId, "Task ID should be found");

    // Use 'sn' alias to snooze
    const snResult = await runCommand(ctx.testHome, ["sn", taskId, "1h"]);
    assertEquals(snResult.success, true, `sn alias failed: ${snResult.stderr}`);
    assertEquals(
      snResult.stdout.includes("is snoozing until"),
      true,
      `sn alias should work: ${snResult.stdout}`,
    );
  });

  it("executes full snooze workflow", async () => {
    // Step 1: Navigate to today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Step 2-3: Create two tasks
    const task1Result = await runCommand(ctx.testHome, ["task", "Task 1"]);
    assertEquals(task1Result.success, true, "Task 1 creation should succeed");

    const task2Result = await runCommand(ctx.testHome, ["task", "Task 2"]);
    assertEquals(task2Result.success, true, "Task 2 creation should succeed");

    // Step 4: Verify both tasks are visible
    const ls1Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls1Result.success, true, "Initial ls should succeed");
    const lines1 = extractItemLines(ls1Result.stdout);
    assertEquals(lines1.length, 2, "Should list 2 items initially");

    // Step 5: Get Task 1 ID and snooze it
    const today = await getCurrentDateFromCli(ctx.testHome);
    const task1Id = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "Task 1");
    assertExists(task1Id, "Task 1 ID should be found");

    const snoozeResult = await runCommand(ctx.testHome, ["snooze", task1Id, "2h"]);
    assertEquals(snoozeResult.success, true, "Snooze should succeed");

    // Step 6: Verify only Task 2 is visible
    const ls2Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls2Result.success, true, "Second ls should succeed");
    const lines2 = extractItemLines(ls2Result.stdout);
    assertEquals(lines2.length, 1, "Should list 1 item after snoozing");
    assertEquals(lines2[0].includes("Task 2"), true, "Should show Task 2");
    assertEquals(lines2[0].includes("Task 1"), false, "Should not show Task 1");

    // Step 7: Verify both tasks visible with --all
    const lsAllResult = await runCommand(ctx.testHome, ["ls", "--all"]);
    assertEquals(lsAllResult.success, true, "ls --all should succeed");
    const linesAll = extractItemLines(lsAllResult.stdout);
    assertEquals(linesAll.length, 2, "Should list 2 items with --all");

    // Step 8: Unsnooze Task 1
    const unsnoozeResult = await runCommand(ctx.testHome, ["snooze", task1Id, "--clear"]);
    assertEquals(unsnoozeResult.success, true, "Unsnooze should succeed");

    // Step 9: Verify both tasks are visible again
    const ls3Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls3Result.success, true, "Final ls should succeed");
    const lines3 = extractItemLines(ls3Result.stdout);
    assertEquals(lines3.length, 2, "Should list 2 items after unsnoozing");

    // Step 10: Snooze Task 1 to tomorrow
    const snoozeTomorrowResult = await runCommand(ctx.testHome, ["snooze", task1Id, "tomorrow"]);
    assertEquals(snoozeTomorrowResult.success, true, "Snooze to tomorrow should succeed");

    // Step 11: Verify Task 1 moved to tomorrow (use --logical to see directory date)
    const whereResult = await runCommand(ctx.testHome, ["where", task1Id, "--logical"]);
    assertEquals(whereResult.success, true, "where should succeed");
    const [year, month, day] = today.split("-").map(Number);
    const todayDate = new Date(year, month - 1, day);
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(todayDate.getDate() + 1);
    const tomorrow = `${tomorrowDate.getFullYear()}-${
      String(tomorrowDate.getMonth() + 1).padStart(2, "0")
    }-${String(tomorrowDate.getDate()).padStart(2, "0")}`;
    assertEquals(
      whereResult.stdout.includes(tomorrow),
      true,
      `Task 1 should be in tomorrow's date ${tomorrow}`,
    );
  });
});
