import { assertEquals } from "@std/assert";
import { join } from "@std/path";
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

  const aliases = await repo.readAliases();
  const tags = await repo.readContextTags();

  assertEquals(aliases, []);
  assertEquals(tags, []);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - append aliases", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  await repo.appendAliases(["todo", "meeting"], 1000);

  const aliases = await repo.readAliases();
  assertEquals(aliases, ["todo", "meeting"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - append context tags", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  await repo.appendContextTags(["work", "personal"], 1000);

  const tags = await repo.readContextTags();
  assertEquals(tags, ["work", "personal"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - deduplicates against tail", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  // First append
  await repo.appendAliases(["todo", "meeting"], 1000);

  // Second append with duplicate "meeting"
  await repo.appendAliases(["meeting", "project"], 1000);

  const aliases = await repo.readAliases();
  // "meeting" should not be duplicated because it was in the tail
  assertEquals(aliases, ["todo", "meeting", "project"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - truncates to maxEntries", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  // Add 5 entries
  await repo.appendAliases(["a", "b", "c", "d", "e"], 3);

  const aliases = await repo.readAliases();
  // Should keep only last 3
  assertEquals(aliases, ["c", "d", "e"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - truncates after multiple appends", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  await repo.appendAliases(["a", "b"], 5);
  await repo.appendAliases(["c", "d"], 5);
  await repo.appendAliases(["e", "f", "g"], 5);

  const aliases = await repo.readAliases();
  // Total 7 entries, max 5, should keep last 5
  assertEquals(aliases, ["c", "d", "e", "f", "g"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - skips all duplicates", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  await repo.appendAliases(["todo", "meeting"], 1000);

  // Try to append same values
  await repo.appendAliases(["todo", "meeting"], 1000);

  const aliases = await repo.readAliases();
  // Should still have only 2 entries
  assertEquals(aliases, ["todo", "meeting"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - handles empty append", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  await repo.appendAliases(["todo"], 1000);
  await repo.appendAliases([], 1000);

  const aliases = await repo.readAliases();
  assertEquals(aliases, ["todo"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - creates .index directory if missing", async () => {
  const workspaceDir = await setupTestWorkspace();
  await Deno.remove(join(workspaceDir, ".index"), { recursive: true });

  const repo = new CacheRepository(workspaceDir);
  await repo.appendAliases(["todo"], 1000);

  const aliases = await repo.readAliases();
  assertEquals(aliases, ["todo"]);

  await cleanupWorkspace(workspaceDir);
});

Deno.test("CacheRepository - independent alias and tag caches", async () => {
  const workspaceDir = await setupTestWorkspace();
  const repo = new CacheRepository(workspaceDir);

  await repo.appendAliases(["todo", "meeting"], 1000);
  await repo.appendContextTags(["work", "personal"], 1000);

  const aliases = await repo.readAliases();
  const tags = await repo.readContextTags();

  assertEquals(aliases, ["todo", "meeting"]);
  assertEquals(tags, ["work", "personal"]);

  await cleanupWorkspace(workspaceDir);
});
