/**
 * E2E Test Scenario 21: Git Sync Initialization
 *
 * Purpose:
 *   Verify that `mm sync init` correctly initializes Git repository
 *   and configures remote sync for a workspace.
 *
 * Overview:
 *   - Initialize workspace
 *   - Create bare Git repository for testing
 *   - Run sync init to configure Git
 *   - Verify workspace.json contains git configuration
 *   - Verify .git directory and initial commit
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

describe("Scenario 21: Git Sync Initialization", () => {
  let ctx: TestContext;
  let bareRepoDir: string;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    // Create bare repository for testing
    bareRepoDir = join(ctx.testHome, "bare-repo");
    await Deno.mkdir(bareRepoDir);
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
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("initializes workspace with Git sync", async () => {
    // Initialize workspace
    await runCommand(ctx.testHome, ["workspace", "init", "test-sync"]);

    // Run sync init
    const result = await runCommand(ctx.testHome, [
      "sync",
      "init",
      bareRepoDir,
      "--branch",
      "main",
    ]);

    assertEquals(result.success, true, `sync init failed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("initialized and configured"),
      true,
      "output should confirm initialization",
    );
  });

  it("creates git configuration in workspace.json", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-sync"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-sync");
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);

    assertEquals(config.sync.enabled, true);
    assertEquals(config.sync.vcs, "git");
    assertEquals(config.sync.git.remote, bareRepoDir);
    assertEquals(config.sync.git.branch, "main");
    assertEquals(config.sync.sync_mode, "auto-commit");
  });

  it("initializes git repository", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-sync"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir]);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-sync");
    const gitDir = join(workspaceDir, ".git");
    const stat = await Deno.stat(gitDir);
    assertEquals(stat.isDirectory, true);
  });

  it("creates initial commit", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-sync"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir]);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-sync");
    const cmd = new Deno.Command("git", {
      args: ["log", "--oneline"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const output = await cmd.output();
    const log = new TextDecoder().decode(output.stdout);

    assertEquals(
      log.includes("mm: initialize workspace git repository"),
      true,
      "initial commit should exist",
    );
  });

  it("supports force flag to overwrite config", async () => {
    await runCommand(ctx.testHome, ["workspace", "init", "test-sync"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    // Overwrite with different branch
    const result = await runCommand(ctx.testHome, [
      "sync",
      "init",
      bareRepoDir,
      "--branch",
      "develop",
      "--force",
    ]);

    assertEquals(result.success, true);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-sync");
    const workspaceJsonPath = join(workspaceDir, "workspace.json");
    const content = await Deno.readTextFile(workspaceJsonPath);
    const config = JSON.parse(content);

    assertEquals(config.sync.git.branch, "develop");
  });
});
