import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Command } from "jsr:@cliffy/command@1.0.0-rc.4";
import { createWorkspaceCommand } from "./workspace.ts";

const buildCli = () =>
  new Command()
    .name("mm")
    .version("0.1.0")
    .description("Test harness for mm CLI")
    .command("workspace", createWorkspaceCommand()).alias("ws");

const captureConsole = () => {
  const logLines: string[] = [];
  const errorLines: string[] = [];
  const original = {
    log: console.log,
    error: console.error,
  };
  console.log = (...args) => {
    logLines.push(args.map(String).join(" "));
  };
  console.error = (...args) => {
    errorLines.push(args.map(String).join(" "));
  };
  return {
    logs: logLines,
    errors: errorLines,
    restore() {
      console.log = original.log;
      console.error = original.error;
    },
  };
};

const withTempHome = async (
  fn: (home: string) => Promise<void>,
) => {
  const originalMmHome = Deno.env.get("MM_HOME");
  const home = await Deno.makeTempDir({ prefix: "mm-cli-home-" });
  try {
    Deno.env.set("MM_HOME", home);
    await fn(home);
  } finally {
    if (originalMmHome === undefined) {
      Deno.env.delete("MM_HOME");
    } else {
      Deno.env.set("MM_HOME", originalMmHome);
    }
    await Deno.remove(home, { recursive: true });
  }
};

Deno.test({
  name: "workspace list reports empty state",
  permissions: { env: true, read: true, write: true },
  async fn() {
    await withTempHome(async () => {
      const output = captureConsole();
      try {
        await buildCli().parse(["workspace", "list"]);
      } finally {
        output.restore();
      }
      assert(output.errors.length === 0);
      assert(output.logs.some((line) => line.includes("No workspaces found.")));
    });
  },
});

Deno.test({
  name: "workspace add and use create workspace and set config",
  permissions: { env: true, read: true, write: true },
  async fn() {
    await withTempHome(async (home) => {
      const addOutput = captureConsole();
      try {
        await buildCli().parse([
          "workspace",
          "add",
          "home",
          "--timezone",
          "UTC",
        ]);
      } finally {
        addOutput.restore();
      }
      assertEquals(addOutput.errors.length, 0);
      const workspacePath = join(home, "workspaces", "home");
      const workspaceFile = join(workspacePath, "workspace.json");
      const meta = JSON.parse(await Deno.readTextFile(workspaceFile)) as {
        readonly timezone: string;
      };
      assertEquals(meta.timezone, "UTC");

      const useOutput = captureConsole();
      try {
        await buildCli().parse([
          "workspace",
          "use",
          "home",
        ]);
      } finally {
        useOutput.restore();
      }
      assertEquals(useOutput.errors.length, 0);
      assert(useOutput.logs.some((line) => line.includes("Switched to workspace")));

      const configPath = join(home, "config.json");
      const config = JSON.parse(await Deno.readTextFile(configPath)) as {
        readonly currentWorkspace: string;
      };
      assertEquals(config.currentWorkspace, "home");
    });
  },
});
