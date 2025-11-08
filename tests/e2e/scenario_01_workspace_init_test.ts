/**
 * E2E Test Scenario 1: Workspace Initialization and Basic Operations
 *
 * Purpose:
 *   Verify that workspace initialization creates the correct directory structure
 *   and that basic navigation commands (pwd, cd) work as expected.
 *
 * Overview:
 *   This scenario tests workspace lifecycle and navigation:
 *   - Initialize workspace with `workspace init <name>`
 *   - Verify on-disk directory structure (items/, .index/aliases/, tags/)
 *   - Confirm workspace.json contains timezone configuration
 *   - Test default CWD behavior (defaults to today's date)
 *   - Navigate between dates using `cd` command
 *   - Verify CWD changes persist and are reflected by `pwd`
 *   - Create multiple workspaces and list them with `workspace list`
 *   - Identify current workspace in listing output
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getWorkspacePath,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "./helpers.ts";

describe("Scenario 1: Workspace initialization and basic operations", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("initializes workspace", async () => {
    const result = await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

    assertEquals(result.success, true, `Command failed: ${result.stderr}`);
    assertEquals(result.stdout.includes("Switched to workspace: test-workspace"), true);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const workspaceDirStat = await Deno.stat(workspaceDir);
    assertEquals(workspaceDirStat.isDirectory, true);
  });

  it("creates correct workspace directory structure", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

    const checkDirectory = async (path: string) => {
      const stat = await Deno.stat(path);
      assertEquals(stat.isDirectory, true, `${path} should be a directory`);
    };

    await checkDirectory(join(workspaceDir, "items"));
    await checkDirectory(join(workspaceDir, ".index"));
    await checkDirectory(join(workspaceDir, ".index", "aliases"));
    await checkDirectory(join(workspaceDir, "tags"));

    const workspaceJson = await Deno.readTextFile(join(workspaceDir, "workspace.json"));
    const config = JSON.parse(workspaceJson);
    assertExists(config.timezone, "timezone should be set in workspace.json");
  });

  it("shows default CWD as today with pwd", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

    const result = await runCommand(ctx.testHome, ["pwd"]);

    assertEquals(result.success, true, `Command failed: ${result.stderr}`);
    const match = result.stdout.match(/^\/\d{4}-\d{2}-\d{2}$/);
    assertExists(match, `pwd should return ISO date path, got: ${result.stdout}`);
  });

  it("navigates to different date with cd", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const cdResult = await runCommand(ctx.testHome, ["cd", yesterdayStr]);
    assertEquals(cdResult.success, true, `cd failed: ${cdResult.stderr}`);
    assertEquals(cdResult.stdout, `/${yesterdayStr}`);
  });

  it("confirms CWD change with pwd after cd", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

    const targetDate = "2025-11-01";
    await runCommand(ctx.testHome, ["cd", targetDate]);

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout, `/${targetDate}`);
  });

  it("executes full flow: init → pwd → cd → pwd", async () => {
    const initResult = await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);
    assertEquals(initResult.success, true, "workspace init should succeed");
    assertEquals(
      initResult.stdout.includes("Switched to workspace: test-workspace"),
      true,
    );

    const pwd1Result = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwd1Result.success, true, "first pwd should succeed");
    const match = pwd1Result.stdout.match(/^\/\d{4}-\d{2}-\d{2}$/);
    assertExists(match, `pwd should return ISO date path, got: ${pwd1Result.stdout}`);

    const targetDate = "2025-11-01";
    const cdResult = await runCommand(ctx.testHome, ["cd", targetDate]);
    assertEquals(cdResult.success, true, "cd should succeed");
    assertEquals(cdResult.stdout, `/${targetDate}`, "cd should return new cwd");

    const pwd2Result = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwd2Result.success, true, "second pwd should succeed");
    assertEquals(pwd2Result.stdout, `/${targetDate}`, "cwd should be updated");
  });

  it("lists multiple workspaces", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "workspace-a"]);
    await runCommand(ctx.testHome, ["workspace", "init", "workspace-b"]);

    const listResult = await runCommand(ctx.testHome, ["workspace", "list"]);
    assertEquals(listResult.success, true, `workspace list failed: ${listResult.stderr}`);
    assertEquals(listResult.stdout.includes("workspace-a"), true);
    assertEquals(listResult.stdout.includes("workspace-b"), true);
    assertEquals(listResult.stdout.includes("(current)"), true);
  });
});
