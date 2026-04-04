import { assertEquals } from "@std/assert";
import { join, resolve } from "@std/path";
import { loadCoreDependencies, resolveWorkspaceRootFromSources } from "./runtime.ts";

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

const unwrapError = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): E => {
  if (result.type !== "error") {
    throw new Error(`${context}: expected error result`);
  }
  return result.error;
};

const withTempMmHome = async (
  fn: (home: string) => Promise<void>,
) => {
  const originalMmHome = Deno.env.get("MM_HOME");
  const home = await Deno.makeTempDir({ prefix: "mm-core-home-" });
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
  name: "resolveWorkspaceRootFromSources prioritizes explicit workspace path",
  permissions: { read: true, write: true },
  async fn() {
    const workspace = await Deno.makeTempDir({ prefix: "mm-core-explicit-workspace-" });
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
    const mmHome = await Deno.makeTempDir({ prefix: "mm-core-mm-home-" });
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
    const home = await Deno.makeTempDir({ prefix: "mm-core-home-" });
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
  name: "resolveWorkspaceRootFromSources falls back to USERPROFILE",
  permissions: { read: true, write: true },
  async fn() {
    const userProfile = await Deno.makeTempDir({ prefix: "mm-core-userprofile-" });
    try {
      const result = resolveWorkspaceRootFromSources({ userProfile });
      const root = unwrapOk(result, "user profile result");
      assertEquals(root, resolve(userProfile, ".mm"));
    } finally {
      await Deno.remove(userProfile, { recursive: true });
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
  name: "resolveWorkspaceRootFromSources ignores blank strings",
  permissions: { read: true },
  fn() {
    const error = unwrapError(
      resolveWorkspaceRootFromSources({ workspacePath: "  ", mmHome: "", home: "  " }),
      "blank sources result",
    );
    assertEquals(error.type, "workspace");
  },
});

Deno.test({
  name: "loadCoreDependencies uses provided workspace path",
  permissions: { env: true, read: true, write: true, sys: true },
  async fn() {
    const workspace = await Deno.makeTempDir({ prefix: "mm-core-load-workspace-" });
    try {
      await writeWorkspace(workspace);
      const deps = unwrapOk(
        await loadCoreDependencies(workspace),
        "load core dependencies",
      );
      assertEquals(deps.root, resolve(workspace));
    } finally {
      await Deno.remove(workspace, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadCoreDependencies resolves current workspace from config",
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
        await loadCoreDependencies(),
        "load core dependencies from config",
      );
      assertEquals(deps.root, resolve(workspacePath));
    });
  },
});
