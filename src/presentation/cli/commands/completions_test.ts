import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Command } from "@cliffy/command";
import { createCompletionsCommand } from "./completions.ts";

const buildCli = () =>
  new Command()
    .name("mm")
    .version("0.1.0")
    .description("Test harness for mm CLI")
    .command("completions", createCompletionsCommand());

const captureConsole = () => {
  const logLines: string[] = [];
  const errorLines: string[] = [];
  const warnLines: string[] = [];
  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };
  console.log = (...args) => {
    logLines.push(args.map(String).join(" "));
  };
  console.error = (...args) => {
    errorLines.push(args.map(String).join(" "));
  };
  console.warn = (...args) => {
    warnLines.push(args.map(String).join(" "));
  };

  return {
    logs: logLines,
    errors: errorLines,
    warns: warnLines,
    restore() {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    },
  };
};

/** Run the completions command for the given shell and return captured output. */
async function getCompletionOutput(
  shell: "zsh" | "bash",
): Promise<{ output: string; errors: string[] }> {
  const captured = captureConsole();
  try {
    await buildCli().parse(["completions", shell]);
  } finally {
    captured.restore();
  }
  return {
    output: captured.logs.join("\n"),
    errors: captured.errors,
  };
}

Deno.test({
  name: "completions command outputs zsh script",
  async fn() {
    const { output, errors } = await getCompletionOutput("zsh");

    assertEquals(errors.length, 0, "should not produce errors");
    assert(output.length > 0, "should output script to stdout");
    assertStringIncludes(output, "#compdef mm", "should contain zsh compdef directive");
    assertStringIncludes(output, "_mm", "should define _mm completion function");
  },
});

Deno.test({
  name: "completions command outputs bash script",
  async fn() {
    const { output, errors } = await getCompletionOutput("bash");

    assertEquals(errors.length, 0, "should not produce errors");
    assert(output.length > 0, "should output script to stdout");
    assertStringIncludes(output, "complete -F", "should contain bash complete directive");
    assertStringIncludes(output, "_mm", "should define _mm completion function");
  },
});

// Note: Test for missing shell argument is omitted because Cliffy's
// internal error handling calls Deno.exit(), which terminates the test process.
// The CLI correctly validates required arguments via Cliffy's built-in mechanism.

Deno.test({
  name: "zsh script includes installation instructions",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assertStringIncludes(output, "Installation", "should include installation instructions");
  },
});

Deno.test({
  name: "bash script includes installation instructions",
  async fn() {
    const { output } = await getCompletionOutput("bash");
    assertStringIncludes(output, "Installation", "should include installation instructions");
  },
});

// Note: Syntax validation tests have been moved to tests/e2e/scenarios/completions_test.ts
// because they depend on external shell binaries (zsh, bash) being installed.

const expectedCommands = [
  "note",
  "task",
  "event",
  "list",
  "edit",
  "move",
  "close",
  "reopen",
  "workspace",
  "cd",
  "pwd",
  "where",
  "snooze",
  "doctor",
  "sync",
  "completions",
];

Deno.test({
  name: "zsh script includes all commands from main CLI",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    for (const cmd of expectedCommands) {
      assertStringIncludes(output, `'${cmd}:`, `zsh script should include command: ${cmd}`);
    }
  },
});

Deno.test({
  name: "bash script includes all commands from main CLI",
  async fn() {
    const { output } = await getCompletionOutput("bash");
    for (const cmd of expectedCommands) {
      assertStringIncludes(output, cmd, `bash script should include command: ${cmd}`);
    }
  },
});

// === Tests for --project and --context completion support ===

Deno.test({
  name: "zsh script declares -p/--project flag for note/task/event",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assertStringIncludes(
      output,
      "{-p,--project}",
      "zsh script should declare -p as short form for --project",
    );
    assertStringIncludes(
      output,
      "->project_aliases",
      "zsh script should use ->project_aliases for --project",
    );
  },
});

Deno.test({
  name: "zsh script uses alias candidates for --context (not tags)",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assertStringIncludes(output, "->context_aliases", "should use ->context_aliases for --context");
    assert(!output.includes("->context_tags"), "should NOT include ->context_tags");
  },
});

Deno.test({
  name: "zsh script declares -c short form for --context",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assertStringIncludes(
      output,
      "{-c,--context}",
      "zsh script should declare -c as short form for --context",
    );
  },
});

Deno.test({
  name: "zsh script includes edit_flags with metadata options",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assertStringIncludes(output, "edit_flags", "zsh script should define edit_flags array");
  },
});

Deno.test({
  name: "zsh script does not include _mm_get_tag_candidates",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assert(!output.includes("_mm_get_tag_candidates"), "should NOT include _mm_get_tag_candidates");
  },
});

Deno.test({
  name: "bash script includes --project flag for note/task/event",
  async fn() {
    const { output } = await getCompletionOutput("bash");
    assertStringIncludes(output, "--project", "bash script should include --project flag");
  },
});

Deno.test({
  name: "bash script completes -p/--project value with alias candidates",
  async fn() {
    const { output } = await getCompletionOutput("bash");
    assertStringIncludes(
      output,
      '"--project"',
      "bash script should have --project in flag value completion section",
    );
    assertStringIncludes(
      output,
      '"-p"',
      "bash script should have -p in flag value completion section",
    );
  },
});

Deno.test({
  name: "bash script uses alias candidates for --context (not tags)",
  async fn() {
    const { output } = await getCompletionOutput("bash");
    assert(!output.includes("_mm_get_tag_candidates"), "should NOT include _mm_get_tag_candidates");
    assertStringIncludes(
      output,
      "_mm_get_alias_candidates",
      "bash script should use _mm_get_alias_candidates for context completion",
    );
  },
});

Deno.test({
  name: "bash script includes edit command in flag completion section",
  async fn() {
    const { output } = await getCompletionOutput("bash");
    assertStringIncludes(
      output,
      "edit|e)",
      "bash script should have edit|e) case in flag completion section",
    );
  },
});

Deno.test({
  name: "zsh script uses -C flag on inner _arguments calls for state handling",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    // Inner _arguments calls need -C so that ->state actions set $state
    assertStringIncludes(
      output,
      "_arguments -C '1:title:' $create_flags",
      "create command _arguments should use -C flag with positional title arg",
    );
    assertStringIncludes(
      output,
      "_arguments -C",
      "inner _arguments calls should use -C flag",
    );
  },
});

Deno.test({
  name: "zsh script handles hyphen-containing aliases correctly",
  async fn() {
    const { output } = await getCompletionOutput("zsh");
    assertStringIncludes(
      output,
      "compadd -a aliases",
      "should use 'compadd -a aliases' to handle hyphenated aliases correctly",
    );
    assertStringIncludes(
      output,
      '${(f)"$(_mm_get_alias_candidates)"}',
      "should use proper array expansion to preserve hyphens",
    );
  },
});
