import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createAliasEntry, createTagEntry } from "../../domain/models/completion_cache_entry.ts";
import { CacheManager } from "./cache_manager.ts";

async function setupTestWorkspace(): Promise<string> {
  const workspaceDir = await Deno.makeTempDir({
    prefix: "mm_test_workspace_",
  });
  const indexDir = join(workspaceDir, ".index");
  await Deno.mkdir(indexDir, { recursive: true });
  return workspaceDir;
}

async function cleanupWorkspace(workspaceDir: string) {
  try {
    await Deno.remove(workspaceDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

Deno.test("CacheManager - add entries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });

  const entries = [
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ];

  await manager.add(entries);

  const cached = await manager.getAll();
  assertEquals(cached.length, 1);
  assertEquals(cached[0].value, "todo");

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - triggers compaction after 10 writes", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, {
    maxEntries: 1000,
    compactionThreshold: { writes: 10, sizeBytes: 50000 },
  });

  // Add 10 entries one by one (will trigger compaction on 10th write)
  for (let i = 0; i < 10; i++) {
    await manager.add([
      createAliasEntry({
        alias: `item${i}`,
        targetId: `0193bb00-0000-7000-8000-00000000000${i}`,
        lastSeen: `2025-12-08T06:${String(i).padStart(2, "0")}:00Z`,
      }),
    ]);
  }

  const cached = await manager.getAll();
  // After 10 writes, compaction should have occurred
  assertEquals(cached.length, 10);
  // Should be sorted by recency (newest first) after compaction
  assertEquals(cached[0].value, "item9");
  assertEquals(cached[9].value, "item0");

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - deduplicates on compaction", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, {
    maxEntries: 1000,
    compactionThreshold: { writes: 3, sizeBytes: 50000 },
  });

  // Add duplicate entries
  await manager.add([
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ]);

  await manager.add([
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T07:00:00Z", // Newer
    }),
  ]);

  await manager.add([
    createTagEntry({
      tag: "work",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ]);

  // This should trigger compaction (3rd write)
  await manager.add([
    createTagEntry({
      tag: "urgent",
      lastSeen: "2025-12-08T08:00:00Z",
    }),
  ]);

  const cached = await manager.getAll();
  // Should have 3 entries (todo deduplicated, work, urgent)
  assertEquals(cached.length, 3);

  // Find the todo entry
  const todoEntry = cached.find((e) => e.value === "todo");
  assertEquals(todoEntry?.last_seen, "2025-12-08T07:00:00Z"); // Kept newer

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - truncates to maxEntries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, {
    maxEntries: 5,
    compactionThreshold: { writes: 10, sizeBytes: 50000 },
  });

  // Add 10 entries
  for (let i = 0; i < 10; i++) {
    await manager.add([
      createAliasEntry({
        alias: `item${i}`,
        targetId: `0193bb00-0000-7000-8000-00000000000${i}`,
        lastSeen: `2025-12-08T06:${String(i).padStart(2, "0")}:00Z`,
      }),
    ]);
  }

  // Force compaction
  await manager.compact();

  const cached = await manager.getAll();
  // Should keep only 5 most recent
  assertEquals(cached.length, 5);
  assertEquals(cached[0].value, "item9");
  assertEquals(cached[4].value, "item5");

  await cleanupWorkspace(workspaceDir);
});
