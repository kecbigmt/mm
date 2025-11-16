import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { queryEdgeReferences } from "./graph_index.ts";
import { createDateRange, createSingleRange } from "../../domain/primitives/placement_range.ts";
import { createDatePlacement, createItemPlacement } from "../../domain/primitives/placement.ts";
import { parseCalendarDay } from "../../domain/primitives/calendar_day.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { parseItemRank } from "../../domain/primitives/item_rank.ts";

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
  name: "graph_index: queryEdgeReferences returns empty for non-existent date",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-graph-" });
    try {
      const date = unwrapOk(parseCalendarDay("2024-09-20"), "parse date");
      const placement = createDatePlacement(date, []);
      const range = createSingleRange(placement);

      const result = await queryEdgeReferences(root, range);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 0);
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "graph_index: queryEdgeReferences reads date placement edges",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-graph-" });
    try {
      const date = unwrapOk(parseCalendarDay("2024-09-20"), "parse date");
      const itemId = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd108"), "parse id");
      const rank = unwrapOk(parseItemRank("a1"), "parse rank");

      // Create edge file manually
      const edgeDir = join(root, ".index", "graph", "dates", "2024-09-20");
      await Deno.mkdir(edgeDir, { recursive: true });
      const edgeFile = join(edgeDir, `${itemId.toString()}.edge.json`);
      const edgeContent = JSON.stringify(
        {
          schema: "mm.edge/1",
          rank: rank.toString(),
        },
        null,
        2,
      );
      await Deno.writeTextFile(edgeFile, `${edgeContent}\n`);

      const placement = createDatePlacement(date, []);
      const range = createSingleRange(placement);

      const result = await queryEdgeReferences(root, range);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 1);
        assertEquals(result.value[0].itemId.toString(), itemId.toString());
        assertEquals(result.value[0].rank.toString(), rank.toString());
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "graph_index: queryEdgeReferences reads parent placement edges",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-graph-" });
    try {
      const parentId = unwrapOk(
        parseItemId("019965a7-2789-740a-b8c1-1415904fd100"),
        "parse parent id",
      );
      const childId = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd108"), "parse id");
      const rank = unwrapOk(parseItemRank("a1"), "parse rank");

      // Create edge file manually
      const edgeDir = join(root, ".index", "graph", "parents", parentId.toString());
      await Deno.mkdir(edgeDir, { recursive: true });
      const edgeFile = join(edgeDir, `${childId.toString()}.edge.json`);
      const edgeContent = JSON.stringify(
        {
          schema: "mm.edge/1",
          from: parentId.toString(),
          to: childId.toString(),
          rank: rank.toString(),
        },
        null,
        2,
      );
      await Deno.writeTextFile(edgeFile, `${edgeContent}\n`);

      const placement = createItemPlacement(parentId, []);
      const range = createSingleRange(placement);

      const result = await queryEdgeReferences(root, range);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 1);
        assertEquals(result.value[0].itemId.toString(), childId.toString());
        assertEquals(result.value[0].rank.toString(), rank.toString());
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "graph_index: queryEdgeReferences handles date range",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-graph-" });
    try {
      const date1 = unwrapOk(parseCalendarDay("2024-09-20"), "parse date1");
      const date2 = unwrapOk(parseCalendarDay("2024-09-21"), "parse date2");
      const itemId1 = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd108"), "parse id1");
      const itemId2 = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd109"), "parse id2");
      const rank = unwrapOk(parseItemRank("a1"), "parse rank");

      // Create edge files for two dates
      for (const [date, itemId] of [[date1, itemId1], [date2, itemId2]]) {
        const edgeDir = join(root, ".index", "graph", "dates", date.toString());
        await Deno.mkdir(edgeDir, { recursive: true });
        const edgeFile = join(edgeDir, `${itemId.toString()}.edge.json`);
        const edgeContent = JSON.stringify(
          {
            schema: "mm.edge/1",
            rank: rank.toString(),
          },
          null,
          2,
        );
        await Deno.writeTextFile(edgeFile, `${edgeContent}\n`);
      }

      const range = createDateRange(date1, date2);

      const result = await queryEdgeReferences(root, range);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 2);
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
