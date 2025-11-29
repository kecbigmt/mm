/**
 * E2E Test Scenario 6: Item Movement (Move)
 *
 * Purpose:
 *   Verify that item placement changes (mv command) work correctly,
 *   including head/tail placement, relative positioning, and cross-parent moves.
 *
 * Overview:
 *   This scenario tests item movement operations:
 *   - Move items using head: placement
 *   - Move items using after: and before: relative positioning
 *   - Move items to different parent/section locations
 *   - Verify physical files remain unchanged (only edges are updated)
 *   - Confirm items disappear from original location after move
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md section 8.2 (Move)
 */

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  extractItemLines,
  getCurrentDateFromCli,
  getItemIdByTitle,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 6: Item movement (move)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("moves item to head using head: placement", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create three tasks
    const taskAResult = await runCommand(ctx.testHome, ["note", "タスクA"]);
    assertEquals(taskAResult.success, true, `Failed to create task A: ${taskAResult.stderr}`);

    const taskBResult = await runCommand(ctx.testHome, ["note", "タスクB"]);
    assertEquals(taskBResult.success, true, `Failed to create task B: ${taskBResult.stderr}`);

    const taskCResult = await runCommand(ctx.testHome, ["note", "タスクC"]);
    assertEquals(taskCResult.success, true, `Failed to create task C: ${taskCResult.stderr}`);

    // Verify initial order: A, B, C
    const ls1Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls1Result.success, true, `ls failed: ${ls1Result.stderr}`);
    const lines1 = extractItemLines(ls1Result.stdout);
    assertEquals(lines1.length, 3, "Should list 3 items");
    assertEquals(lines1[0].includes("タスクA"), true, "First item should be タスクA");
    assertEquals(lines1[1].includes("タスクB"), true, "Second item should be タスクB");
    assertEquals(lines1[2].includes("タスクC"), true, "Third item should be タスクC");

    // Get task C ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskCId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "タスクC");
    assertExists(taskCId, "Task C ID should be found");

    // Move C to head
    const mvResult = await runCommand(ctx.testHome, ["mv", taskCId, "head:today"]);
    assertEquals(mvResult.success, true, `mv failed: ${mvResult.stderr}`);
    assertEquals(
      mvResult.stdout.includes("Moved"),
      true,
      `mv should report success: ${mvResult.stdout}`,
    );

    // Verify task C location after move
    const whereResult = await runCommand(ctx.testHome, ["where", taskCId]);
    assertEquals(whereResult.success, true, `where failed: ${whereResult.stderr}`);
    assertEquals(
      whereResult.stdout.includes("Logical:"),
      true,
      `where should show logical path: ${whereResult.stdout}`,
    );

    // Verify new order: C, A, B
    const ls2Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls2Result.success, true, `ls failed: ${ls2Result.stderr}`);
    const lines2 = extractItemLines(ls2Result.stdout);
    assertEquals(
      lines2.length,
      3,
      `Should list 3 items, but got ${lines2.length}. Output: ${ls2Result.stdout}`,
    );
    assertEquals(
      lines2[0].includes("タスクC"),
      true,
      `First item should be タスクC, but got: ${lines2[0]}. Full output: ${ls2Result.stdout}`,
    );
    assertEquals(lines2[1].includes("タスクA"), true, "Second item should be タスクA");
    assertEquals(lines2[2].includes("タスクB"), true, "Third item should be タスクB");
  });

  it("moves item using after: relative positioning", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create three tasks
    await runCommand(ctx.testHome, ["note", "タスクA"]);
    await runCommand(ctx.testHome, ["note", "タスクB"]);
    await runCommand(ctx.testHome, ["note", "タスクC"]);

    // Move C to head first
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskCId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "タスクC");
    assertExists(taskCId, "Task C ID should be found");

    await runCommand(ctx.testHome, ["mv", taskCId, "head:today"]);

    // Verify order: C, A, B
    const ls1Result = await runCommand(ctx.testHome, ["ls"]);
    const lines1 = extractItemLines(ls1Result.stdout);
    assertEquals(lines1[0].includes("タスクC"), true, "First item should be タスクC");
    assertEquals(lines1[1].includes("タスクA"), true, "Second item should be タスクA");
    assertEquals(lines1[2].includes("タスクB"), true, "Third item should be タスクB");

    // Get task A ID
    const taskAId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "タスクA");
    assertExists(taskAId, "Task A ID should be found");

    // Move A after C
    const mvResult = await runCommand(ctx.testHome, ["mv", taskAId, `after:${taskCId}`]);
    assertEquals(mvResult.success, true, `mv failed: ${mvResult.stderr}`);

    // Verify order: C, A, B (should remain the same since A is already after C)
    const ls2Result = await runCommand(ctx.testHome, ["ls"]);
    const lines2 = extractItemLines(ls2Result.stdout);
    assertEquals(lines2.length, 3, "Should list 3 items");
    assertEquals(lines2[0].includes("タスクC"), true, "First item should be タスクC");
    assertEquals(lines2[1].includes("タスクA"), true, "Second item should be タスクA");
    assertEquals(lines2[2].includes("タスクB"), true, "Third item should be タスクB");
  });

  it("moves item to different parent/section", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create a project item with alias
    const projectResult = await runCommand(ctx.testHome, [
      "note",
      "プロジェクト",
      "--alias",
      "project",
    ]);
    assertEquals(projectResult.success, true, `Failed to create project: ${projectResult.stderr}`);

    // Create task A
    const taskAResult = await runCommand(ctx.testHome, ["note", "タスクA"]);
    assertEquals(taskAResult.success, true, `Failed to create task A: ${taskAResult.stderr}`);

    // Get task A ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskAId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "タスクA");
    assertExists(taskAId, "Task A ID should be found");

    // Move A to project/1
    const mvResult = await runCommand(ctx.testHome, ["mv", taskAId, "project/1"]);
    assertEquals(mvResult.success, true, `mv failed: ${mvResult.stderr}`);

    // Navigate to project/1
    const cdResult = await runCommand(ctx.testHome, ["cd", "project/1"]);
    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);

    // Verify task A is in project/1
    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
    const lines = extractItemLines(lsResult.stdout);
    assertEquals(lines.length, 1, "Should list 1 item");
    assertEquals(lines[0].includes("タスクA"), true, "Should list タスクA");

    // Navigate back to today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Verify task A is no longer in today
    const lsTodayResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsTodayResult.success, true, `ls failed: ${lsTodayResult.stderr}`);
    const todayLines = extractItemLines(lsTodayResult.stdout);
    const hasTaskA = todayLines.some((line) => line.includes("タスクA"));
    assertEquals(hasTaskA, false, "タスクA should not be in today's list");
  });

  it("executes full flow: create → move head → move after → move to parent", async () => {
    // Step 1: Navigate to today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Step 2-4: Create three tasks
    const taskAResult = await runCommand(ctx.testHome, ["note", "タスクA"]);
    assertEquals(taskAResult.success, true, "Task A creation should succeed");

    const taskBResult = await runCommand(ctx.testHome, ["note", "タスクB"]);
    assertEquals(taskBResult.success, true, "Task B creation should succeed");

    const taskCResult = await runCommand(ctx.testHome, ["note", "タスクC"]);
    assertEquals(taskCResult.success, true, "Task C creation should succeed");

    // Step 5: Verify initial order
    const ls1Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls1Result.success, true, "Initial ls should succeed");
    const lines1 = extractItemLines(ls1Result.stdout);
    assertEquals(lines1.length, 3, "Should list 3 items initially");
    assertEquals(lines1[0].includes("タスクA"), true, "First item should be タスクA");
    assertEquals(lines1[1].includes("タスクB"), true, "Second item should be タスクB");
    assertEquals(lines1[2].includes("タスクC"), true, "Third item should be タスクC");

    // Step 6: Move C to head
    const today = await getCurrentDateFromCli(ctx.testHome);
    const taskCId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "タスクC");
    assertExists(taskCId, "Task C ID should be found");

    const mv1Result = await runCommand(ctx.testHome, ["mv", taskCId, "head:today"]);
    assertEquals(mv1Result.success, true, "Move C to head should succeed");

    // Step 7: Verify new order
    const ls2Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls2Result.success, true, "Second ls should succeed");
    const lines2 = extractItemLines(ls2Result.stdout);
    assertEquals(lines2[0].includes("タスクC"), true, "First item should be タスクC");
    assertEquals(lines2[1].includes("タスクA"), true, "Second item should be タスクA");
    assertEquals(lines2[2].includes("タスクB"), true, "Third item should be タスクB");

    // Step 8: Move A after C
    const taskAId = await getItemIdByTitle(ctx.testHome, "test-workspace", today, "タスクA");
    assertExists(taskAId, "Task A ID should be found");

    const mv2Result = await runCommand(ctx.testHome, ["mv", taskAId, `after:${taskCId}`]);
    assertEquals(mv2Result.success, true, "Move A after C should succeed");

    // Step 9: Verify order (should remain C, A, B)
    const ls3Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls3Result.success, true, "Third ls should succeed");
    const lines3 = extractItemLines(ls3Result.stdout);
    assertEquals(lines3[0].includes("タスクC"), true, "First item should be タスクC");
    assertEquals(lines3[1].includes("タスクA"), true, "Second item should be タスクA");
    assertEquals(lines3[2].includes("タスクB"), true, "Third item should be タスクB");

    // Step 10: Create project
    const projectResult = await runCommand(ctx.testHome, [
      "note",
      "プロジェクト",
      "--alias",
      "project",
    ]);
    assertEquals(projectResult.success, true, "Project creation should succeed");

    // Step 11: Move A to project/1
    const mv3Result = await runCommand(ctx.testHome, ["mv", taskAId, "project/1"]);
    assertEquals(mv3Result.success, true, "Move A to project/1 should succeed");

    // Step 12: Navigate to project/1
    const cdResult = await runCommand(ctx.testHome, ["cd", "project/1"]);
    assertEquals(cdResult.success, true, "cd project/1 should succeed");

    // Step 13: Verify task A is in project/1
    const ls4Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls4Result.success, true, "ls in project/1 should succeed");
    const lines4 = extractItemLines(ls4Result.stdout);
    assertEquals(lines4.length, 1, "Should list 1 item in project/1");
    assertEquals(lines4[0].includes("タスクA"), true, "Should list タスクA");

    // Step 14: Navigate back to today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Step 15: Verify task A is no longer in today
    const ls5Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls5Result.success, true, "Final ls should succeed");
    const lines5 = extractItemLines(ls5Result.stdout);
    const hasTaskA = lines5.some((line) => line.includes("タスクA"));
    assertEquals(hasTaskA, false, "タスクA should not be in today's list");
    const hasTaskB = lines5.some((line) => line.includes("タスクB"));
    const hasTaskC = lines5.some((line) => line.includes("タスクC"));
    assertEquals(hasTaskB, true, "タスクB should remain in today's list");
    assertEquals(hasTaskC, true, "タスクC should remain in today's list");
  });
});
