import { assertEquals } from "@std/assert";
import { join, resolve } from "@std/path";
import { loadCliDependencies, resolveWorkspaceRootFromSources } from "./dependencies.ts";

const writeWorkspace = async (root: string) => {
  await Deno.mkdir(root, { recursive: true });
  const payload = JSON.stringify({ timezone: "Asia/Tokyo" }, null, 2);
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

const unwrapError = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): E => {
  if (result.type !== "error") {
    throw new Error(`${context}: expected error result`);
  }
  return result.error;
};

Deno.test({
  name: "resolveWorkspaceRootFromSources prioritizes explicit workspace path",
  permissions: { read: true, write: true },
  async fn() {
    const workspace = await Deno.makeTempDir({ prefix: "mm-cli-explicit-workspace-" });
    try {
      const result = resolveWorkspaceRootFromSources({ workspacePath: workspace });
      const root = unwrapOk(result, "workspace path result");
      assertEquals(root, resolve(workspace));
    } finally {
      await Deno.remove(workspace, { recursive: true });
    }
  },
});

Deno.test({
  name: "resolveWorkspaceRootFromSources uses MM_HOME when provided",
  permissions: { read: true, write: true },
  async fn() {
    const mmHome = await Deno.makeTempDir({ prefix: "mm-cli-mm-home-" });
    try {
      const result = resolveWorkspaceRootFromSources({ mmHome });
      const root = unwrapOk(result, "mm home result");
      assertEquals(root, resolve(mmHome));
    } finally {
      await Deno.remove(mmHome, { recursive: true });
    }
  },
});

Deno.test({
  name: "resolveWorkspaceRootFromSources defaults to HOME when MM_HOME is absent",
  permissions: { read: true, write: true },
  async fn() {
    const home = await Deno.makeTempDir({ prefix: "mm-cli-home-" });
    try {
      const result = resolveWorkspaceRootFromSources({ home });
      const root = unwrapOk(result, "home result");
      assertEquals(root, resolve(home, ".mm"));
    } finally {
      await Deno.remove(home, { recursive: true });
    }
  },
});

Deno.test({
  name: "resolveWorkspaceRootFromSources returns error when sources are empty",
  permissions: { read: true, write: true },
  fn() {
    const error = unwrapError(
      resolveWorkspaceRootFromSources({}),
      "empty sources result",
    );
    assertEquals(
      error,
      {
        type: "workspace",
        message: "workspace root could not be determined; set --workspace, MM_HOME, or HOME",
      },
    );
  },
});

Deno.test({
  name: "loadCliDependencies uses provided workspace path",
  permissions: { read: true, write: true },
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
