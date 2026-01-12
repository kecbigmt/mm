import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemItemRepository } from "./item_repository.ts";
import { parseItem } from "../../domain/models/item.ts";
import { parseItemId } from "../../domain/primitives/mod.ts";
import { timezoneIdentifierFromString } from "../../domain/primitives/timezone_identifier.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const timezone = unwrapOk(
  timezoneIdentifierFromString("UTC"),
  "parse timezone",
);

const filePathForId = (root: string, id: string): string => {
  const normalized = id.replace(/-/g, "").toLowerCase();
  const millisecondsHex = normalized.slice(0, 12);
  const timestamp = Number.parseInt(millisecondsHex, 16);
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year");
  const month = lookup.get("month");
  const day = lookup.get("day");
  if (!year || !month || !day) {
    throw new Error("failed to resolve directory segments from UUID");
  }
  return join(root, "items", year, month, day, `${id}.md`);
};

const sampleItemSnapshot = () => ({
  id: "019965a7-2789-740a-b8c1-1415904fd108",
  title: "Sample",
  icon: "note",
  status: "open",
  placement: "2024-09-20",
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
      const repository = createFileSystemItemRepository({ root, timezone });
      const item = unwrapOk(parseItem(sampleItemSnapshot()), "parse item");

      unwrapOk(await repository.save(item), "save item");

      const itemId = item.data.id.toString();
      const itemFilePath = filePathForId(root, itemId);
      const edgesDirectory = join(root, ".index", "graph", "parents", itemId);
      const edgeFile = join(edgesDirectory, "019965a7-2789-740a-b8c1-1415904fd109.edge.json");

      // Verify .md file exists
      const itemInfo = await Deno.stat(itemFilePath);
      assert(itemInfo.isFile, "item file should exist");

      // Read and verify file content (frontmatter + body)
      const content = await Deno.readTextFile(itemFilePath);

      // Verify frontmatter structure
      assert(content.startsWith("---\n"), "file should start with frontmatter delimiter");
      assert(content.includes("\n---\n"), "frontmatter should be closed");

      // Parse frontmatter
      const frontmatterEnd = content.indexOf("\n---\n", 4);
      const yamlContent = content.slice(4, frontmatterEnd);
      assert(yamlContent.includes(`id: ${itemId}`), "frontmatter should contain id");
      // YAML may quote date strings, so check for either quoted or unquoted format
      assert(
        yamlContent.includes("placement: 2024-09-20") ||
          yamlContent.includes("placement: '2024-09-20'"),
        "frontmatter should contain placement",
      );
      assert(yamlContent.includes("rank: a1"), "frontmatter should contain rank");
      assert(yamlContent.includes("icon: note"), "frontmatter should contain icon");
      assert(
        yamlContent.includes("schema: mm.item.frontmatter/3"),
        "frontmatter should contain schema",
      );

      // Verify body content
      const bodyStart = frontmatterEnd + 5;
      const bodyContent = content.slice(bodyStart).trim();
      assertEquals(bodyContent, "# Sample\n\nSample body", "body should contain title and content");

      // Verify edge files
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

      // Verify load functionality
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
      const repository = createFileSystemItemRepository({ root, timezone });
      const item = unwrapOk(parseItem(sampleItemSnapshot()), "parse item");
      unwrapOk(await repository.save(item), "save item");

      unwrapOk(await repository.delete(item.data.id), "delete item");

      const loadResult = await repository.load(item.data.id);
      if (loadResult.type !== "ok" || loadResult.value !== undefined) {
        throw new Error("expected item to be deleted");
      }

      const itemId = item.data.id.toString();
      const itemFilePath = filePathForId(root, itemId);

      await assertRejects(() => Deno.stat(itemFilePath), Deno.errors.NotFound);
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
      const repository = createFileSystemItemRepository({ root, timezone });
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
