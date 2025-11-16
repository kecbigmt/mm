import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemStateRepository } from "./state_repository.ts";
import { parsePlacement } from "../../domain/primitives/placement.ts";

Deno.test({
  name: "state repository saves and loads CWD",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      const placementResult = parsePlacement("2024-01-15");
      assert(placementResult.type === "ok", "failed to parse placement");
      const testPlacement = placementResult.value;

      const saveResult = await repository.saveCwd(testPlacement);
      assert(saveResult.type === "ok", "failed to save CWD");

      const loadResult = await repository.loadCwd();
      assert(loadResult.type === "ok", "failed to load CWD");
      assert(loadResult.value !== undefined, "CWD should be loaded");
      assertEquals(loadResult.value.toString(), "2024-01-15");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository returns undefined for missing state file",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      const loadResult = await repository.loadCwd();
      assert(loadResult.type === "ok", "should succeed even when file doesn't exist");
      assertEquals(loadResult.value, undefined, "should return undefined for missing file");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository updates existing CWD",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      const placement1Result = parsePlacement("2024-01-15");
      assert(placement1Result.type === "ok");
      await repository.saveCwd(placement1Result.value);

      const placement2Result = parsePlacement("2024-02-20");
      assert(placement2Result.type === "ok");
      await repository.saveCwd(placement2Result.value);

      const loadResult = await repository.loadCwd();
      assert(loadResult.type === "ok");
      assert(loadResult.value !== undefined);
      assertEquals(loadResult.value.toString(), "2024-02-20");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository handles invalid JSON gracefully",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const statePath = join(workspaceRoot, ".state.json");
      await Deno.writeTextFile(statePath, "{ invalid json }");

      const repository = createFileSystemStateRepository({ workspaceRoot });
      const loadResult = await repository.loadCwd();

      assert(loadResult.type === "error", "should return error for invalid JSON");
      assertEquals(loadResult.error.scope, "state");
      assertEquals(loadResult.error.operation, "load");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository treats empty CWD as undefined",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const statePath = join(workspaceRoot, ".state.json");
      await Deno.writeTextFile(statePath, JSON.stringify({ default_cwd: "" }));

      const repository = createFileSystemStateRepository({ workspaceRoot });
      const loadResult = await repository.loadCwd();

      assert(loadResult.type === "ok", "should succeed with empty path");
      assertEquals(loadResult.value, undefined, "empty path should be treated as undefined");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});
