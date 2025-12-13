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
