/**
 * E2E Test Scenario 8: CD Home Navigation
 *
 * Purpose:
 *   Verify that `mm cd` without arguments navigates to today's date (home),
 *   matching standard bash cd behavior.
 *
 * Overview:
 *   This scenario tests cd command home navigation:
 *   - Run `mm cd` without arguments from different locations
 *   - Verify navigation to today's date
 *   - Confirm output shows the new placement
 *   - Test workspace option compatibility
 *
 * Design Reference:
 *   See docs/stories/20260121T005127_cd_no_args_home.story.md
 */

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 8: CD home navigation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("navigates to today when cd without arguments", async () => {
    // Get today's date from the workspace
    const today = await getCurrentDateFromCli(ctx.testHome);

    // Navigate away from today
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    await runCommand(ctx.testHome, ["cd", yesterdayStr]);

    // Verify we're at yesterday
    const pwdBefore = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdBefore.stdout, `/${yesterdayStr}`);

    // Run cd without arguments - should navigate to today
    const cdResult = await runCommand(ctx.testHome, ["cd"]);

    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);
    assertEquals(cdResult.stdout, `/${today}`, "cd without args should navigate to today");

    // Verify pwd confirms the navigation
    const pwdAfter = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdAfter.stdout, `/${today}`, "pwd should confirm CWD is today");
  });

  it("displays today's date after cd without arguments", async () => {
    // Navigate to a specific date
    await runCommand(ctx.testHome, ["cd", "2025-01-01"]);

    // Run cd without arguments
    const cdResult = await runCommand(ctx.testHome, ["cd"]);

    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);
    // Output should be today's date in /YYYY-MM-DD format
    const match = cdResult.stdout.match(/^\/\d{4}-\d{2}-\d{2}$/);
    assertExists(match, `cd output should be today's date path, got: ${cdResult.stdout}`);
  });

  it("works even when today's container does not exist", async () => {
    // Get today's date
    const today = await getCurrentDateFromCli(ctx.testHome);

    // Navigate to a past date
    await runCommand(ctx.testHome, ["cd", "2024-01-01"]);

    // Run cd without arguments - should navigate to today even if container doesn't exist
    const cdResult = await runCommand(ctx.testHome, ["cd"]);

    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);
    assertEquals(
      cdResult.stdout,
      `/${today}`,
      "cd without args should work for non-existent container",
    );
  });

  it("is idempotent when already at today", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);

    // Should already be at today after init
    const pwdBefore = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdBefore.stdout, `/${today}`);

    // Run cd without arguments
    const cdResult = await runCommand(ctx.testHome, ["cd"]);

    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);
    assertEquals(cdResult.stdout, `/${today}`, "cd without args should stay at today");

    // Confirm with pwd
    const pwdAfter = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdAfter.stdout, `/${today}`, "pwd should confirm still at today");
  });

  it("respects workspace option", async () => {
    // Create another workspace
    await runCommand(ctx.testHome, ["workspace", "init", "other-workspace"]);

    // Navigate to a different date in the new workspace
    await runCommand(ctx.testHome, ["cd", "2025-06-15", "-w", "other-workspace"]);

    // Verify navigation in other-workspace
    const pwdOther = await runCommand(ctx.testHome, ["pwd", "-w", "other-workspace"]);
    assertEquals(pwdOther.stdout, "/2025-06-15");

    // Switch back to test-workspace
    await runCommand(ctx.testHome, ["workspace", "switch", "test-workspace"]);

    // Navigate to a date in test-workspace
    await runCommand(ctx.testHome, ["cd", "2025-03-01"]);

    // Use cd without args with -w option for other-workspace
    const cdResult = await runCommand(ctx.testHome, ["cd", "-w", "other-workspace"]);

    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);
    // Should navigate to today in other-workspace
    const match = cdResult.stdout.match(/^\/\d{4}-\d{2}-\d{2}$/);
    assertExists(match, `cd output should be today's date path, got: ${cdResult.stdout}`);
  });
});
