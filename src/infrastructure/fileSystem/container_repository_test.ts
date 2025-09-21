import { assert, assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { createFileSystemContainerRepository } from "./container_repository.ts";
import {
  ContainerEdge,
  createContainerEdge,
  createItemEdge,
  ItemEdge,
} from "../../domain/models/edge.ts";
import {
  parseContainerIndex,
  parseContainerPath,
  parseItemId,
  parseItemRank,
} from "../../domain/primitives/mod.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test({
  name: "container repository ensure creates container",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-container-" });
    try {
      const repository = createFileSystemContainerRepository({ root });
      const path = unwrapOk(parseContainerPath("2024/09/20"), "parse container path");

      const ensureResult = await repository.ensure(path);
      const container = unwrapOk(ensureResult, "ensure container");
      assertEquals(container.kind, "CalendarDay");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "container repository replaces and loads edges",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-container-edges-" });
    try {
      const repository = createFileSystemContainerRepository({ root });
      const path = unwrapOk(parseContainerPath("2024/09/20"), "parse container path");

      unwrapOk(await repository.ensure(path), "ensure container");

      const itemId = unwrapOk(
        parseItemId("019965a7-2789-740a-b8c1-1415904fd108"),
        "parse item id",
      );
      const itemRank = unwrapOk(parseItemRank("a1"), "parse item rank");
      const itemEdge = createItemEdge(itemId, itemRank);

      const childPath = unwrapOk(
        parseContainerPath("019965a7-2789-740a-b8c1-1415904fd108/0001"),
        "parse child container path",
      );
      const containerIndex = unwrapOk(parseContainerIndex(1), "parse container index");
      const containerEdge = createContainerEdge(childPath, containerIndex);

      unwrapOk(await repository.replaceEdges(path, [itemEdge, containerEdge]), "replace edges");

      const loadResult = await repository.load(path);
      const container = unwrapOk(loadResult, "load container");

      assert(container !== undefined, "expected container to be returned");
      assertEquals(container.edges.length, 2);

      const loadedItemEdge = container.edges.find((edge) => edge.kind === "ItemEdge") as
        | ItemEdge
        | undefined;
      assert(loadedItemEdge, "expected item edge to be present");
      assertEquals(loadedItemEdge.data.to.toString(), itemId.toString());
      assertEquals(loadedItemEdge.data.rank.toString(), itemRank.toString());

      const loadedContainerEdge = container.edges.find((edge) => edge.kind === "ContainerEdge") as
        | ContainerEdge
        | undefined;
      assert(loadedContainerEdge, "expected container edge to be present");
      assertEquals(loadedContainerEdge.data.to.toString(), childPath.toString());
      assertEquals(loadedContainerEdge.data.index.value(), containerIndex.value());

      const edgesDirectory = join(root, "nodes", "2024", "09", "20", "edges");
      const edgesDirInfo = await Deno.stat(edgesDirectory);
      assert(edgesDirInfo.isDirectory, "edges directory should exist");

      const edgeFiles: string[] = [];
      for await (const entry of Deno.readDir(edgesDirectory)) {
        if (entry.isFile) {
          edgeFiles.push(entry.name);
        }
      }
      edgeFiles.sort();

      const sanitizedChild = childPath.toString().replace(/[^A-Za-z0-9._-]/g, "_");
      const expectedFiles = [
        `${itemId.toString()}.edge.json`,
        `container-${
          containerIndex.value().toString().padStart(4, "0")
        }-${sanitizedChild}.edge.json`,
      ];
      expectedFiles.sort();
      assertEquals(edgeFiles, expectedFiles);

      const itemEdgeSnapshot = JSON.parse(
        await Deno.readTextFile(join(edgesDirectory, `${itemId.toString()}.edge.json`)),
      );
      assertEquals(itemEdgeSnapshot.schema, "mm.edge/1");
      assertEquals(itemEdgeSnapshot.to, itemId.toString());
      assertEquals(itemEdgeSnapshot.rank, itemRank.toString());

      const containerEdgePath = join(
        edgesDirectory,
        `container-${
          containerIndex.value().toString().padStart(4, "0")
        }-${sanitizedChild}.edge.json`,
      );
      const containerEdgeSnapshot = JSON.parse(await Deno.readTextFile(containerEdgePath));
      assertEquals(containerEdgeSnapshot.schema, "mm.edge/1");
      assertEquals(containerEdgeSnapshot.to, childPath.toString());
      assertEquals(containerEdgeSnapshot.index, containerIndex.value());
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "container repository returns undefined for missing container",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-container-missing-" });
    try {
      const repository = createFileSystemContainerRepository({ root });
      const path = unwrapOk(parseContainerPath("2030/01/01"), "parse container path");

      const loadResult = await repository.load(path);
      assert(loadResult.type === "ok");
      assertEquals(loadResult.value, undefined);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
