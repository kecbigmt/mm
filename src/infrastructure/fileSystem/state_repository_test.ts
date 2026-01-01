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

Deno.test({
  name: "state repository returns default sync state for missing file",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      const loadResult = await repository.loadSyncState();
      assert(loadResult.type === "ok", "should succeed even when file doesn't exist");
      assertEquals(loadResult.value.commitsSinceLastSync, 0);
      assertEquals(loadResult.value.lastSyncTimestamp, null);
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository saves and loads sync state",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      const saveResult = await repository.saveSyncState({
        commitsSinceLastSync: 5,
        lastSyncTimestamp: 1704067200000, // 2024-01-01 00:00:00 UTC
      });
      assert(saveResult.type === "ok", "failed to save sync state");

      const loadResult = await repository.loadSyncState();
      assert(loadResult.type === "ok", "failed to load sync state");
      assertEquals(loadResult.value.commitsSinceLastSync, 5);
      assertEquals(loadResult.value.lastSyncTimestamp, 1704067200000);
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository preserves CWD when saving sync state",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      // Save CWD first
      const placementResult = parsePlacement("2024-01-15");
      assert(placementResult.type === "ok");
      await repository.saveCwd(placementResult.value);

      // Save sync state
      await repository.saveSyncState({
        commitsSinceLastSync: 3,
        lastSyncTimestamp: 1704067200000,
      });

      // Verify CWD is preserved
      const cwdResult = await repository.loadCwd();
      assert(cwdResult.type === "ok");
      assert(cwdResult.value !== undefined);
      assertEquals(cwdResult.value.toString(), "2024-01-15");

      // Verify sync state is saved
      const syncResult = await repository.loadSyncState();
      assert(syncResult.type === "ok");
      assertEquals(syncResult.value.commitsSinceLastSync, 3);
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});

Deno.test({
  name: "state repository preserves sync state when saving CWD",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspaceRoot = await Deno.makeTempDir({ prefix: "mm-state-test-" });
    try {
      const repository = createFileSystemStateRepository({ workspaceRoot });

      // Save sync state first
      await repository.saveSyncState({
        commitsSinceLastSync: 7,
        lastSyncTimestamp: 1704067200000,
      });

      // Save CWD
      const placementResult = parsePlacement("2024-02-20");
      assert(placementResult.type === "ok");
      await repository.saveCwd(placementResult.value);

      // Verify sync state is preserved
      const syncResult = await repository.loadSyncState();
      assert(syncResult.type === "ok");
      assertEquals(syncResult.value.commitsSinceLastSync, 7);
      assertEquals(syncResult.value.lastSyncTimestamp, 1704067200000);

      // Verify CWD is saved
      const cwdResult = await repository.loadCwd();
      assert(cwdResult.type === "ok");
      assert(cwdResult.value !== undefined);
      assertEquals(cwdResult.value.toString(), "2024-02-20");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});
