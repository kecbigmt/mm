/**
 * E2E Test: Move to Permanent Placement
 *
 * Purpose:
 *   Verify that items can be moved to/from permanent placement using `mm mv`.
 *
 * Overview:
 *   This scenario tests:
 *   - Moving date-based items to permanent placement
 *   - Moving permanent items back to date placement
 *   - Listing behavior after moves
 *   - Moving multiple items at once
 *   - Error handling for invalid references
 *
 * Design Reference:
 *   See docs/stories/20260102_permanent-notes-project-context/20260104T032446_move-to-permanent.story.md
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  extractItemLines,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("E2E: Move to Permanent Placement", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("Moving to permanent placement", () => {
    it("moves date-based item to permanent with mm mv <item> permanent", async () => {
      // Create a date-based note with alias
      const createResult = await runCommand(ctx.testHome, [
        "note",
        "My Note",
        "--alias",
        "my-note",
      ]);
      assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

      // Move to permanent
      const moveResult = await runCommand(ctx.testHome, ["mv", "my-note", "permanent"]);
      assertEquals(moveResult.success, true, `Failed to move: ${moveResult.stderr}`);
      assertEquals(moveResult.stdout.includes("Moved"), true, "Should show move confirmation");
      assertEquals(
        moveResult.stdout.includes("permanent"),
        true,
        "Should show permanent in output",
      );
    });

    it("item appears in permanent list after move", async () => {
      // Create a date-based note with alias
      await runCommand(ctx.testHome, ["note", "My Note", "--alias", "my-note"]);

      // Verify it's in today's list
      const lsBefore = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsBefore.stdout.includes("My Note"), true, "Should be in date list before move");

      // Move to permanent
      await runCommand(ctx.testHome, ["mv", "my-note", "permanent"]);

      // Verify it's now in permanent list
      const lsAfter = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(
        lsAfter.stdout.includes("My Note"),
        true,
        "Should be in permanent list after move",
      );

      // Verify it's no longer in date list
      const lsDateAfter = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(
        lsDateAfter.stdout.includes("My Note"),
        false,
        "Should NOT be in date list after move",
      );
    });

    it("edge file moves to permanent directory", async () => {
      // Create a date-based note with alias
      await runCommand(ctx.testHome, ["note", "Edge Test", "--alias", "edge-test"]);

      // Move to permanent
      await runCommand(ctx.testHome, ["mv", "edge-test", "permanent"]);

      // Verify edge exists in permanent by checking listing works
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true, "Should be able to list permanent items");
      assertEquals(
        lsResult.stdout.includes("Edge Test"),
        true,
        "Item should be found in permanent listing (edge file exists)",
      );
    });

    it("moves item by alias reference", async () => {
      // Create a date-based note with alias
      await runCommand(ctx.testHome, ["note", "Aliased Note", "--alias", "aliased"]);

      // Move using alias
      const moveResult = await runCommand(ctx.testHome, ["mv", "aliased", "permanent"]);
      assertEquals(moveResult.success, true, `Failed to move by alias: ${moveResult.stderr}`);
      assertEquals(moveResult.stdout.includes("Moved"), true);
    });
  });

  describe("Moving from permanent to date", () => {
    it("moves permanent item to specific date", async () => {
      // Create a permanent note
      await runCommand(ctx.testHome, [
        "note",
        "Permanent Note",
        "--placement",
        "permanent",
        "--alias",
        "perm-note",
      ]);

      // Move to a specific date
      const moveResult = await runCommand(ctx.testHome, ["mv", "perm-note", "2025-01-15"]);
      assertEquals(moveResult.success, true, `Failed to move: ${moveResult.stderr}`);
      assertEquals(moveResult.stdout.includes("2025-01-15"), true, "Should show date in output");

      // Verify by listing the date
      const lsResult = await runCommand(ctx.testHome, ["ls", "2025-01-15"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
      assertEquals(
        lsResult.stdout.includes("Permanent Note"),
        true,
        "Item should appear in date listing",
      );
    });

    it("moves permanent item to today", async () => {
      // Create a permanent note
      await runCommand(ctx.testHome, [
        "note",
        "Permanent Note",
        "--placement",
        "permanent",
        "--alias",
        "perm-note",
      ]);

      // Move to today
      const moveResult = await runCommand(ctx.testHome, ["mv", "perm-note", "today"]);
      assertEquals(moveResult.success, true, `Failed to move: ${moveResult.stderr}`);

      // Verify by listing today
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
      assertEquals(
        lsResult.stdout.includes("Permanent Note"),
        true,
        "Item should appear in today's listing",
      );

      // Should NOT appear in permanent list anymore
      const lsPermanentResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(
        lsPermanentResult.stdout.includes("Permanent Note"),
        false,
        "Item should NOT appear in permanent listing after moving to date",
      );
    });
  });

  describe("Listing after move", () => {
    it("moved item appears in mm ls permanent", async () => {
      // Create a date-based note and move it
      await runCommand(ctx.testHome, ["note", "Move Me", "--alias", "move-me"]);
      await runCommand(ctx.testHome, ["mv", "move-me", "permanent"]);

      // List permanent items
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines.some((line) => line.includes("Move Me")),
        true,
        "Moved item should appear in permanent list",
      );
    });

    it("moved item does not appear in date-based ls", async () => {
      // Create a date-based note and move it to permanent
      await runCommand(ctx.testHome, ["note", "Move Me", "--alias", "move-me"]);
      await runCommand(ctx.testHome, ["mv", "move-me", "permanent"]);

      // List today's items
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should not find the moved item
      assertEquals(
        lsResult.stdout.includes("Move Me"),
        false,
        "Moved item should NOT appear in date list",
      );
    });
  });

  describe("Multiple items", () => {
    it("moves multiple items to permanent in one command", async () => {
      // Create two date-based notes
      await runCommand(ctx.testHome, ["note", "First Note", "--alias", "first"]);
      await runCommand(ctx.testHome, ["note", "Second Note", "--alias", "second"]);

      // Move both to permanent
      const moveResult = await runCommand(ctx.testHome, ["mv", "first", "second", "permanent"]);
      assertEquals(moveResult.success, true, `Failed to move: ${moveResult.stderr}`);

      // Verify both appear in permanent list
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 2, "Should have 2 permanent items");
      assertEquals(
        itemLines.some((line) => line.includes("First Note")),
        true,
        "First note should be in permanent",
      );
      assertEquals(
        itemLines.some((line) => line.includes("Second Note")),
        true,
        "Second note should be in permanent",
      );
    });
  });

  describe("Error cases", () => {
    it("shows error for non-existent item", async () => {
      const moveResult = await runCommand(ctx.testHome, ["mv", "nonexistent", "permanent"]);
      assertEquals(
        moveResult.stderr.includes("not found") || moveResult.stderr.includes("alias"),
        true,
        `Should show error about item not found. stderr: ${moveResult.stderr}`,
      );
    });
  });
});
