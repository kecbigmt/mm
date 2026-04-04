import { assertEquals } from "@std/assert";
import { join, resolve } from "@std/path";
import { loadCliDependencies } from "./dependencies.ts";

// resolveWorkspaceRootFromSources is tested in src/application/runtime_test.ts.
// This file only tests the CLI-specific thin wrapper.

const writeWorkspace = async (root: string) => {
  await Deno.mkdir(root, { recursive: true });
  const payload = JSON.stringify(
    { schema: "mm.workspace/1", migration: 3, timezone: "Asia/Tokyo" },
    null,
    2,
  );
  await Deno.writeTextFile(join(root, "workspace.json"), `${payload}\n`);
};

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const withTempMmHome = async (
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
  name: "loadCliDependencies uses provided workspace path",
  permissions: { env: true, read: true, write: true, sys: true },
  async fn() {
    const workspace = await Deno.makeTempDir({ prefix: "mm-cli-load-workspace-" });
    try {
      await writeWorkspace(workspace);
      const deps = unwrapOk(
        await loadCliDependencies(workspace),
        "load cli dependencies",
      );
      assertEquals(deps.root, resolve(workspace));
    } finally {
      await Deno.remove(workspace, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadCliDependencies resolves current workspace from config",
  permissions: { env: true, read: true, write: true, sys: true },
  async fn() {
    await withTempMmHome(async (home) => {
      const workspacePath = join(home, "workspaces", "home");
      await writeWorkspace(workspacePath);
      const configPath = join(home, "config.json");
      await Deno.writeTextFile(
        configPath,
        `${JSON.stringify({ currentWorkspace: "home" }, null, 2)}\n`,
      );

      const deps = unwrapOk(
        await loadCliDependencies(),
        "load cli dependencies from config",
      );
      assertEquals(deps.root, resolve(workspacePath));
    });
  },
});
