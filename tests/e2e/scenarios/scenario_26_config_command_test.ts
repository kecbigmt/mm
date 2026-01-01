/**
 * E2E Test Scenario 26: Config Command
 *
 * Purpose:
 *   Verify that `mm config` command correctly lists, gets, and sets
 *   workspace configuration values.
 *
 * Overview:
 *   - mm config / mm config list displays all settings
 *   - mm config get <key> retrieves specific values
 *   - mm config set <key> <value> updates configuration
 *   - Auto-commit behavior when sync is enabled
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

describe("Scenario 26: Config Command", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await runCommand(ctx.testHome, ["workspace", "init", "test-config"]);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("mm config list", () => {
    it("displays all configuration settings", async () => {
      const result = await runCommand(ctx.testHome, ["config", "list"]);

      assertEquals(result.success, true, `config list failed: ${result.stderr}`);
      assertEquals(result.stdout.includes("timezone:"), true);
      assertEquals(result.stdout.includes("sync.enabled:"), true);
      assertEquals(result.stdout.includes("sync.mode:"), true);
      assertEquals(result.stdout.includes("sync.git.remote:"), true);
      assertEquals(result.stdout.includes("sync.git.branch:"), true);
    });

    it("displays settings when running mm config without subcommand", async () => {
      const result = await runCommand(ctx.testHome, ["config"]);

      assertEquals(result.success, true);
      assertEquals(result.stdout.includes("Current configuration:"), true);
    });
  });

  describe("mm config get", () => {
    it("returns timezone value", async () => {
      const result = await runCommand(ctx.testHome, ["config", "get", "timezone"]);

      assertEquals(result.success, true);
      // Default timezone should be set
      assertEquals(result.stdout.trim().length > 0, true);
    });

    it("returns sync.enabled value", async () => {
      const result = await runCommand(ctx.testHome, ["config", "get", "sync.enabled"]);

      assertEquals(result.success, true);
      assertEquals(result.stdout.trim(), "false"); // Default is false before sync init
    });

    it("returns sync.mode value", async () => {
      const result = await runCommand(ctx.testHome, ["config", "get", "sync.mode"]);

      assertEquals(result.success, true);
      assertEquals(result.stdout.trim(), "auto-commit"); // Default mode
    });

    it("returns error for unknown key", async () => {
      const result = await runCommand(ctx.testHome, ["config", "get", "foo.bar"]);

      assertEquals(result.success, false);
      assertEquals(result.stderr.includes("Unknown config key: foo.bar"), true);
    });
  });

  describe("mm config set", () => {
    it("sets timezone", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "timezone",
        "America/New_York",
      ]);

      assertEquals(result.success, true);
      assertEquals(result.stdout.includes("timezone = America/New_York"), true);

      // Verify it was saved
      const getResult = await runCommand(ctx.testHome, ["config", "get", "timezone"]);
      assertEquals(getResult.stdout.trim(), "America/New_York");
    });

    it("sets sync.mode to auto-sync", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.mode",
        "auto-sync",
      ]);

      assertEquals(result.success, true);

      // Verify in workspace.json
      const workspaceDir = getWorkspacePath(ctx.testHome, "test-config");
      const content = await Deno.readTextFile(join(workspaceDir, "workspace.json"));
      const config = JSON.parse(content);
      assertEquals(config.sync.mode, "auto-sync");
    });

    it("rejects invalid sync.mode value", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.mode",
        "invalid",
      ]);

      assertEquals(result.success, false);
      assertEquals(
        result.stderr.includes(
          "Invalid value for sync.mode: must be 'auto-commit', 'auto-sync', or 'lazy-sync'",
        ),
        true,
      );
    });

    it("rejects enabling sync without remote configured", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.enabled",
        "true",
      ]);

      assertEquals(result.success, false);
      assertEquals(
        result.stderr.includes("Cannot enable sync: no remote configured"),
        true,
      );
    });

    it("rejects unknown key", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "unknown.key",
        "value",
      ]);

      assertEquals(result.success, false);
      assertEquals(result.stderr.includes("Unknown config key: unknown.key"), true);
    });
  });

  describe("with git sync initialized", () => {
    let bareRepoDir: string;
    let workspaceDir: string;

    beforeEach(async () => {
      bareRepoDir = join(ctx.testHome, "bare-repo");
      await Deno.mkdir(bareRepoDir);

      const initCmd = new Deno.Command("git", {
        args: ["init", "--bare"],
        cwd: bareRepoDir,
      });
      await initCmd.output();

      const setHeadCmd = new Deno.Command("git", {
        args: ["symbolic-ref", "HEAD", "refs/heads/main"],
        cwd: bareRepoDir,
      });
      await setHeadCmd.output();

      await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);
      workspaceDir = getWorkspacePath(ctx.testHome, "test-config");
    });

    it("sets sync.git.remote and updates git remote", async () => {
      const newRemote = join(ctx.testHome, "new-bare-repo");
      await Deno.mkdir(newRemote);
      const initCmd = new Deno.Command("git", {
        args: ["init", "--bare"],
        cwd: newRemote,
      });
      await initCmd.output();

      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.git.remote",
        newRemote,
      ]);

      assertEquals(result.success, true);

      // Verify workspace.json
      const content = await Deno.readTextFile(join(workspaceDir, "workspace.json"));
      const config = JSON.parse(content);
      assertEquals(config.sync.git.remote, newRemote);

      // Verify git remote was updated
      const gitCmd = new Deno.Command("git", {
        args: ["remote", "get-url", "origin"],
        cwd: workspaceDir,
        stdout: "piped",
      });
      const gitOutput = await gitCmd.output();
      const gitRemote = new TextDecoder().decode(gitOutput.stdout).trim();
      assertEquals(gitRemote, newRemote);
    });

    it("sets sync.git.branch", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.git.branch",
        "develop",
      ]);

      assertEquals(result.success, true);

      // Verify workspace.json
      const content = await Deno.readTextFile(join(workspaceDir, "workspace.json"));
      const config = JSON.parse(content);
      assertEquals(config.sync.git.branch, "develop");
    });

    it("rejects invalid branch name", async () => {
      const result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.git.branch",
        "invalid..branch",
      ]);

      assertEquals(result.success, false);
      assertEquals(result.stderr.includes("Invalid branch name"), true);
    });

    it("can enable and disable sync", async () => {
      // Disable sync
      let result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.enabled",
        "false",
      ]);
      assertEquals(result.success, true);

      let content = await Deno.readTextFile(join(workspaceDir, "workspace.json"));
      let config = JSON.parse(content);
      assertEquals(config.sync.enabled, false);

      // Re-enable sync (now remote is configured)
      result = await runCommand(ctx.testHome, [
        "config",
        "set",
        "sync.enabled",
        "true",
      ]);
      assertEquals(result.success, true);

      content = await Deno.readTextFile(join(workspaceDir, "workspace.json"));
      config = JSON.parse(content);
      assertEquals(config.sync.enabled, true);
    });

    it("auto-commits config changes when sync is enabled", async () => {
      // Change timezone (sync is already enabled from sync init)
      await runCommand(ctx.testHome, ["config", "set", "timezone", "Europe/London"]);

      // Check git log for the commit
      const gitCmd = new Deno.Command("git", {
        args: ["log", "--oneline", "-1"],
        cwd: workspaceDir,
        stdout: "piped",
      });
      const output = await gitCmd.output();
      const log = new TextDecoder().decode(output.stdout);

      assertEquals(log.includes("mm: update workspace configuration"), true);
    });
  });
});
