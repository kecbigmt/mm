/**
 * E2E Test Scenario 23: Auto-sync Mode
 *
 * Purpose:
 *   Verify that auto-sync mode creates commits and pushes to remote
 *   automatically after state-changing commands.
 *
 * Overview:
 *   - Initialize workspace with Git and auto-sync mode
 *   - Execute state-changing commands
 *   - Verify commits are created and pushed to remote
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getWorkspacePath,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 23: Auto-sync Mode", () => {
  let ctx: TestContext;
  let bareRepoDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    bareRepoDir = join(ctx.testHome, "bare-repo");
    await Deno.mkdir(bareRepoDir);

    // Create bare repository
    const initCmd = new Deno.Command("git", {
      args: ["init", "--bare"],
      cwd: bareRepoDir,
    });
    await initCmd.output();

    // Set default branch to main
    const setHeadCmd = new Deno.Command("git", {
      args: ["symbolic-ref", "HEAD", "refs/heads/main"],
      cwd: bareRepoDir,
    });
    await setHeadCmd.output();

    // Initialize workspace with Git
    await runCommand(ctx.testHome, ["workspace", "init", "test-autosync"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    workspaceDir = getWorkspacePath(ctx.testHome, "test-autosync");

    // Enable auto-sync mode in workspace.json
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);
    config.sync.sync_mode = "auto-sync";
    await Deno.writeTextFile(workspaceJsonPath, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates commit and pushes on note creation", async () => {
    const result = await runCommand(ctx.testHome, ["note", "synced note"]);
    assertEquals(result.success, true);

    // Verify commit exists locally
    const localCmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-2"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const localOutput = await localCmd.output();
    const localLog = new TextDecoder().decode(localOutput.stdout);

    assertEquals(localLog.includes('mm: create new note "synced note"'), true);

    // Verify commit was pushed to remote
    const remoteCmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: bareRepoDir,
      stdout: "piped",
    });
    const remoteOutput = await remoteCmd.output();
    const remoteLog = new TextDecoder().decode(remoteOutput.stdout);

    assertEquals(remoteLog.includes('mm: create new note "synced note"'), true);
  });

  it("syncs multiple operations", async () => {
    await runCommand(ctx.testHome, ["task", "task 1", "-a", "task1"]);
    await runCommand(ctx.testHome, ["task", "task 2", "-a", "task2"]);
    await runCommand(ctx.testHome, ["close", "task1"]);

    // Verify all commits exist in remote
    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: bareRepoDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    assertEquals(log.includes('mm: create new task "task 1"'), true);
    assertEquals(log.includes('mm: create new task "task 2"'), true);
    assertEquals(log.includes("mm: close"), true);
  });
});
