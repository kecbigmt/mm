import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { replaceIndex, writeAliasIndex, writeGraphIndex } from "./index_writer.ts";
import { EdgeData } from "./index_rebuilder.ts";
import { AliasSnapshot } from "../../domain/models/alias.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { parseItemRank } from "../../domain/primitives/item_rank.ts";
import { parseDateTime } from "../../domain/primitives/date_time.ts";
import { Result } from "../../shared/result.ts";

// Helper to create test edge data
const createTestEdgeData = (id: string, rank: string): EdgeData => ({
  itemId: Result.unwrap(parseItemId(id)),
  rank: Result.unwrap(parseItemRank(rank)),
  createdAt: Result.unwrap(parseDateTime("2025-01-15T10:00:00Z")),
});

Deno.test("writeGraphIndex - writes date edges to temp directory", async () => {
  const tempDir = await Deno.makeTempDir();
  const workspaceRoot = tempDir;

  // Create index directory
  await Deno.mkdir(join(workspaceRoot, ".index"), { recursive: true });

  // Create test edges
  const edges = new Map<string, ReadonlyArray<EdgeData>>();
  edges.set("dates/2025-01-15", [
    createTestEdgeData("019a85fc-67c4-7a54-be8e-305bae009f9e", "aaa"),
    createTestEdgeData("019a8603-1234-7890-abcd-1234567890ab", "bbb"),
  ]);

  // Write to temp location
  const result = await writeGraphIndex(workspaceRoot, edges, { temp: true });
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.edgeFilesWritten, 2);
    assertEquals(result.value.directoriesCreated, 1);
  }

  // Verify files exist
  const edgeFile1 = join(
    workspaceRoot,
    ".index",
    ".tmp-graph",
    "dates",
    "2025-01-15",
    "019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
  );
  const edgeFile2 = join(
    workspaceRoot,
    ".index",
    ".tmp-graph",
    "dates",
    "2025-01-15",
    "019a8603-1234-7890-abcd-1234567890ab.edge.json",
  );

  const content1 = JSON.parse(await Deno.readTextFile(edgeFile1));
  assertEquals(content1.schema, "mm.edge/1");
  assertEquals(content1.to, "019a85fc-67c4-7a54-be8e-305bae009f9e");
  assertEquals(content1.rank, "aaa");

  const content2 = JSON.parse(await Deno.readTextFile(edgeFile2));
  assertEquals(content2.to, "019a8603-1234-7890-abcd-1234567890ab");
  assertEquals(content2.rank, "bbb");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("writeGraphIndex - writes parent edges with from field", async () => {
  const tempDir = await Deno.makeTempDir();
  const workspaceRoot = tempDir;

  // Create index directory
  await Deno.mkdir(join(workspaceRoot, ".index"), { recursive: true });

  // Create test edges with parent placement
  const edges = new Map<string, ReadonlyArray<EdgeData>>();
  edges.set("parents/019a8603-1234-7890-abcd-1234567890ab", [
    createTestEdgeData("019a85fc-67c4-7a54-be8e-305bae009f9e", "aaa"),
  ]);

  // Write to temp location
  const result = await writeGraphIndex(workspaceRoot, edges, { temp: true });
  assertEquals(result.type, "ok");

  // Verify file has from field
  const edgeFile = join(
    workspaceRoot,
    ".index",
    ".tmp-graph",
    "parents",
    "019a8603-1234-7890-abcd-1234567890ab",
    "019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
  );

  const content = JSON.parse(await Deno.readTextFile(edgeFile));
  assertEquals(content.schema, "mm.edge/1");
  assertEquals(content.from, "019a8603-1234-7890-abcd-1234567890ab");
  assertEquals(content.to, "019a85fc-67c4-7a54-be8e-305bae009f9e");
  assertEquals(content.rank, "aaa");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("writeAliasIndex - writes alias files to temp directory", async () => {
  const tempDir = await Deno.makeTempDir();
  const workspaceRoot = tempDir;

  // Create index directory
  await Deno.mkdir(join(workspaceRoot, ".index"), { recursive: true });

  // Create test aliases
  const aliases = new Map<string, AliasSnapshot>();
  aliases.set("ab/abcd1234", {
    raw: "my-alias",
    canonicalKey: "my-alias",
    itemId: "019a85fc-67c4-7a54-be8e-305bae009f9e",
    createdAt: "2025-01-15T10:00:00Z",
  });

  // Write to temp location
  const result = await writeAliasIndex(workspaceRoot, aliases, { temp: true });
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.aliasFilesWritten, 1);
    assertEquals(result.value.directoriesCreated, 1);
  }

  // Verify file exists
  const aliasFile = join(
    workspaceRoot,
    ".index",
    ".tmp-aliases",
    "ab",
    "abcd1234.alias.json",
  );

  const content = JSON.parse(await Deno.readTextFile(aliasFile));
  assertEquals(content.schema, "mm.alias/2");
  assertEquals(content.raw, "my-alias");
  assertEquals(content.canonicalKey, "my-alias");
  assertEquals(content.itemId, "019a85fc-67c4-7a54-be8e-305bae009f9e");
  assertEquals(content.createdAt, "2025-01-15T10:00:00Z");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("replaceIndex - replaces existing index with temp directories", async () => {
  const tempDir = await Deno.makeTempDir();
  const workspaceRoot = tempDir;
  const indexDir = join(workspaceRoot, ".index");

  // Create existing graph and aliases directories
  await Deno.mkdir(join(indexDir, "graph", "dates"), { recursive: true });
  await Deno.mkdir(join(indexDir, "aliases", "ab"), { recursive: true });
  await Deno.writeTextFile(join(indexDir, "graph", "dates", "old.json"), "old");
  await Deno.writeTextFile(join(indexDir, "aliases", "ab", "old.json"), "old");

  // Create temp directories with new content
  await Deno.mkdir(join(indexDir, ".tmp-graph", "dates"), { recursive: true });
  await Deno.mkdir(join(indexDir, ".tmp-aliases", "cd"), { recursive: true });
  await Deno.writeTextFile(join(indexDir, ".tmp-graph", "dates", "new.json"), "new");
  await Deno.writeTextFile(join(indexDir, ".tmp-aliases", "cd", "new.json"), "new");

  // Replace index
  const result = await replaceIndex(workspaceRoot);
  assertEquals(result.type, "ok");

  // Verify old content is gone
  let oldGraphExists = true;
  try {
    await Deno.stat(join(indexDir, "graph", "dates", "old.json"));
  } catch {
    oldGraphExists = false;
  }
  assertEquals(oldGraphExists, false);

  // Verify new content exists
  const newGraphContent = await Deno.readTextFile(
    join(indexDir, "graph", "dates", "new.json"),
  );
  assertEquals(newGraphContent, "new");

  const newAliasContent = await Deno.readTextFile(
    join(indexDir, "aliases", "cd", "new.json"),
  );
  assertEquals(newAliasContent, "new");

  // Verify temp directories are gone
  let tmpGraphExists = true;
  try {
    await Deno.stat(join(indexDir, ".tmp-graph"));
  } catch {
    tmpGraphExists = false;
  }
  assertEquals(tmpGraphExists, false);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("replaceIndex - creates empty directories if temp doesn't exist", async () => {
  const tempDir = await Deno.makeTempDir();
  const workspaceRoot = tempDir;
  const indexDir = join(workspaceRoot, ".index");

  // Create existing directories to be replaced
  await Deno.mkdir(join(indexDir, "graph"), { recursive: true });
  await Deno.mkdir(join(indexDir, "aliases"), { recursive: true });

  // Replace without temp directories (they don't exist)
  const result = await replaceIndex(workspaceRoot);
  assertEquals(result.type, "ok");

  // Verify empty directories were created
  const graphStat = await Deno.stat(join(indexDir, "graph"));
  assertEquals(graphStat.isDirectory, true);

  const aliasesStat = await Deno.stat(join(indexDir, "aliases"));
  assertEquals(aliasesStat.isDirectory, true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});
