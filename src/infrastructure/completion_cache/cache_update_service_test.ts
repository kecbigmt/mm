import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { CacheManager } from "./cache_manager.ts";
import { CacheUpdateService } from "./cache_update_service.ts";

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

const mockItem = (alias?: string, contexts?: string[]) => ({
  data: {
    alias: alias ? { toString: () => alias } : undefined,
    contexts: contexts ? contexts.map((c) => ({ toString: () => c })) : undefined,
  },
});

Deno.test("CacheUpdateService - updateFromArgs adds context tag", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  await service.updateFromArgs({ contextOption: "work" });

  const tags = await manager.getContextTags();
  assertEquals(tags, ["work"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheUpdateService - updateFromItem adds alias and tag", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  const item = mockItem("todo", ["work"]);
  await service.updateFromItem(item);

  const aliases = await manager.getAliases();
  const tags = await manager.getContextTags();

  assertEquals(aliases, ["todo"]);
  assertEquals(tags, ["work"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheUpdateService - updateFromItems adds multiple entries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  const items = [
    mockItem("todo", ["work"]),
    mockItem("notes", ["personal"]),
  ];

  await service.updateFromItems(items);

  const aliases = await manager.getAliases();
  const tags = await manager.getContextTags();

  assertEquals(aliases, ["todo", "notes"]);
  assertEquals(tags.sort(), ["personal", "work"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheUpdateService - silently handles errors", async () => {
  const workspaceDir = await setupTestWorkspace();
  // Make workspace read-only to trigger write error
  await Deno.chmod(workspaceDir, 0o444);

  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  // Should not throw despite write error
  await service.updateFromArgs({ contextOption: "work" });

  // Restore permissions for cleanup
  await Deno.chmod(workspaceDir, 0o755);
  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheUpdateService - getAliases returns cached aliases", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  await service.updateFromItems([
    mockItem("todo", ["work"]),
    mockItem("notes", ["personal"]),
  ]);

  const aliases = await service.getAliases();
  assertEquals(aliases, ["todo", "notes"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheUpdateService - getAliases deduplicates entries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  // Simulate multiple updates adding the same alias
  await service.updateFromItem(mockItem("todo", []));
  await service.updateFromItem(mockItem("todo", []));
  await service.updateFromItem(mockItem("todo", []));

  const aliases = await service.getAliases();
  assertEquals(aliases, ["todo"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheUpdateService - getAliases returns empty on error", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  // Remove workspace to trigger read error
  await Deno.remove(workspaceDir, { recursive: true });

  const aliases = await service.getAliases();
  assertEquals(aliases, []);
});

Deno.test("CacheUpdateService - skips empty updates", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });
  const service = new CacheUpdateService(manager);

  // Update with item that has no alias or context
  const item = mockItem(undefined, undefined);
  await service.updateFromItem(item);

  const aliases = await manager.getAliases();
  const tags = await manager.getContextTags();

  assertEquals(aliases, []);
  assertEquals(tags, []);

  await cleanupWorkspace(workspaceDir);
});
