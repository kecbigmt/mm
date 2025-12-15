/**
 * E2E Test Scenario 24: Sync Commands
 *
 * Purpose:
 *   Verify that manual sync commands (sync, sync pull, sync push)
 *   work correctly for synchronizing with remote repository.
 *
 * Overview:
 *   - Test `mm sync` (pull + push)
 *   - Test `mm sync pull` (pull only)
 *   - Test `mm sync push` (push only)
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

describe("Scenario 24: Sync Commands", () => {
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

    // Initialize workspace with Git (manual sync mode)
    await runCommand(ctx.testHome, ["workspace", "init", "test-sync-cmd"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    workspaceDir = getWorkspacePath(ctx.testHome, "test-sync-cmd");

    // Push initial commit to bare repo to establish main branch
    await runCommand(ctx.testHome, ["sync", "push"]);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("pushes local commits with sync push", async () => {
    // Create note (manual mode, so no auto-push)
    await runCommand(ctx.testHome, ["note", "manual note"]);

    // Manually push
    const result = await runCommand(ctx.testHome, ["sync", "push"]);
    assertEquals(result.success, true);

    // Verify commit was pushed to remote
    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: bareRepoDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    assertEquals(log.includes('mm: create new note "manual note"'), true);
  });

  it("pulls remote changes with sync pull", async () => {
    // Create note and push
    await runCommand(ctx.testHome, ["note", "local note"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Make another commit directly via git (simulating remote change)
    const testFilePath = join(workspaceDir, "test.txt");
    await Deno.writeTextFile(testFilePath, "test");

    const addCmd = new Deno.Command("git", {
      args: ["add", "test.txt"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "remote change"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await commitCmd.output();

    const pushCmd = new Deno.Command("git", {
      args: ["push", "origin", "main"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await pushCmd.output();

    // Reset local workspace to before the remote change
    const resetCmd = new Deno.Command("git", {
      args: ["reset", "--hard", "HEAD~1"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await resetCmd.output();

    // Now pull should get the remote change
    const result = await runCommand(ctx.testHome, ["sync", "pull"]);
    assertEquals(result.success, true);

    // Verify the change is present
    const logCmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-2"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const logOutput = await logCmd.output();
    const log = new TextDecoder().decode(logOutput.stdout);

    assertEquals(log.includes("remote change"), true);
  });

  it("syncs with sync command (pull + push)", async () => {
    // Simulate remote change: create commit directly via git
    const testFilePath = join(workspaceDir, "remote-change.txt");
    await Deno.writeTextFile(testFilePath, "remote change");

    const addCmd = new Deno.Command("git", {
      args: ["add", "remote-change.txt"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "remote change"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await commitCmd.output();

    const pushCmd = new Deno.Command("git", {
      args: ["push", "origin", "main"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await pushCmd.output();

    // Reset local workspace to before the remote change
    const resetCmd = new Deno.Command("git", {
      args: ["reset", "--hard", "HEAD~1"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await resetCmd.output();

    // Create new local commit
    await runCommand(ctx.testHome, ["note", "sync test"]);

    // Run sync (should pull remote changes and push local changes)
    const result = await runCommand(ctx.testHome, ["sync"]);
    assertEquals(result.success, true);

    // Verify remote changes were pulled
    const localLogCmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const localLogOutput = await localLogCmd.output();
    const localLog = new TextDecoder().decode(localLogOutput.stdout);

    assertEquals(localLog.includes("remote change"), true, "remote commit should be pulled");
    assertEquals(
      localLog.includes('mm: create new note "sync test"'),
      true,
      "local commit should exist",
    );

    // Verify local commits were pushed to remote
    const remoteLogCmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: bareRepoDir,
      stdout: "piped",
    });
    const remoteLogOutput = await remoteLogCmd.output();
    const remoteLog = new TextDecoder().decode(remoteLogOutput.stdout);

    assertEquals(
      remoteLog.includes('mm: create new note "sync test"'),
      true,
      "local commit should be pushed to remote",
    );
    assertEquals(
      remoteLog.includes("remote change"),
      true,
      "remote commit should still be in remote",
    );
  });
});
