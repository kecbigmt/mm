import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemItemRepository } from "./item_repository.ts";
import { parseItem } from "../../domain/models/item.ts";
import { parseItemId } from "../../domain/primitives/mod.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const sampleItemSnapshot = () => ({
  id: "019965a7-2789-740a-b8c1-1415904fd108",
  title: "Sample",
  icon: "note",
  status: "open",
  container: "2024/09/20",
  rank: "a1",
  createdAt: "2024-09-20T12:00:00Z",
  updatedAt: "2024-09-20T12:00:00Z",
  body: "Sample body",
  edges: [
    {
      kind: "ItemEdge" as const,
      to: "019965a7-2789-740a-b8c1-1415904fd109",
      rank: "b1",
    },
  ],
});

Deno.test({
  name: "item repository saves and loads items",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-item-" });
    try {
      const repository = createFileSystemItemRepository({ root });
      const item = unwrapOk(parseItem(sampleItemSnapshot()), "parse item");

      unwrapOk(await repository.save(item), "save item");

      const itemId = item.data.id.toString();
      const nodeDirectory = join(root, "nodes", "2024", "09", "20", itemId);
      const metaPath = join(nodeDirectory, "meta.json");
      const contentPath = join(nodeDirectory, "content.md");
      const edgesDirectory = join(nodeDirectory, "edges");
      const edgeFile = join(edgesDirectory, "019965a7-2789-740a-b8c1-1415904fd109.edge.json");
      const indexPath = join(root, "nodes", ".index", `${itemId}.json`);

      const nodeInfo = await Deno.stat(nodeDirectory);
      assert(nodeInfo.isDirectory, "item directory should exist");

      const metaSnapshot = JSON.parse(await Deno.readTextFile(metaPath));
      assertEquals(metaSnapshot.schema, "mm.item/1");
      assertEquals(metaSnapshot.id, itemId);
      assertEquals(metaSnapshot.rank, item.data.rank.toString());

      const content = await Deno.readTextFile(contentPath);
      assertEquals(content, "Sample body\n");

      const edgeFiles: string[] = [];
      for await (const entry of Deno.readDir(edgesDirectory)) {
        if (entry.isFile) {
          edgeFiles.push(entry.name);
        }
      }
      assertEquals(edgeFiles, ["019965a7-2789-740a-b8c1-1415904fd109.edge.json"]);

      const edgeSnapshot = JSON.parse(await Deno.readTextFile(edgeFile));
      assertEquals(edgeSnapshot.schema, "mm.edge/1");
      assertEquals(edgeSnapshot.to, "019965a7-2789-740a-b8c1-1415904fd109");
      assertEquals(edgeSnapshot.rank, "b1");

      const indexSnapshot = JSON.parse(await Deno.readTextFile(indexPath));
      assertEquals(indexSnapshot.path, "2024/09/20");

      const loadResult = await repository.load(item.data.id);
      const loaded = unwrapOk(loadResult, "load item");

      if (!loaded) {
        throw new Error("expected item to be returned");
      }

      assertEquals(loaded.data.id.toString(), item.data.id.toString());
      assertEquals(loaded.data.body, item.data.body);
      assertEquals(loaded.edges.length, 1);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "item repository deletes items",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-item-delete-" });
    try {
      const repository = createFileSystemItemRepository({ root });
      const item = unwrapOk(parseItem(sampleItemSnapshot()), "parse item");
      unwrapOk(await repository.save(item), "save item");

      unwrapOk(await repository.delete(item.data.id), "delete item");

      const loadResult = await repository.load(item.data.id);
      if (loadResult.type !== "ok" || loadResult.value !== undefined) {
        throw new Error("expected item to be deleted");
      }

      const itemId = item.data.id.toString();
      const nodeDirectory = join(root, "nodes", "2024", "09", "20", itemId);
      const indexPath = join(root, "nodes", ".index", `${itemId}.json`);

      await assertRejects(() => Deno.stat(nodeDirectory), Deno.errors.NotFound);
      await assertRejects(() => Deno.stat(indexPath), Deno.errors.NotFound);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "item repository returns undefined for missing item",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-item-missing-" });
    try {
      const repository = createFileSystemItemRepository({ root });
      const id = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd1ff"), "parse item id");
      const loadResult = await repository.load(id);
      if (loadResult.type !== "ok" || loadResult.value !== undefined) {
        throw new Error("expected missing item to return undefined");
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
