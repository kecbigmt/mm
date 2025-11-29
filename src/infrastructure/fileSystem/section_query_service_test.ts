import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemSectionQueryService } from "./section_query_service.ts";
import { createDatePlacement, createItemPlacement } from "../../domain/primitives/placement.ts";
import { parseCalendarDay } from "../../domain/primitives/calendar_day.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { Result } from "../../shared/result.ts";

const unwrapOk = <T, E>(result: Result<T, E>, context: string): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result)}`);
  }
  return result.value;
};

const withTempWorkspace = async (
  fn: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await Deno.makeTempDir({ prefix: "mm-section-query-test-" });
  try {
    await fn(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
};

const writeEdgeFile = async (path: string, data: Record<string, unknown>): Promise<void> => {
  await Deno.mkdir(join(path, ".."), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(data));
};

Deno.test({
  name: "SectionQueryService.listSections returns empty array for non-existent directory",
  permissions: { read: true, write: true },
  async fn() {
    await withTempWorkspace(async (root) => {
      const service = createFileSystemSectionQueryService({ root });
      const date = unwrapOk(parseCalendarDay("2025-01-15"), "parse date");
      const placement = createDatePlacement(date, []);

      const result = await service.listSections(placement);
      const summaries = unwrapOk(result, "list sections");

      assertEquals(summaries, []);
    });
  },
});

Deno.test({
  name: "SectionQueryService.listSections returns sections under date head",
  permissions: { read: true, write: true },
  async fn() {
    await withTempWorkspace(async (root) => {
      const graphBase = join(root, ".index", "graph", "dates", "2025-01-15");

      await Deno.mkdir(join(graphBase, "1"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "1", "019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json"),
        { rank: "aaa" },
      );

      await Deno.mkdir(join(graphBase, "2"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "2", "019a85fc-67c4-7a54-be8e-305bae009f9f.edge.json"),
        { rank: "bbb" },
      );
      await Deno.mkdir(join(graphBase, "2", "1"), { recursive: true });

      const service = createFileSystemSectionQueryService({ root });
      const date = unwrapOk(parseCalendarDay("2025-01-15"), "parse date");
      const placement = createDatePlacement(date, []);

      const result = await service.listSections(placement);
      const summaries = unwrapOk(result, "list sections");

      assertEquals(summaries.length, 2);

      assertEquals(summaries[0].placement.section, [1]);
      assertEquals(summaries[0].itemCount, 1);
      assertEquals(summaries[0].sectionCount, 0);

      assertEquals(summaries[1].placement.section, [2]);
      assertEquals(summaries[1].itemCount, 1);
      assertEquals(summaries[1].sectionCount, 1);
    });
  },
});

Deno.test({
  name: "SectionQueryService.listSections returns sections under item head",
  permissions: { read: true, write: true },
  async fn() {
    await withTempWorkspace(async (root) => {
      const parentId = "019a85fc-67c4-7a54-be8e-305bae009f9a";
      const graphBase = join(root, ".index", "graph", "parents", parentId);

      await Deno.mkdir(join(graphBase, "1"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "1", "child-1.edge.json"),
        { from: parentId, to: "019a85fc-67c4-7a54-be8e-305bae009f9b", rank: "aaa" },
      );

      const service = createFileSystemSectionQueryService({ root });
      const itemId = unwrapOk(parseItemId(parentId), "parse item id");
      const placement = createItemPlacement(itemId, []);

      const result = await service.listSections(placement);
      const summaries = unwrapOk(result, "list sections");

      assertEquals(summaries.length, 1);
      assertEquals(summaries[0].placement.section, [1]);
      assertEquals(summaries[0].itemCount, 1);
      assertEquals(summaries[0].sectionCount, 0);
    });
  },
});

Deno.test({
  name: "SectionQueryService.listSections omits empty sections",
  permissions: { read: true, write: true },
  async fn() {
    await withTempWorkspace(async (root) => {
      const graphBase = join(root, ".index", "graph", "dates", "2025-01-15");

      await Deno.mkdir(join(graphBase, "1"), { recursive: true });

      const service = createFileSystemSectionQueryService({ root });
      const date = unwrapOk(parseCalendarDay("2025-01-15"), "parse date");
      const placement = createDatePlacement(date, []);

      const result = await service.listSections(placement);
      const summaries = unwrapOk(result, "list sections");

      assertEquals(summaries, []);
    });
  },
});

Deno.test({
  name: "SectionQueryService.listSections returns sections sorted by section number",
  permissions: { read: true, write: true },
  async fn() {
    await withTempWorkspace(async (root) => {
      const graphBase = join(root, ".index", "graph", "dates", "2025-01-15");

      await Deno.mkdir(join(graphBase, "10"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "10", "item-a.edge.json"),
        { rank: "aaa" },
      );

      await Deno.mkdir(join(graphBase, "2"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "2", "item-b.edge.json"),
        { rank: "bbb" },
      );

      await Deno.mkdir(join(graphBase, "5"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "5", "item-c.edge.json"),
        { rank: "ccc" },
      );

      const service = createFileSystemSectionQueryService({ root });
      const date = unwrapOk(parseCalendarDay("2025-01-15"), "parse date");
      const placement = createDatePlacement(date, []);

      const result = await service.listSections(placement);
      const summaries = unwrapOk(result, "list sections");

      assertEquals(summaries.length, 3);
      assertEquals(summaries[0].placement.section, [2]);
      assertEquals(summaries[1].placement.section, [5]);
      assertEquals(summaries[2].placement.section, [10]);
    });
  },
});

Deno.test({
  name: "SectionQueryService.listSections works for nested sections",
  permissions: { read: true, write: true },
  async fn() {
    await withTempWorkspace(async (root) => {
      const graphBase = join(root, ".index", "graph", "dates", "2025-01-15", "1");

      await Deno.mkdir(join(graphBase, "2"), { recursive: true });
      await writeEdgeFile(
        join(graphBase, "2", "item-a.edge.json"),
        { rank: "aaa" },
      );

      const service = createFileSystemSectionQueryService({ root });
      const date = unwrapOk(parseCalendarDay("2025-01-15"), "parse date");
      const placement = createDatePlacement(date, [1]);

      const result = await service.listSections(placement);
      const summaries = unwrapOk(result, "list sections");

      assertEquals(summaries.length, 1);
      assertEquals(summaries[0].placement.section, [1, 2]);
      assertEquals(summaries[0].itemCount, 1);
    });
  },
});
