/**
 * E2E Test Scenario 26: Pre-pull Before File Operations
 *
 * Purpose:
 *   Verify that auto-sync mode pulls remote changes
 *   BEFORE performing file operations, reducing conflicts.
 *
 * Overview:
 *   - Initialize workspace with Git and auto-sync mode
 *   - Simulate remote changes (as if from another device)
 *   - Execute state-changing command
 *   - Verify remote changes were pulled before local operation
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

describe("Scenario 26: Pre-pull Before File Operations", () => {
  let ctx: TestContext;
  let bareRepoDir: string;
  let workspaceDir: string;
  let otherDeviceDir: string;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    bareRepoDir = join(ctx.testHome, "bare-repo");
    otherDeviceDir = join(ctx.testHome, "other-device");
    await Deno.mkdir(bareRepoDir);
    await Deno.mkdir(otherDeviceDir);

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
    await runCommand(ctx.testHome, ["workspace", "init", "test-prepull"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    workspaceDir = getWorkspacePath(ctx.testHome, "test-prepull");

    // Enable auto-sync mode in workspace.json
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);
    config.sync.mode = "auto-sync";
    await Deno.writeTextFile(workspaceJsonPath, JSON.stringify(config, null, 2));

    // Create initial note and sync to have something in remote
    await runCommand(ctx.testHome, ["note", "initial note"]);

    // Clone to simulate another device
    const cloneCmd = new Deno.Command("git", {
      args: ["clone", bareRepoDir, otherDeviceDir],
    });
    await cloneCmd.output();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("pulls remote changes before creating a new note", async () => {
    // Simulate changes from another device
    const remoteFilePath = join(otherDeviceDir, "remote-file.txt");
    await Deno.writeTextFile(remoteFilePath, "Created on other device");

    // Commit and push from "other device"
    const addCmd = new Deno.Command("git", {
      args: ["add", "."],
      cwd: otherDeviceDir,
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "change from other device"],
      cwd: otherDeviceDir,
    });
    await commitCmd.output();

    const pushCmd = new Deno.Command("git", {
      args: ["push", "origin", "main"],
      cwd: otherDeviceDir,
    });
    await pushCmd.output();

    // Now run a command in original workspace - pre-pull should fetch changes
    const result = await runCommand(ctx.testHome, ["note", "local note after remote change"]);
    assertEquals(result.success, true);

    // Verify the remote file now exists in our workspace (pulled before operation)
    const localFilePath = join(workspaceDir, "remote-file.txt");
    try {
      const fileContent = await Deno.readTextFile(localFilePath);
      assertEquals(fileContent, "Created on other device");
    } catch {
      throw new Error("Remote file was not pulled - pre-pull did not work");
    }

    // Verify local commit exists after the remote one
    const logCmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-5"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const logOutput = await logCmd.output();
    const log = new TextDecoder().decode(logOutput.stdout);

    // Log should show: local note commit, then remote change commit
    assertEquals(log.includes('mm: create new note "local note after remote change"'), true);
    assertEquals(log.includes("change from other device"), true);
  });

  it("continues operation with warning when pull fails (network simulation)", async () => {
    // Make the remote unreachable by removing it
    const removeRemoteCmd = new Deno.Command("git", {
      args: ["remote", "remove", "origin"],
      cwd: workspaceDir,
    });
    await removeRemoteCmd.output();

    // Add a fake remote that doesn't exist
    const addFakeRemoteCmd = new Deno.Command("git", {
      args: ["remote", "add", "origin", "git@nonexistent.invalid:fake/repo.git"],
      cwd: workspaceDir,
    });
    await addFakeRemoteCmd.output();

    // Update workspace.json with the fake remote
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);
    config.sync.git.remote = "git@nonexistent.invalid:fake/repo.git";
    await Deno.writeTextFile(workspaceJsonPath, JSON.stringify(config, null, 2));

    // Run command - should succeed despite pull failure
    const result = await runCommand(ctx.testHome, ["note", "note despite network error"]);

    // Command should succeed (pre-pull failure is non-blocking)
    assertEquals(result.success, true);
    assertEquals(result.stdout.includes("Created note"), true);
  });

  it("skips pre-pull in auto-commit mode", async () => {
    // Change to auto-commit mode
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);
    config.sync.mode = "auto-commit";
    await Deno.writeTextFile(workspaceJsonPath, JSON.stringify(config, null, 2));

    // Simulate changes from another device
    const remoteFilePath = join(otherDeviceDir, "remote-file-2.txt");
    await Deno.writeTextFile(remoteFilePath, "Should not be pulled in auto-commit mode");

    const addCmd = new Deno.Command("git", {
      args: ["add", "."],
      cwd: otherDeviceDir,
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "another remote change"],
      cwd: otherDeviceDir,
    });
    await commitCmd.output();

    const pushCmd = new Deno.Command("git", {
      args: ["push", "origin", "main"],
      cwd: otherDeviceDir,
    });
    await pushCmd.output();

    // Run command in auto-commit mode
    const result = await runCommand(ctx.testHome, ["note", "note in auto-commit mode"]);
    assertEquals(result.success, true);

    // Verify remote file was NOT pulled (auto-commit doesn't pre-pull)
    const localFilePath = join(workspaceDir, "remote-file-2.txt");
    let fileExists = false;
    try {
      await Deno.stat(localFilePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    assertEquals(fileExists, false, "Remote file should NOT be pulled in auto-commit mode");
  });
});
