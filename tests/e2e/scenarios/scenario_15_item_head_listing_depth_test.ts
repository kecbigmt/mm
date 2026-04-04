/**
 * E2E Test Scenario 15: Item-head listing with depth expansion
 *
 * Purpose:
 *   Verify that `mm ls` under an item head:
 *   - Omits /0 suffix from partition header
 *   - Expands section contents by default (depth=1)
 *   - Respects --depth option
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  initWorkspace,
  runCd,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 15: Item-head listing with depth expansion", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  const setupBookWithSections = async () => {
    const opts = { sessionDir: ctx.sessionDir };

    // Navigate to today
    await runCd(ctx.testHome, "today", opts);

    // Create a book item
    await runCommand(ctx.testHome, ["note", "Book", "--alias", "book"], opts);

    // Create items under sections
    await runCommand(ctx.testHome, ["note", "Chapter 1 Note", "--dir", "book/1"], opts);
    await runCommand(ctx.testHome, ["note", "Chapter 2 Note", "--dir", "book/2"], opts);

    // Navigate to book
    await runCd(ctx.testHome, "book", opts);
  };

  it("omits /0 suffix from item-head header (print mode)", async () => {
    await setupBookWithSections();
    const opts = { sessionDir: ctx.sessionDir };

    const lsResult = await runCommand(ctx.testHome, ["ls", "-p"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Should NOT contain /0
    const hasSlashZero = lines.some((line) => line.includes("/0]"));
    assertEquals(hasSlashZero, false, `Should not contain /0 in header, got: ${lsResult.stdout}`);
  });

  it("expands section contents by default (depth=1)", async () => {
    await setupBookWithSections();
    const opts = { sessionDir: ctx.sessionDir };

    const lsResult = await runCommand(ctx.testHome, ["ls", "-p"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Should show items inside sections (not just stubs)
    assertEquals(
      lines.some((line) => line.includes("Chapter 1 Note")),
      true,
      `Should show Chapter 1 Note inside section, got: ${lsResult.stdout}`,
    );
    assertEquals(
      lines.some((line) => line.includes("Chapter 2 Note")),
      true,
      `Should show Chapter 2 Note inside section, got: ${lsResult.stdout}`,
    );
  });

  it("shows stubs only with --depth 0", async () => {
    await setupBookWithSections();
    const opts = { sessionDir: ctx.sessionDir };

    const lsResult = await runCommand(ctx.testHome, ["ls", "-p", "-d", "0"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Should show stubs, not expanded items
    // Stubs should show counts (e.g. "1/ (items: 1, sections: 0)")
    const hasStub = lines.some((line) => line.includes("items:"));
    assertEquals(hasStub, true, `Should show section stubs with counts, got: ${lsResult.stdout}`);
  });

  it("does not affect date range listing", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    // Navigate to today
    await runCd(ctx.testHome, "today", opts);

    // Create a regular note
    await runCommand(ctx.testHome, ["note", "Regular Note"], opts);

    // List without being in an item head - should show date range
    const lsResult = await runCommand(ctx.testHome, ["ls", "-p"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(
      lines.some((line) => line.includes("Regular Note")),
      true,
      `Should show the note, got: ${lsResult.stdout}`,
    );
  });

  it("rejects negative depth value", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    await runCd(ctx.testHome, "today", opts);

    const lsResult = await runCommand(ctx.testHome, ["ls", "-d", "-1"], opts);
    assertEquals(
      lsResult.stderr.includes("depth must be a non-negative integer"),
      true,
      `Should show error for negative depth, got stderr: ${lsResult.stderr}`,
    );
  });

  // ===========================================================================
  // Child item expansion (item-to-item nesting)
  // ===========================================================================

  it("depth 1 shows direct child items of a parent", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    await runCd(ctx.testHome, "today", opts);

    // Create parent item
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"], opts);

    // Create child items directly under the parent (no section)
    await runCommand(ctx.testHome, ["note", "Child A", "--dir", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Child B", "--dir", "parent"], opts);

    // Navigate to parent and list with depth 1
    await runCd(ctx.testHome, "parent", opts);
    const lsResult = await runCommand(ctx.testHome, ["ls", "-p", "-d", "1"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Child items should appear (they are partition items shown at top level, then their children)
    assertEquals(
      lines.some((line) => line.includes("Child A")),
      true,
      `Should show Child A, got: ${lsResult.stdout}`,
    );
    assertEquals(
      lines.some((line) => line.includes("Child B")),
      true,
      `Should show Child B, got: ${lsResult.stdout}`,
    );
  });

  it("depth 2 shows grandchild items", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    await runCd(ctx.testHome, "today", opts);

    // Create parent -> child -> grandchild hierarchy
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Child", "--alias", "child", "--dir", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Grandchild", "--dir", "child"], opts);

    // Navigate to parent and list with depth 2
    await runCd(ctx.testHome, "parent", opts);
    const lsResult = await runCommand(ctx.testHome, ["ls", "-p", "-d", "2"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(
      lines.some((line) => line.includes("Grandchild")),
      true,
      `Should show Grandchild at depth 2, got: ${lsResult.stdout}`,
    );
  });

  it("depth 1 does not show grandchild items of already-listed children", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    await runCd(ctx.testHome, "today", opts);

    // Create parent -> child -> grandchild hierarchy
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Child", "--alias", "child", "--dir", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Grandchild", "--dir", "child"], opts);

    // Navigate to parent and list with depth 1
    await runCd(ctx.testHome, "parent", opts);
    const lsResult = await runCommand(ctx.testHome, ["ls", "-p", "-d", "1"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(
      lines.some((line) => line.includes("Child")),
      true,
      `Should show Child at depth 1, got: ${lsResult.stdout}`,
    );
    assertEquals(
      lines.some((line) => line.includes("Grandchild")),
      false,
      `Should NOT show Grandchild at depth 1, got: ${lsResult.stdout}`,
    );
  });

  it("depth 0 does not show grandchild items", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    await runCd(ctx.testHome, "today", opts);

    // Create parent -> child -> grandchild hierarchy
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Child", "--alias", "child", "--dir", "parent"], opts);
    await runCommand(ctx.testHome, ["note", "Grandchild", "--dir", "child"], opts);

    // Navigate to parent and list with depth 0
    await runCd(ctx.testHome, "parent", opts);
    const lsResult = await runCommand(ctx.testHome, ["ls", "-p", "-d", "0"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(
      lines.some((line) => line.includes("Child")),
      true,
      `Should show Child (partition item), got: ${lsResult.stdout}`,
    );
    assertEquals(
      lines.some((line) => line.includes("Grandchild")),
      false,
      `Should NOT show Grandchild at depth 0, got: ${lsResult.stdout}`,
    );
  });

  it("expands both child items and sections", async () => {
    const opts = { sessionDir: ctx.sessionDir };

    await runCd(ctx.testHome, "today", opts);

    // Create parent with both child items and sections
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"], opts);

    // Direct child item (no section)
    await runCommand(ctx.testHome, ["note", "Direct Child", "--dir", "parent"], opts);

    // Item in section 1
    await runCommand(ctx.testHome, ["note", "Section Item", "--dir", "parent/1"], opts);

    // Navigate to parent and list with depth 1
    await runCd(ctx.testHome, "parent", opts);
    const lsResult = await runCommand(ctx.testHome, ["ls", "-p", "-d", "1"], opts);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    // Both direct child and section item should be visible
    assertEquals(
      lines.some((line) => line.includes("Direct Child")),
      true,
      `Should show Direct Child, got: ${lsResult.stdout}`,
    );
    assertEquals(
      lines.some((line) => line.includes("Section Item")),
      true,
      `Should show Section Item from expanded section, got: ${lsResult.stdout}`,
    );
  });
});
