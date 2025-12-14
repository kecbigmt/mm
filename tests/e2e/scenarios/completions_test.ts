/**
 * E2E Test: Shell Completion Script Validation
 *
 * Purpose:
 *   Verify that shell completion scripts are syntactically valid and can be
 *   executed by zsh and bash interpreters.
 *
 * Overview:
 *   These tests validate that:
 *   - Zsh completion script passes `zsh -n` syntax validation
 *   - Bash completion script passes `bash -n` syntax validation
 *
 * Design Reference:
 *   See docs/stories/20251206_command-completion/20251213T141938_shell-completion-script.story.md
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Shell Completion Script Validation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("generates zsh script that passes syntax validation", async () => {
    const result = await runCommand(ctx.testHome, ["completions", "zsh"]);
    assertEquals(result.success, true, `Command failed: ${result.stderr}`);

    const tempFile = await Deno.makeTempFile({ suffix: ".zsh" });
    try {
      await Deno.writeTextFile(tempFile, result.stdout);
      const proc = new Deno.Command("zsh", {
        args: ["-n", tempFile],
        stdout: "piped",
        stderr: "piped",
      });
      const validationResult = await proc.output();
      assertEquals(
        validationResult.code,
        0,
        `zsh syntax validation failed: ${new TextDecoder().decode(validationResult.stderr)}`,
      );
    } finally {
      await Deno.remove(tempFile);
    }
  });

  it("generates bash script that passes syntax validation", async () => {
    const result = await runCommand(ctx.testHome, ["completions", "bash"]);
    assertEquals(result.success, true, `Command failed: ${result.stderr}`);

    const tempFile = await Deno.makeTempFile({ suffix: ".bash" });
    try {
      await Deno.writeTextFile(tempFile, result.stdout);
      const proc = new Deno.Command("bash", {
        args: ["-n", tempFile],
        stdout: "piped",
        stderr: "piped",
      });
      const validationResult = await proc.output();
      assertEquals(
        validationResult.code,
        0,
        `bash syntax validation failed: ${new TextDecoder().decode(validationResult.stderr)}`,
      );
    } finally {
      await Deno.remove(tempFile);
    }
  });
});
