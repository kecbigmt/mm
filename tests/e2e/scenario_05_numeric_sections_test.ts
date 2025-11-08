/**
 * E2E Test Scenario 5: Numeric Section Creation and Navigation
 *
 * Purpose:
 *   Verify that numeric sections can be created and navigated correctly,
 *   including hierarchical structures and relative navigation.
 *
 * Overview:
 *   This scenario tests numeric section operations:
 *   - Create items with numeric section parents (e.g., chapter1/1)
 *   - Navigate to numeric sections using cd command
 *   - Use relative navigation (..) to move up sections
 *   - Navigate to child sections using section numbers
 *   - Create deep hierarchies (e.g., /1/2/3)
 *   - List items within numeric sections
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md section 3.2 (Section)
 *   and section 5 (Logical Navigation)
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "./helpers.ts";

describe("Scenario 5: Numeric section creation and navigation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates items under numeric sections", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create chapter1 item with alias
    const chapterResult = await runCommand(ctx.testHome, [
      "note",
      "Chapter 1",
      "--alias",
      "chapter1",
    ]);
    assertEquals(chapterResult.success, true, `Failed to create chapter: ${chapterResult.stderr}`);

    // Create pages under chapter1/1 section
    const page1Result = await runCommand(ctx.testHome, [
      "note",
      "Page 1",
      "--parent",
      "chapter1/1",
    ]);
    assertEquals(page1Result.success, true, `Failed to create page1: ${page1Result.stderr}`);

    const page2Result = await runCommand(ctx.testHome, [
      "note",
      "Page 2",
      "--parent",
      "chapter1/1",
    ]);
    assertEquals(page2Result.success, true, `Failed to create page2: ${page2Result.stderr}`);

    const page3Result = await runCommand(ctx.testHome, [
      "note",
      "Page 3",
      "--parent",
      "chapter1/1",
    ]);
    assertEquals(page3Result.success, true, `Failed to create page3: ${page3Result.stderr}`);
  });

  it("navigates to numeric sections and lists items", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create chapter1 item with alias
    const chapterResult = await runCommand(ctx.testHome, [
      "note",
      "Chapter 1",
      "--alias",
      "chapter1",
    ]);
    assertEquals(chapterResult.success, true, `Failed to create chapter: ${chapterResult.stderr}`);

    // Create pages under chapter1/1
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"]);
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "chapter1/1"]);
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "chapter1/1"]);

    // Navigate to chapter1/1
    const cdResult = await runCommand(ctx.testHome, ["cd", "chapter1/1"]);
    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);

    // Verify CWD
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1/1"), true, "CWD should be chapter1/1");

    // List items in section
    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length, 3, "Should list 3 pages");
    assertEquals(lines[0].includes("Page 1"), true, "First item should be Page 1");
    assertEquals(lines[1].includes("Page 2"), true, "Second item should be Page 2");
    assertEquals(lines[2].includes("Page 3"), true, "Third item should be Page 3");
  });

  it("navigates up sections using relative path", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create chapter1 and pages
    await runCommand(ctx.testHome, ["note", "Chapter 1", "--alias", "chapter1"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"]);

    // Navigate to chapter1/1
    await runCommand(ctx.testHome, ["cd", "chapter1/1"]);

    // Navigate up one section
    const cdUpResult = await runCommand(ctx.testHome, ["cd", "../"]);
    assertEquals(cdUpResult.success, true, `cd .. failed: ${cdUpResult.stderr}`);

    // Verify CWD is chapter1
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1"), true, "CWD should be chapter1");
    assertEquals(pwdResult.stdout.includes("/1"), false, "CWD should not include /1");
  });

  it("navigates to child sections using section numbers", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create chapter1 and pages
    await runCommand(ctx.testHome, ["note", "Chapter 1", "--alias", "chapter1"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"]);

    // Navigate to chapter1
    await runCommand(ctx.testHome, ["cd", "chapter1"]);

    // Navigate to section 1
    const cdSectionResult = await runCommand(ctx.testHome, ["cd", "1"]);
    assertEquals(cdSectionResult.success, true, `cd 1 failed: ${cdSectionResult.stderr}`);

    // Verify CWD is chapter1/1
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1/1"), true, "CWD should be chapter1/1");
  });

  it("creates deep hierarchies and navigates through them", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create chapter1
    await runCommand(ctx.testHome, ["note", "Chapter 1", "--alias", "chapter1"]);

    // Create page under chapter1/1
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"]);

    // Navigate to chapter1/1
    await runCommand(ctx.testHome, ["cd", "chapter1/1"]);

    // Create sub-page under ./2 (relative to current CWD)
    const subPageResult = await runCommand(ctx.testHome, [
      "note",
      "Sub-page 1",
      "--parent",
      "./2",
    ]);
    assertEquals(subPageResult.success, true, `Failed to create sub-page: ${subPageResult.stderr}`);

    // Navigate to section 2
    const cd2Result = await runCommand(ctx.testHome, ["cd", "2"]);
    assertEquals(cd2Result.success, true, `cd 2 failed: ${cd2Result.stderr}`);

    // Verify CWD is chapter1/1/2
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1/1/2"), true, "CWD should be chapter1/1/2");

    // List items in section 2
    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length, 1, "Should list 1 sub-page");
    assertEquals(lines[0].includes("Sub-page 1"), true, "Should list Sub-page 1");
  });

  it("executes full flow: create hierarchy → navigate → list", async () => {
    // Step 1: Navigate to today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Step 2: Create chapter1 with alias
    const chapterResult = await runCommand(ctx.testHome, [
      "note",
      "Chapter 1",
      "--alias",
      "chapter1",
    ]);
    assertEquals(chapterResult.success, true, "Chapter creation should succeed");

    // Step 3-5: Create pages under chapter1/1
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"]);
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "chapter1/1"]);
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "chapter1/1"]);

    // Step 6: Navigate to chapter1/1
    const cd1Result = await runCommand(ctx.testHome, ["cd", "chapter1/1"]);
    assertEquals(cd1Result.success, true, "cd chapter1/1 should succeed");

    // Step 7: List items
    const ls1Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls1Result.success, true, "ls should succeed");
    const lines1 = ls1Result.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines1.length, 3, "Should list 3 pages");

    // Step 8: Navigate up
    await runCommand(ctx.testHome, ["cd", "../"]);

    // Step 9: Navigate to section 1
    await runCommand(ctx.testHome, ["cd", "1"]);

    // Step 10: Create sub-page under ./2
    await runCommand(ctx.testHome, ["note", "Sub-page 1", "--parent", "./2"]);

    // Step 11: Navigate to section 2
    await runCommand(ctx.testHome, ["cd", "2"]);

    // Step 12: List items
    const ls2Result = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(ls2Result.success, true, "ls should succeed");
    const lines2 = ls2Result.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines2.length, 1, "Should list 1 sub-page");

    // Step 13: Verify final CWD
    const finalPwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(finalPwdResult.success, true, "pwd should succeed");
    assertEquals(
      finalPwdResult.stdout.includes("chapter1/1/2"),
      true,
      "Final CWD should be chapter1/1/2",
    );
  });
});
