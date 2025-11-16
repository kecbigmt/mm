/**
 * E2E Test Scenario 9: Numeric Section Range Listing
 *
 * Purpose:
 *   Verify that numeric section ranges (e.g., book/1..3) can be used with
 *   the `ls` command to list items across multiple sections.
 *
 * Overview:
 *   This scenario tests numeric section range operations:
 *   - Create items under multiple numeric sections (e.g., book/1, book/2, etc.)
 *   - List items using numeric range syntax (e.g., book/1..3)
 *   - Verify range is inclusive (both start and end included)
 *   - Test ranges from different CWD contexts
 *   - Verify items are listed correctly across the range
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md section 4.3 (Ranges)
 *   and e2e-test-scenarios.md Scenario 9
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 9: Numeric section range listing", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates items under multiple numeric sections", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create book item with alias
    const bookResult = await runCommand(ctx.testHome, [
      "note",
      "Book",
      "--alias",
      "book",
    ]);
    assertEquals(bookResult.success, true, `Failed to create book: ${bookResult.stderr}`);

    // Create pages under different sections
    const page1Result = await runCommand(ctx.testHome, [
      "note",
      "Page 1",
      "--parent",
      "book/1",
    ]);
    assertEquals(page1Result.success, true, `Failed to create page1: ${page1Result.stderr}`);

    const page2Result = await runCommand(ctx.testHome, [
      "note",
      "Page 2",
      "--parent",
      "book/2",
    ]);
    assertEquals(page2Result.success, true, `Failed to create page2: ${page2Result.stderr}`);

    const page3Result = await runCommand(ctx.testHome, [
      "note",
      "Page 3",
      "--parent",
      "book/3",
    ]);
    assertEquals(page3Result.success, true, `Failed to create page3: ${page3Result.stderr}`);

    const page4Result = await runCommand(ctx.testHome, [
      "note",
      "Page 4",
      "--parent",
      "book/4",
    ]);
    assertEquals(page4Result.success, true, `Failed to create page4: ${page4Result.stderr}`);

    const page5Result = await runCommand(ctx.testHome, [
      "note",
      "Page 5",
      "--parent",
      "book/5",
    ]);
    assertEquals(page5Result.success, true, `Failed to create page5: ${page5Result.stderr}`);
  });

  it("lists items using numeric range from root path", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create book and pages
    await runCommand(ctx.testHome, ["note", "Book", "--alias", "book"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "book/1"]);
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "book/2"]);
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "book/3"]);
    await runCommand(ctx.testHome, ["note", "Page 4", "--parent", "book/4"]);
    await runCommand(ctx.testHome, ["note", "Page 5", "--parent", "book/5"]);

    // List items using range 1..3
    const lsResult = await runCommand(ctx.testHome, ["ls", "book/1..3"]);
    assertEquals(lsResult.success, true, `ls book/1..3 failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Should include pages 1, 2, and 3 (inclusive range)
    assertEquals(lines.length >= 3, true, "Should list at least 3 pages");
    assertEquals(lines.some((line) => line.includes("Page 1")), true, "Should include Page 1");
    assertEquals(lines.some((line) => line.includes("Page 2")), true, "Should include Page 2");
    assertEquals(lines.some((line) => line.includes("Page 3")), true, "Should include Page 3");
    // Should not include pages outside the range
    assertEquals(lines.some((line) => line.includes("Page 4")), false, "Should not include Page 4");
    assertEquals(lines.some((line) => line.includes("Page 5")), false, "Should not include Page 5");
  });

  it("lists items using numeric range with different start/end", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create book and pages
    await runCommand(ctx.testHome, ["note", "Book", "--alias", "book"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "book/1"]);
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "book/2"]);
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "book/3"]);
    await runCommand(ctx.testHome, ["note", "Page 4", "--parent", "book/4"]);
    await runCommand(ctx.testHome, ["note", "Page 5", "--parent", "book/5"]);

    // List items using range 2..5
    const lsResult = await runCommand(ctx.testHome, ["ls", "book/2..5"]);
    assertEquals(lsResult.success, true, `ls book/2..5 failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Should include pages 2, 3, 4, and 5 (inclusive range)
    assertEquals(lines.length >= 4, true, "Should list at least 4 pages");
    assertEquals(lines.some((line) => line.includes("Page 2")), true, "Should include Page 2");
    assertEquals(lines.some((line) => line.includes("Page 3")), true, "Should include Page 3");
    assertEquals(lines.some((line) => line.includes("Page 4")), true, "Should include Page 4");
    assertEquals(lines.some((line) => line.includes("Page 5")), true, "Should include Page 5");
    // Should not include page 1
    assertEquals(lines.some((line) => line.includes("Page 1")), false, "Should not include Page 1");
  });

  it("lists items using numeric range from CWD context", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create book and pages
    await runCommand(ctx.testHome, ["note", "Book", "--alias", "book"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "book/1"]);
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "book/2"]);
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "book/3"]);
    await runCommand(ctx.testHome, ["note", "Page 4", "--parent", "book/4"]);
    await runCommand(ctx.testHome, ["note", "Page 5", "--parent", "book/5"]);

    // Navigate to book
    const cdResult = await runCommand(ctx.testHome, ["cd", "book"]);
    assertEquals(cdResult.success, true, `cd book failed: ${cdResult.stderr}`);

    // Verify CWD
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("book"), true, "CWD should be book");

    // List items using range 1..5 from CWD
    const lsResult = await runCommand(ctx.testHome, ["ls", "1..5"]);
    if (!lsResult.success) {
      console.error(`ls failed: ${lsResult.stderr}`);
      console.error(`stdout: ${lsResult.stdout}`);
    }
    assertEquals(lsResult.success, true, `ls 1..5 failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Should include all 5 pages (inclusive range)
    console.log(`Found ${lines.length} lines: ${lines.join(", ")}`);
    assertEquals(lines.length >= 5, true, `Should list at least 5 pages, got ${lines.length}`);
    assertEquals(lines.some((line) => line.includes("Page 1")), true, "Should include Page 1");
    assertEquals(lines.some((line) => line.includes("Page 2")), true, "Should include Page 2");
    assertEquals(lines.some((line) => line.includes("Page 3")), true, "Should include Page 3");
    assertEquals(lines.some((line) => line.includes("Page 4")), true, "Should include Page 4");
    assertEquals(lines.some((line) => line.includes("Page 5")), true, "Should include Page 5");
  });

  it("executes full flow: create → range list → verify inclusiveness", async () => {
    // Step 1: Navigate to today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Step 2: Create book item with alias
    const bookResult = await runCommand(ctx.testHome, [
      "note",
      "Book",
      "--alias",
      "book",
    ]);
    assertEquals(bookResult.success, true, "Book creation should succeed");

    // Step 3-7: Create pages under different sections
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "book/1"]);
    await runCommand(ctx.testHome, ["note", "Page 2", "--parent", "book/2"]);
    await runCommand(ctx.testHome, ["note", "Page 3", "--parent", "book/3"]);
    await runCommand(ctx.testHome, ["note", "Page 4", "--parent", "book/4"]);
    await runCommand(ctx.testHome, ["note", "Page 5", "--parent", "book/5"]);

    // Step 8: List items using range 1..3
    const ls1Result = await runCommand(ctx.testHome, ["ls", "book/1..3"]);
    assertEquals(ls1Result.success, true, "ls book/1..3 should succeed");
    const lines1 = ls1Result.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines1.length >= 3, true, "Should list at least 3 pages");
    assertEquals(
      lines1.some((line) => line.includes("Page 1")),
      true,
      "Should include Page 1",
    );
    assertEquals(
      lines1.some((line) => line.includes("Page 3")),
      true,
      "Should include Page 3 (inclusive)",
    );

    // Step 9: List items using range 2..5
    const ls2Result = await runCommand(ctx.testHome, ["ls", "book/2..5"]);
    assertEquals(ls2Result.success, true, "ls book/2..5 should succeed");
    const lines2 = ls2Result.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines2.length >= 4, true, "Should list at least 4 pages");
    assertEquals(
      lines2.some((line) => line.includes("Page 2")),
      true,
      "Should include Page 2",
    );
    assertEquals(
      lines2.some((line) => line.includes("Page 5")),
      true,
      "Should include Page 5 (inclusive)",
    );

    // Step 10: Navigate to book
    await runCommand(ctx.testHome, ["cd", "book"]);

    // Step 11: List items using range 1..5 from CWD
    const ls3Result = await runCommand(ctx.testHome, ["ls", "1..5"]);
    assertEquals(ls3Result.success, true, "ls 1..5 should succeed");
    const lines3 = ls3Result.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines3.length >= 5, true, "Should list all 5 pages");
    assertEquals(
      lines3.some((line) => line.includes("Page 1")),
      true,
      "Should include Page 1",
    );
    assertEquals(
      lines3.some((line) => line.includes("Page 5")),
      true,
      "Should include Page 5 (inclusive)",
    );
  });

  it("handles single-section range (same start and end)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create book and page
    await runCommand(ctx.testHome, ["note", "Book", "--alias", "book"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "book/1"]);

    // List items using range 1..1 (single section)
    const lsResult = await runCommand(ctx.testHome, ["ls", "book/1..1"]);
    assertEquals(lsResult.success, true, `ls book/1..1 failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length >= 1, true, "Should list at least 1 page");
    assertEquals(lines.some((line) => line.includes("Page 1")), true, "Should include Page 1");
  });
});
