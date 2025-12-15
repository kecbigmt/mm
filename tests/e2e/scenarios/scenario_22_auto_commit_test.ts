/**
 * E2E Test Scenario 22: Auto-commit Mode
 *
 * Purpose:
 *   Verify that auto-commit mode creates Git commits automatically
 *   after state-changing commands, without pushing to remote.
 *
 * Overview:
 *   - Initialize workspace with Git and auto-commit mode
 *   - Execute state-changing commands (note, task, mv, close, etc.)
 *   - Verify Git commits are created automatically
 *   - Verify no push is performed (manual mode)
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

describe("Scenario 22: Auto-commit Mode", () => {
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
    await runCommand(ctx.testHome, ["workspace", "init", "test-autocommit"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    workspaceDir = getWorkspacePath(ctx.testHome, "test-autocommit");

    // Enable auto-commit mode in workspace.json
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);
    config.git.sync_mode = "auto-commit";
    await Deno.writeTextFile(workspaceJsonPath, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates commit on note creation", async () => {
    await runCommand(ctx.testHome, ["note", "test note"]);

    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-2"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    assertEquals(log.includes('mm: create new note "test note"'), true);
  });

  it("creates commit on task creation", async () => {
    await runCommand(ctx.testHome, ["task", "test task"]);

    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-2"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    assertEquals(log.includes('mm: create new task "test task"'), true);
  });

  it("creates commit on status change", async () => {
    await runCommand(ctx.testHome, ["task", "my task", "-a", "mytask"]);
    await runCommand(ctx.testHome, ["close", "mytask"]);

    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-3"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    assertEquals(log.includes("mm: close 1 item(s)"), true);
  });

  it("does not push to remote", async () => {
    await runCommand(ctx.testHome, ["note", "test"]);

    // Check remote repository has no commits beyond initial
    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: bareRepoDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    // Should only have initial commit, not the new note commit
    const commits = log.trim().split("\n");
    assertEquals(commits.length, 1, "remote should only have initial commit");
  });
});
