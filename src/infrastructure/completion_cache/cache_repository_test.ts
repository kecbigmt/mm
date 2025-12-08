import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createAliasEntry, createTagEntry } from "../../domain/models/completion_cache_entry.ts";
import { CacheRepository } from "./cache_repository.ts";

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

Deno.test("CacheRepository - read empty cache returns empty array", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  const entries = await repo.read();

  assertEquals(entries, []);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - write and read entries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  const entries = [
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
    createTagEntry({
      tag: "work",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ];

  await repo.write(entries);
  const readEntries = await repo.read();

  assertEquals(readEntries.length, 2);
  assertEquals(readEntries[0].type, "alias");
  assertEquals(readEntries[0].value, "todo");
  assertEquals(readEntries[1].type, "tag");
  assertEquals(readEntries[1].value, "work");

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - append entries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  const entry1 = createAliasEntry({
    alias: "todo",
    targetId: "0193bb00-0000-7000-8000-000000000000",
    lastSeen: "2025-12-08T06:00:00Z",
  });

  const entry2 = createTagEntry({
    tag: "work",
    lastSeen: "2025-12-08T06:01:00Z",
  });

  await repo.append([entry1]);
  await repo.append([entry2]);

  const entries = await repo.read();

  assertEquals(entries.length, 2);
  assertEquals(entries[0].value, "todo");
  assertEquals(entries[1].value, "work");

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - handles malformed lines gracefully", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);
  const cacheFile = join(workspaceDir, ".index", "completion_cache.jsonl");

  // Write valid entry followed by malformed line
  const validEntry = JSON.stringify(
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  );
  await Deno.writeTextFile(cacheFile, validEntry + "\n{invalid json\n");

  const entries = await repo.read();

  // Should skip malformed line and return only valid entry
  assertEquals(entries.length, 1);
  assertEquals(entries[0].value, "todo");

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - atomic write uses tmp file", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  const entries = [
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ];

  await repo.atomicWrite(entries);

  // Verify the file exists and tmp file is gone
  const cacheFile = join(workspaceDir, ".index", "completion_cache.jsonl");
  const tmpFile = cacheFile + ".tmp";

  const stat = await Deno.stat(cacheFile);
  assertEquals(stat.isFile, true);

  try {
    await Deno.stat(tmpFile);
    throw new Error("Tmp file should not exist after atomic write");
  } catch (error) {
    assertEquals(error instanceof Deno.errors.NotFound, true);
  }

  const readEntries = await repo.read();
  assertEquals(readEntries.length, 1);
  assertEquals(readEntries[0].value, "todo");

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - creates .index directory not file", async () => {
  const workspaceDir = await setupTestWorkspace();
  // Remove .index directory to test creation
  await Deno.remove(join(workspaceDir, ".index"), { recursive: true });

  const repo = new CacheRepository(workspaceDir);

  const entries = [
    createAliasEntry({
      alias: "test",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ];

  await repo.write(entries);

  // Verify .index is a directory, not a file
  const indexDir = join(workspaceDir, ".index");
  const indexStat = await Deno.stat(indexDir);
  assertEquals(indexStat.isDirectory, true);

  // Verify cache file exists as a file inside .index
  const cacheFile = join(indexDir, "completion_cache.jsonl");
  const cacheStat = await Deno.stat(cacheFile);
  assertEquals(cacheStat.isFile, true);

  await cleanupWorkspace(workspaceDir);
});
