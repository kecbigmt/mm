/**
 * E2E Test: Default Command Shortcuts
 *
 * Purpose:
 *   Verify that `mm` without arguments defaults to `mm list` behavior
 *   and `mm workspace` without arguments defaults to `mm workspace list` behavior.
 *
 * Story Reference:
 *   docs/stories/20260120T150252_default-command-shortcuts.story.md
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Default Command Shortcuts", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("mm (no args) shows hint and simple list", () => {
    it("shows hint message followed by item list", async () => {
      // Setup: create workspace and some items
      await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);
      await runCommand(ctx.testHome, ["note", "Test note"]);

      // Test: run `mm` with no args
      const result = await runCommand(ctx.testHome, []);

      assertEquals(result.success, true, `Default command failed: ${result.stderr}`);

      // Should include hint message (with ANSI bold formatting for "Hint:")
      assertEquals(
        result.stdout.includes("Hint:") &&
          result.stdout.includes("Use `mm -h` for a list of available commands."),
        true,
        "Should show hint message",
      );

      // Should include list content
      assertEquals(
        result.stdout.includes("Test note"),
        true,
        "Should show note in list",
      );
    });

    it("does not accept advanced options like -t, -a, -p", async () => {
      await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

      // Test: try to use options that should only work with `mm list`
      const typeResult = await runCommand(ctx.testHome, ["-t", "note"]);
      const allResult = await runCommand(ctx.testHome, ["-a"]);
      const printResult = await runCommand(ctx.testHome, ["-p"]);

      // These should fail or be treated as arguments, not as valid options
      // The exact behavior depends on Cliffy, but they should not work as they do with `mm list`
      assertEquals(
        typeResult.success === false || typeResult.stderr.length > 0,
        true,
        "Should not accept -t option",
      );
      assertEquals(
        allResult.success === false || allResult.stderr.length > 0,
        true,
        "Should not accept -a option",
      );
      assertEquals(
        printResult.success === false || printResult.stderr.length > 0,
        true,
        "Should not accept -p option",
      );
    });

    it("shows hint message with error when no workspace configured", async () => {
      // Don't initialize any workspace
      const result = await runCommand(ctx.testHome, []);

      // Should show hint even when there's an error (with ANSI bold formatting)
      assertEquals(
        result.stdout.includes("Hint:") &&
          result.stdout.includes("Use `mm -h` for a list of available commands."),
        true,
        "Should show hint message even on error",
      );

      // Should have error in stderr
      assertEquals(
        result.stderr.length > 0,
        true,
        "Should show error when no workspace",
      );
    });
  });

  describe("mm workspace (no args) shows hint and workspace list", () => {
    it("shows hint message followed by workspace list", async () => {
      // Setup: create some workspaces
      await runCommand(ctx.testHome, ["workspace", "init", "workspace1"]);
      await runCommand(ctx.testHome, ["workspace", "init", "workspace2"]);

      // Test: run `mm workspace` with no args
      const result = await runCommand(ctx.testHome, ["workspace"]);

      assertEquals(
        result.success,
        true,
        `Default workspace command failed: ${result.stderr}`,
      );

      // Should include hint message (with ANSI bold formatting for "Hint:")
      assertEquals(
        result.stdout.includes("Hint:") &&
          result.stdout.includes("Use `mm ws -h` for a list of available commands."),
        true,
        "Should show hint message for workspace command",
      );

      // Should include workspace list
      assertEquals(
        result.stdout.includes("Workspaces:"),
        true,
        "Should show workspace list header",
      );
      assertEquals(
        result.stdout.includes("workspace1") && result.stdout.includes("workspace2"),
        true,
        "Should show workspace names",
      );
    });

    it("shows hint with alias mm ws", async () => {
      await runCommand(ctx.testHome, ["workspace", "init", "test-ws"]);

      // Test: run `mm ws` with no args (alias)
      const result = await runCommand(ctx.testHome, ["ws"]);

      assertEquals(result.success, true, `ws command failed: ${result.stderr}`);

      // Should show hint for ws alias (with ANSI bold formatting)
      assertEquals(
        result.stdout.includes("Hint:") &&
          result.stdout.includes("Use `mm ws -h` for a list of available commands."),
        true,
        "ws alias should show hint message",
      );
    });

    it("shows hint and helpful message when no workspaces exist", async () => {
      // Don't create any workspaces
      const result = await runCommand(ctx.testHome, ["workspace"]);

      assertEquals(result.success, true, "Should succeed even with no workspaces");

      // Should show hint (with ANSI bold formatting)
      assertEquals(
        result.stdout.includes("Hint:") &&
          result.stdout.includes("Use `mm ws -h` for a list of available commands."),
        true,
        "Should show hint message",
      );

      // Should show helpful message
      assertEquals(
        result.stdout.includes("No workspaces found"),
        true,
        "Should show 'No workspaces found' message",
      );
      assertEquals(
        result.stdout.includes("mm workspace init"),
        true,
        "Should show creation hint",
      );
    });
  });

  describe("Backward compatibility", () => {
    it("mm list continues to work", async () => {
      await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

      const result = await runCommand(ctx.testHome, ["list"]);

      assertEquals(result.success, true, `mm list should still work: ${result.stderr}`);
    });

    it("mm ls continues to work", async () => {
      await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

      const result = await runCommand(ctx.testHome, ["ls"]);

      assertEquals(result.success, true, `mm ls should still work: ${result.stderr}`);
    });

    it("mm workspace list continues to work", async () => {
      await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

      const result = await runCommand(ctx.testHome, ["workspace", "list"]);

      assertEquals(result.success, true, `mm workspace list should still work: ${result.stderr}`);
    });

    it("mm ws ls continues to work", async () => {
      await runCommand(ctx.testHome, ["workspace", "init", "test-workspace"]);

      const result = await runCommand(ctx.testHome, ["ws", "ls"]);

      assertEquals(result.success, true, `mm ws ls should still work: ${result.stderr}`);
    });
  });
});
