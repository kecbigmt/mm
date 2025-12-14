/**
 * E2E Test: Shell Completion Script Registration
 *
 * Purpose:
 *   Verify that shell completion scripts can be sourced and properly register
 *   completion functions with zsh and bash.
 *
 * Overview:
 *   These tests validate that:
 *   - Zsh completion is properly registered after sourcing the script
 *   - Bash completion is properly registered after sourcing the script
 *
 * These tests detect both syntax errors (which would prevent sourcing) and
 * registration issues (like missing compdef/complete calls).
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

describe("Shell Completion Script Registration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("zsh completion is registered after sourcing script", async () => {
    const result = await runCommand(ctx.testHome, ["completions", "zsh"]);
    assertEquals(result.success, true, `Command failed: ${result.stderr}`);

    // Test that completion system can load and register the completion
    const testScript = `
      autoload -U compinit && compinit
      source /dev/stdin

      # Check that _mm function is defined
      if ! type _mm > /dev/null 2>&1; then
        echo "ERROR: _mm function not defined"
        exit 1
      fi

      # Check that mm command has completion registered
      # In zsh, completions are stored in the _comps associative array
      if [[ "\${_comps[mm]}" != "_mm" ]]; then
        echo "ERROR: mm completion not registered (expected _mm, got \${_comps[mm]})"
        exit 2
      fi

      echo "SUCCESS"
    `;

    const proc = new Deno.Command("zsh", {
      args: ["-c", testScript],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = proc.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(result.stdout));
    await writer.close();

    const output = await child.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);

    assertEquals(
      output.code,
      0,
      `Zsh completion registration failed (exit ${output.code}):\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
    assertEquals(stdout.trim(), "SUCCESS", "Expected SUCCESS message");
  });

  it("bash completion is registered after sourcing script", async () => {
    const result = await runCommand(ctx.testHome, ["completions", "bash"]);
    assertEquals(result.success, true, `Command failed: ${result.stderr}`);

    // Test that bash completion system can load and register the completion
    const testScript = `
      source /dev/stdin

      # Check that _mm function is defined
      if ! type _mm > /dev/null 2>&1; then
        echo "ERROR: _mm function not defined"
        exit 1
      fi

      # Check that mm command has completion registered
      # complete -p mm returns the completion spec for mm
      if ! complete -p mm > /dev/null 2>&1; then
        echo "ERROR: mm completion not registered"
        exit 2
      fi

      # Verify it's using our _mm function
      if ! complete -p mm | grep -q "_mm"; then
        echo "ERROR: mm completion not using _mm function"
        exit 3
      fi

      echo "SUCCESS"
    `;

    const proc = new Deno.Command("bash", {
      args: ["-c", testScript],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = proc.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(result.stdout));
    await writer.close();

    const output = await child.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);

    assertEquals(
      output.code,
      0,
      `Bash completion registration failed (exit ${output.code}):\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
    assertEquals(stdout.trim(), "SUCCESS", "Expected SUCCESS message");
  });
});
