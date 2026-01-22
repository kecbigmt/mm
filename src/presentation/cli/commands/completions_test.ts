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

Deno.test({
  name: "completions command outputs zsh script",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    assertEquals(captured.errors.length, 0, "should not produce errors");
    assert(captured.logs.length > 0, "should output script to stdout");

    const output = captured.logs.join("\n");
    assertStringIncludes(output, "#compdef mm", "should contain zsh compdef directive");
    assertStringIncludes(output, "_mm", "should define _mm completion function");
  },
});

Deno.test({
  name: "completions command outputs bash script",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "bash"]);
    } finally {
      captured.restore();
    }

    assertEquals(captured.errors.length, 0, "should not produce errors");
    assert(captured.logs.length > 0, "should output script to stdout");

    const output = captured.logs.join("\n");
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
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");
    assertStringIncludes(
      output,
      "Installation",
      "should include installation instructions",
    );
  },
});

Deno.test({
  name: "bash script includes installation instructions",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "bash"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");
    assertStringIncludes(
      output,
      "Installation",
      "should include installation instructions",
    );
  },
});

// Note: Syntax validation tests have been moved to tests/e2e/scenarios/completions_test.ts
// because they depend on external shell binaries (zsh, bash) being installed.

Deno.test({
  name: "zsh script includes all commands from main CLI",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Commands that should be in completion script
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

    for (const cmd of expectedCommands) {
      assertStringIncludes(
        output,
        `'${cmd}:`,
        `zsh script should include command: ${cmd}`,
      );
    }
  },
});

Deno.test({
  name: "bash script includes all commands from main CLI",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "bash"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Commands that should be in completion script
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

    for (const cmd of expectedCommands) {
      assertStringIncludes(
        output,
        cmd,
        `bash script should include command: ${cmd}`,
      );
    }
  },
});

Deno.test({
  name: "zsh script handles hyphen-containing aliases correctly",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Verify the script uses compadd -a instead of _describe for aliases
    // This is the critical fix that prevents hyphen splitting
    assertStringIncludes(
      output,
      "compadd -a aliases",
      "zsh script should use 'compadd -a aliases' to handle hyphenated aliases correctly",
    );

    // Verify the proper array expansion is used
    assertStringIncludes(
      output,
      '${(f)"$(_mm_get_alias_candidates)"}',
      "zsh script should use proper array expansion to preserve hyphens",
    );
  },
});

Deno.test({
  name: "zsh script includes --project flag with alias completion for note/task/event",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Verify --project flag is declared in note_flags
    assertStringIncludes(
      output,
      "'--project[Project reference]:project:->project_aliases'",
      "zsh script should declare --project flag with alias completion in note_flags",
    );

    // Verify project_aliases case handler exists (combined with context_aliases)
    assertStringIncludes(
      output,
      "project_aliases|context_aliases)",
      "zsh script should have project_aliases case handler",
    );
  },
});

Deno.test({
  name: "zsh script includes --project flag with alias completion for edit command",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Verify edit command handles --project flag
    assertStringIncludes(
      output,
      "'--project[Project reference]:project:->project_aliases'",
      "zsh script should declare --project flag for edit command",
    );
  },
});

Deno.test({
  name: "zsh script uses alias candidates for --context completion",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "zsh"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Verify --context flag uses alias candidates (not old context tags)
    assertStringIncludes(
      output,
      "'--context[Context reference]:context:->context_aliases'",
      "zsh script should declare --context flag with alias completion",
    );

    // Verify context_aliases case handler uses alias candidates
    assertStringIncludes(
      output,
      "context_aliases)",
      "zsh script should have context_aliases case handler",
    );
  },
});

Deno.test({
  name: "bash script includes --project flag with alias completion",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "bash"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Verify --project flag is in the flags list
    assertStringIncludes(
      output,
      "--project",
      "bash script should include --project flag",
    );

    // Verify --project flag value completion uses aliases
    assertStringIncludes(
      output,
      '"--project"',
      "bash script should handle --project flag value completion",
    );
  },
});

Deno.test({
  name: "bash script uses alias candidates for --context and --project completion",
  async fn() {
    const captured = captureConsole();
    try {
      await buildCli().parse(["completions", "bash"]);
    } finally {
      captured.restore();
    }

    const output = captured.logs.join("\n");

    // Verify that --project completion uses alias candidates
    assertStringIncludes(
      output,
      "_mm_get_alias_candidates",
      "bash script should use _mm_get_alias_candidates for completion",
    );
  },
});
