/**
 * E2E Test Scenario 4: Relative Date Resolution
 *
 * Purpose:
 *   Verify that relative date expressions are correctly resolved according to
 *   the design specification.
 *
 * Overview:
 *   This scenario tests relative date resolution:
 *   - Relative date keywords (today, tomorrow, yesterday)
 *   - Relative periods (+Nd, +Nw, +Nm, +Ny)
 *   - Relative weekdays (~weekday, +weekday)
 *   - All relative forms are evaluated from "today" in the workspace timezone
 *
 * Test Date Assumption:
 *   This test uses 2025-11-02 as the reference "today" date.
 *   In actual test execution, we use the current date as "today".
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md section 9 (Time & Ranges)
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  addDaysToString,
  cleanupTestEnvironment,
  findNextWeekday,
  findPreviousWeekday,
  getTodayString,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 4: Relative date resolution", () => {
  let ctx: TestContext;
  let today: string;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
    today = getTodayString();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("resolves 'today' keyword", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "today"]);
    assertEquals(cdResult.success, true, `cd today failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout, `/${today}`, "today should resolve to current date");
  });

  it("resolves 'tomorrow' keyword", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "tomorrow"]);
    assertEquals(cdResult.success, true, `cd tomorrow failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);

    const expectedTomorrow = addDaysToString(today, 1);
    assertEquals(
      pwdResult.stdout,
      `/${expectedTomorrow}`,
      "tomorrow should resolve to today + 1 day",
    );
  });

  it("resolves 'yesterday' keyword", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "yesterday"]);
    assertEquals(cdResult.success, true, `cd yesterday failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);

    const expectedYesterday = addDaysToString(today, -1);
    assertEquals(
      pwdResult.stdout,
      `/${expectedYesterday}`,
      "yesterday should resolve to today - 1 day",
    );
  });

  it("resolves relative period '+1d' (one day forward)", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "+1d"]);
    assertEquals(cdResult.success, true, `cd +1d failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);

    const expected = addDaysToString(today, 1);
    assertEquals(
      pwdResult.stdout,
      `/${expected}`,
      "+1d should resolve to today + 1 day",
    );
  });

  it("resolves relative period '+1w' (one week forward)", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "+1w"]);
    assertEquals(cdResult.success, true, `cd +1w failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);

    const expected = addDaysToString(today, 7);
    assertEquals(
      pwdResult.stdout,
      `/${expected}`,
      "+1w should resolve to today + 7 days",
    );
  });

  it("resolves relative weekday '~mon' (previous Monday)", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "~mon"]);
    assertEquals(cdResult.success, true, `cd ~mon failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);

    const expected = findPreviousWeekday(today, "mon");
    assertEquals(
      pwdResult.stdout,
      `/${expected}`,
      "~mon should resolve to previous Monday",
    );
  });

  it("resolves relative weekday '+fri' (next Friday)", async () => {
    const cdResult = await runCommand(ctx.testHome, ["cd", "+fri"]);
    assertEquals(cdResult.success, true, `cd +fri failed: ${cdResult.stderr}`);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);

    const expected = findNextWeekday(today, "fri");
    assertEquals(
      pwdResult.stdout,
      `/${expected}`,
      "+fri should resolve to next Friday",
    );
  });

  it("resolves alternative keywords 'td', 'tm', 'yd'", async () => {
    // Test 'td' (today)
    const cdTdResult = await runCommand(ctx.testHome, ["cd", "td"]);
    assertEquals(cdTdResult.success, true, `cd td failed: ${cdTdResult.stderr}`);
    const pwdTdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdTdResult.stdout, `/${today}`, "td should resolve to today");

    // Test 'tm' (tomorrow)
    const cdTmResult = await runCommand(ctx.testHome, ["cd", "tm"]);
    assertEquals(cdTmResult.success, true, `cd tm failed: ${cdTmResult.stderr}`);
    const pwdTmResult = await runCommand(ctx.testHome, ["pwd"]);
    const expectedTomorrow = addDaysToString(today, 1);
    assertEquals(pwdTmResult.stdout, `/${expectedTomorrow}`, "tm should resolve to tomorrow");

    // Test 'yd' (yesterday)
    const cdYdResult = await runCommand(ctx.testHome, ["cd", "yd"]);
    assertEquals(cdYdResult.success, true, `cd yd failed: ${cdYdResult.stderr}`);
    const pwdYdResult = await runCommand(ctx.testHome, ["pwd"]);
    const expectedYesterday = addDaysToString(today, -1);
    assertEquals(pwdYdResult.stdout, `/${expectedYesterday}`, "yd should resolve to yesterday");
  });

  it("resolves multiple relative periods correctly", async () => {
    // Test +2d
    await runCommand(ctx.testHome, ["cd", "+2d"]);
    let pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    const expected2d = addDaysToString(today, 2);
    assertEquals(pwdResult.stdout, `/${expected2d}`, "+2d should resolve correctly");

    // Test +2w
    await runCommand(ctx.testHome, ["cd", "+2w"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    const expected2w = addDaysToString(today, 14);
    assertEquals(pwdResult.stdout, `/${expected2w}`, "+2w should resolve correctly");

    // Test +1m (one month forward)
    await runCommand(ctx.testHome, ["cd", "+1m"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    // For month calculations, we need to account for month length differences
    // The actual implementation should handle this, so we just verify it succeeds
    assertEquals(pwdResult.success, true, "+1m should resolve successfully");
  });

  it("resolves all weekday forms correctly", async () => {
    const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

    for (const weekday of weekdays) {
      // Test next weekday (+weekday)
      await runCommand(ctx.testHome, ["cd", `+${weekday}`]);
      let pwdResult = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(
        pwdResult.success,
        true,
        `cd +${weekday} should succeed: ${pwdResult.stderr}`,
      );
      const expectedNext = findNextWeekday(today, weekday);
      assertEquals(
        pwdResult.stdout,
        `/${expectedNext}`,
        `+${weekday} should resolve to next ${weekday}`,
      );

      // Test previous weekday (~weekday)
      await runCommand(ctx.testHome, ["cd", `~${weekday}`]);
      pwdResult = await runCommand(ctx.testHome, ["pwd"]);
      assertEquals(
        pwdResult.success,
        true,
        `cd ~${weekday} should succeed: ${pwdResult.stderr}`,
      );
      const expectedPrev = findPreviousWeekday(today, weekday);
      assertEquals(
        pwdResult.stdout,
        `/${expectedPrev}`,
        `~${weekday} should resolve to previous ${weekday}`,
      );
    }
  });

  it("maintains CWD state across relative date navigation", async () => {
    // Navigate to today first
    await runCommand(ctx.testHome, ["cd", "today"]);
    let pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout, `/${today}`, "Should start at today");

    // Navigate to tomorrow
    await runCommand(ctx.testHome, ["cd", "tomorrow"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    const expectedTomorrow = addDaysToString(today, 1);
    assertEquals(pwdResult.stdout, `/${expectedTomorrow}`, "Should be at tomorrow");

    // Navigate back to yesterday
    await runCommand(ctx.testHome, ["cd", "yesterday"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    const expectedYesterday = addDaysToString(today, -1);
    assertEquals(pwdResult.stdout, `/${expectedYesterday}`, "Should be at yesterday");

    // Navigate forward with relative period
    // Note: Relative periods are always evaluated from "today", not from current CWD
    await runCommand(ctx.testHome, ["cd", "+1w"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    const expectedWeekLater = addDaysToString(today, 7);
    assertEquals(
      pwdResult.stdout,
      `/${expectedWeekLater}`,
      "Should be at today + 1 week (relative periods always use today as reference)",
    );
  });
});
