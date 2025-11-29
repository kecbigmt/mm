/**
 * E2E Test Scenario 12: Canonical Key & Collision Detection
 *
 * Purpose:
 *   Ensure alias canonical keys collapse case, width, and diacritic variants so that
 *   duplicates are rejected and lookups remain normalization-insensitive.
 *
 * Design Reference:
 *   - e2e-test-scenarios.md (Scenario 12)
 *   - docs/specs/001_redesign/design.md
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 12: Canonical key collision detection", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("rejects aliases whose canonical keys already exist", async () => {
    const baseAliasResult = await runCommand(ctx.testHome, [
      "note",
      "テスト1",
      "--alias",
      "test-item",
    ]);
    assertEquals(
      baseAliasResult.success,
      true,
      `Failed to create base alias: ${baseAliasResult.stderr}`,
    );

    const uppercaseResult = await runCommand(ctx.testHome, [
      "note",
      "テスト2",
      "--alias",
      "TEST-ITEM",
    ]);
    assertEquals(
      uppercaseResult.stderr.includes("alias 'TEST-ITEM' already exists"),
      true,
      `Expected conflict error for uppercase alias, got: ${uppercaseResult.stderr}`,
    );

    const accentResult = await runCommand(ctx.testHome, [
      "note",
      "テスト3",
      "--alias",
      "tëst-item",
    ]);
    assertEquals(
      accentResult.stderr.includes("alias 'tëst-item' already exists"),
      true,
      `Expected conflict error for diacritic alias, got: ${accentResult.stderr}`,
    );
  });

  it("resolves aliases regardless of case or diacritics", async () => {
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "テスト",
      "--alias",
      "test-item",
    ]);
    assertEquals(createResult.success, true, `Failed to create alias: ${createResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);

    const whereUpperResult = await runCommand(ctx.testHome, ["where", "TEST-ITEM"]);
    assertEquals(
      whereUpperResult.success,
      true,
      `where command failed: ${whereUpperResult.stderr}`,
    );
    assertEquals(
      whereUpperResult.stdout.includes(`Logical:  /${today}/test-item`),
      true,
      `Expected logical path to include /${today}/test-item, got: ${whereUpperResult.stdout}`,
    );

    const whereAccentResult = await runCommand(ctx.testHome, ["where", "tëst-item"]);
    assertEquals(
      whereAccentResult.success,
      true,
      `where command for diacritic alias failed: ${whereAccentResult.stderr}`,
    );
    assertEquals(
      whereAccentResult.stdout.includes(`Logical:  /${today}/test-item`),
      true,
      `Expected logical path to include /${today}/test-item, got: ${whereAccentResult.stdout}`,
    );
  });
});
