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
  extractItemLines,
  initWorkspace,
  runCd,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

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
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create chapter1 item with alias
    const chapterResult = await runCommand(ctx.testHome, [
      "note",
      "Chapter 1",
      "--alias",
      "chapter1",
    ], { mmCwd: cdToday.mmCwd! });
    assertEquals(chapterResult.success, true, `Failed to create chapter: ${chapterResult.stderr}`);

    // Create pages under chapter1/1 section
    const page1Result = await runCommand(ctx.testHome, [
      "note",
      "Page 1",
      "--parent",
      "chapter1/1",
    ], { mmCwd: cdToday.mmCwd! });
    assertEquals(page1Result.success, true, `Failed to create page1: ${page1Result.stderr}`);

    const page2Result = await runCommand(ctx.testHome, [
      "note",
      "Page 2",
      "--parent",
      "chapter1/1",
    ], { mmCwd: cdToday.mmCwd! });
    assertEquals(page2Result.success, true, `Failed to create page2: ${page2Result.stderr}`);

    const page3Result = await runCommand(ctx.testHome, [
      "note",
      "Page 3",
      "--parent",
      "chapter1/1",
    ], { mmCwd: cdToday.mmCwd! });
    assertEquals(page3Result.success, true, `Failed to create page3: ${page3Result.stderr}`);
  });

  it("navigates to numeric sections and lists items", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create chapter1 item with alias
    const chapterResult = await runCommand(ctx.testHome, [
      "note",
      "Chapter 1",
      "--alias",
      "chapter1",
    ], { mmCwd: cdToday.mmCwd! });
    assertEquals(chapterResult.success, true, `Failed to create chapter: ${chapterResult.stderr}`);

    // Create pages under chapter1/1
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "chapter1/1"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "chapter1/1"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to chapter1/1
    const cdResult = await runCd(ctx.testHome, "chapter1/1", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);

    // Verify CWD
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1/1"), true, "CWD should be chapter1/1");

    // List items in section
    const lsResult = await runCommand(ctx.testHome, ["ls"], { mmCwd: cdResult.mmCwd! });
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const itemLines = extractItemLines(lsResult.stdout);
    assertEquals(itemLines.length, 3, "Should list 3 pages");
    assertEquals(itemLines[0].includes("Page 1"), true, "First item should be Page 1");
    assertEquals(itemLines[1].includes("Page 2"), true, "Second item should be Page 2");
    assertEquals(itemLines[2].includes("Page 3"), true, "Third item should be Page 3");
  });

  it("navigates up sections using relative path", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create chapter1 and pages
    await runCommand(ctx.testHome, ["note", "Chapter 1", "--alias", "chapter1"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to chapter1/1
    const cdSection = await runCd(ctx.testHome, "chapter1/1", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdSection.success, true, `cd chapter1/1 failed: ${cdSection.stderr}`);

    // Navigate up one section
    const cdUpResult = await runCd(ctx.testHome, "../", { mmCwd: cdSection.mmCwd! });
    assertEquals(cdUpResult.success, true, `cd .. failed: ${cdUpResult.stderr}`);

    // Verify CWD is chapter1
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdUpResult.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1"), true, "CWD should be chapter1");
    assertEquals(pwdResult.stdout.includes("/1"), false, "CWD should not include /1");
  });

  it("navigates to child sections using section numbers", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create chapter1 and pages
    await runCommand(ctx.testHome, ["note", "Chapter 1", "--alias", "chapter1"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to chapter1
    const cdChapter = await runCd(ctx.testHome, "chapter1", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdChapter.success, true, `cd chapter1 failed: ${cdChapter.stderr}`);

    // Navigate to section 1
    const cdSectionResult = await runCd(ctx.testHome, "1", { mmCwd: cdChapter.mmCwd! });
    assertEquals(cdSectionResult.success, true, `cd 1 failed: ${cdSectionResult.stderr}`);

    // Verify CWD is chapter1/1
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdSectionResult.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1/1"), true, "CWD should be chapter1/1");
  });

  it("creates deep hierarchies and navigates through them", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create chapter1
    await runCommand(ctx.testHome, ["note", "Chapter 1", "--alias", "chapter1"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Create page under chapter1/1
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to chapter1/1
    const cdSection = await runCd(ctx.testHome, "chapter1/1", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdSection.success, true, `cd chapter1/1 failed: ${cdSection.stderr}`);

    // Create sub-page under ./2 (relative to current CWD)
    const subPageResult = await runCommand(ctx.testHome, [
      "note",
      "Sub-page 1",
      "--parent",
      "./2",
    ], { mmCwd: cdSection.mmCwd! });
    assertEquals(subPageResult.success, true, `Failed to create sub-page: ${subPageResult.stderr}`);

    // Navigate to section 2
    const cd2Result = await runCd(ctx.testHome, "2", { mmCwd: cdSection.mmCwd! });
    assertEquals(cd2Result.success, true, `cd 2 failed: ${cd2Result.stderr}`);

    // Verify CWD is chapter1/1/2
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cd2Result.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("chapter1/1/2"), true, "CWD should be chapter1/1/2");

    // List items in section 2
    const lsResult = await runCommand(ctx.testHome, ["ls"], { mmCwd: cd2Result.mmCwd! });
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const itemLines = extractItemLines(lsResult.stdout);
    assertEquals(itemLines.length, 1, "Should list 1 sub-page");
    assertEquals(itemLines[0].includes("Sub-page 1"), true, "Should list Sub-page 1");
  });

  it("executes full flow: create hierarchy → navigate → list", async () => {
    // Step 1: Navigate to today
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, "cd today should succeed");
    let currentCwd = cdToday.mmCwd!;

    // Step 2: Create chapter1 with alias
    const chapterResult = await runCommand(ctx.testHome, [
      "note",
      "Chapter 1",
      "--alias",
      "chapter1",
    ], { mmCwd: currentCwd });
    assertEquals(chapterResult.success, true, "Chapter creation should succeed");

    // Step 3-5: Create pages under chapter1/1
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter1/1"], {
      mmCwd: currentCwd,
    });
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "chapter1/1"], {
      mmCwd: currentCwd,
    });
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "chapter1/1"], {
      mmCwd: currentCwd,
    });

    // Step 6: Navigate to chapter1/1
    const cd1Result = await runCd(ctx.testHome, "chapter1/1", { mmCwd: currentCwd });
    assertEquals(cd1Result.success, true, "cd chapter1/1 should succeed");
    currentCwd = cd1Result.mmCwd!;

    // Step 7: List items
    const ls1Result = await runCommand(ctx.testHome, ["ls"], { mmCwd: currentCwd });
    assertEquals(ls1Result.success, true, "ls should succeed");
    const itemLines1 = extractItemLines(ls1Result.stdout);
    assertEquals(itemLines1.length, 3, "Should list 3 pages");

    // Step 8: Navigate up
    const cdUp = await runCd(ctx.testHome, "../", { mmCwd: currentCwd });
    assertEquals(cdUp.success, true, "cd ../ should succeed");
    currentCwd = cdUp.mmCwd!;

    // Step 9: Navigate to section 1
    const cdSection1 = await runCd(ctx.testHome, "1", { mmCwd: currentCwd });
    assertEquals(cdSection1.success, true, "cd 1 should succeed");
    currentCwd = cdSection1.mmCwd!;

    // Step 10: Create sub-page under ./2
    await runCommand(ctx.testHome, ["note", "Sub-page 1", "--parent", "./2"], {
      mmCwd: currentCwd,
    });

    // Step 11: Navigate to section 2
    const cdSection2 = await runCd(ctx.testHome, "2", { mmCwd: currentCwd });
    assertEquals(cdSection2.success, true, "cd 2 should succeed");
    currentCwd = cdSection2.mmCwd!;

    // Step 12: List items
    const ls2Result = await runCommand(ctx.testHome, ["ls"], { mmCwd: currentCwd });
    assertEquals(ls2Result.success, true, "ls should succeed");
    const itemLines2 = extractItemLines(ls2Result.stdout);
    assertEquals(itemLines2.length, 1, "Should list 1 sub-page");

    // Step 13: Verify final CWD
    const finalPwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: currentCwd });
    assertEquals(finalPwdResult.success, true, "pwd should succeed");
    assertEquals(
      finalPwdResult.stdout.includes("chapter1/1/2"),
      true,
      "Final CWD should be chapter1/1/2",
    );
  });
});
