/**
 * E2E Test Scenario: CD/LS Enhancement
 *
 * Purpose:
 *   Verify cd ~ (home), cd - (previous), and ls at non-date CWD.
 *
 * Design Reference:
 *   See docs/stories/20260216T000000_cd-ls-enhancement.story.md
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  runCommand,
  setupTestEnvironment,
  stripAnsi,
  type TestContext,
} from "../helpers.ts";

describe("CD/LS Enhancement", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  // =========================================================================
  // Criterion 1: cd ~ navigates to today (home)
  // =========================================================================

  describe("cd ~", () => {
    it("navigates to today from a different date", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);

      // Navigate away
      await runCommand(ctx.testHome, ["cd", "2025-01-01"]);
      const pwdBefore = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(pwdBefore.stdout, "/2025-01-01");

      // cd ~ should go to today
      const cdResult = await runCommand(ctx.testHome, ["cd", "~"]);
      assertEquals(cdResult.success, true, `cd ~ failed: ${cdResult.stderr}`);
      assertEquals(cdResult.stdout, `/${today}`);

      // Confirm with pwd
      const pwdAfter = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(pwdAfter.stdout, `/${today}`);
    });

    it("navigates to today from /permanent", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);

      await runCommand(ctx.testHome, ["cd", "permanent"]);
      const pwdBefore = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(pwdBefore.stdout, "/permanent");

      const cdResult = await runCommand(ctx.testHome, ["cd", "~"]);
      assertEquals(cdResult.success, true, `cd ~ failed: ${cdResult.stderr}`);
      assertEquals(cdResult.stdout, `/${today}`);
    });
  });

  // =========================================================================
  // Criterion 2: cd - navigates to the previous location
  // =========================================================================

  describe("cd -", () => {
    it("navigates to the previous location", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);

      // Navigate to permanent
      await runCommand(ctx.testHome, ["cd", "permanent"]);
      const pwdBefore = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(pwdBefore.stdout, "/permanent");

      // cd - should go back to today
      const cdResult = await runCommand(ctx.testHome, ["cd", "-"]);
      assertEquals(cdResult.success, true, `cd - failed: ${cdResult.stderr}`);
      assertEquals(cdResult.stdout, `/${today}`);

      // Confirm with pwd
      const pwdAfter = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(pwdAfter.stdout, `/${today}`);
    });

    it("toggles back and forth with consecutive cd -", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);

      // Navigate to permanent
      await runCommand(ctx.testHome, ["cd", "permanent"]);

      // First cd - goes back to today
      const first = await runCommand(ctx.testHome, ["cd", "-"]);
      assertEquals(first.stdout, `/${today}`);

      // Second cd - goes back to permanent
      const second = await runCommand(ctx.testHome, ["cd", "-"]);
      assertEquals(second.stdout, "/permanent");

      // Third cd - goes back to today again
      const third = await runCommand(ctx.testHome, ["cd", "-"]);
      assertEquals(third.stdout, `/${today}`);
    });

    it("shows error when no previous directory exists", async () => {
      // First command ever - no previous location
      const cdResult = await runCommand(ctx.testHome, ["cd", "-"]);
      assertEquals(cdResult.success, false, "cd - should fail with no previous directory");
      assertStringIncludes(cdResult.stderr, "no previous directory");
    });
  });

  // =========================================================================
  // Criterion 3: ls respects non-date CWD
  // =========================================================================

  describe("ls at permanent", () => {
    it("shows only permanent items, not date items, when CWD is /permanent", async () => {
      // Create a task under today's date (it will appear in default date range)
      await runCommand(ctx.testHome, ["task", "date-only-task"]);

      // Create another task with alias and move it to permanent
      await runCommand(ctx.testHome, ["task", "permanent-task", "--alias", "ptask"]);
      const moveResult = await runCommand(ctx.testHome, ["mv", "ptask", "permanent"]);
      assertEquals(moveResult.success, true, `move failed: ${moveResult.stderr}`);

      // Navigate to permanent
      await runCommand(ctx.testHome, ["cd", "permanent"]);
      const pwd = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(pwd.stdout, "/permanent");

      // ls with no args should show ONLY permanent items
      const lsResult = await runCommand(ctx.testHome, ["ls", "--print"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const plainOutput = stripAnsi(lsResult.stdout);
      // Should contain the permanent item
      assertStringIncludes(plainOutput, "permanent-task");
      // Should NOT contain the date-only item
      assertEquals(
        plainOutput.includes("date-only-task"),
        false,
        `ls at /permanent should not show date items, got: ${plainOutput}`,
      );
    });

    it("shows (empty) not date headers when /permanent has no items", async () => {
      // Create a task under today's date so the date range would show something
      await runCommand(ctx.testHome, ["task", "date-task"]);

      // Navigate to permanent (which has no items)
      await runCommand(ctx.testHome, ["cd", "permanent"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", "--print"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should be "(empty)", NOT show the date-task
      const plainOutput = stripAnsi(lsResult.stdout);
      assertEquals(
        plainOutput.includes("date-task"),
        false,
        `ls at empty /permanent should not show date items, got: ${plainOutput}`,
      );
    });
  });
});
