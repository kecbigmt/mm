import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemStateRepository } from "./state_repository.ts";

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
      const loadResult = await repository.loadSyncState();

      assert(loadResult.type === "error", "should return error for invalid JSON");
      assertEquals(loadResult.error.scope, "state");
      assertEquals(loadResult.error.operation, "load");
    } finally {
      await Deno.remove(workspaceRoot, { recursive: true });
    }
  },
});
