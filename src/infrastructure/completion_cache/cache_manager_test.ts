import { assertEquals } from "@std/assert";
import { join } from "@std/path";
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

Deno.test("CacheManager - add and get aliases", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });

  await manager.addAliases(["todo", "meeting"]);

  const aliases = await manager.getAliases();
  assertEquals(aliases, ["todo", "meeting"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - add and get context tags", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });

  await manager.addContextTags(["work", "personal"]);

  const tags = await manager.getContextTags();
  assertEquals(tags, ["work", "personal"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - respects maxEntries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 3 });

  await manager.addAliases(["a", "b", "c", "d", "e"]);

  const aliases = await manager.getAliases();
  // Should keep only last 3
  assertEquals(aliases, ["c", "d", "e"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - handles empty arrays", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });

  await manager.addAliases([]);
  await manager.addContextTags([]);

  const aliases = await manager.getAliases();
  const tags = await manager.getContextTags();

  assertEquals(aliases, []);
  assertEquals(tags, []);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheManager - independent alias and tag management", async () => {
  const workspaceDir = await setupTestWorkspace();
  const manager = new CacheManager(workspaceDir, { maxEntries: 1000 });

  await manager.addAliases(["todo"]);
  await manager.addContextTags(["work"]);

  const aliases = await manager.getAliases();
  const tags = await manager.getContextTags();

  assertEquals(aliases, ["todo"]);
  assertEquals(tags, ["work"]);

  await cleanupWorkspace(workspaceDir);
});
