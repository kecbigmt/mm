import { join } from "@std/path";
import { generate as generateUuidV7 } from "@std/uuid/unstable-v7";
import { queryEdgeReferences } from "./graph_index.ts";
import { createDateRange, createSingleRange } from "../../domain/primitives/placement_range.ts";
import { createDatePlacement, createItemPlacement } from "../../domain/primitives/placement.ts";
import { parseCalendarDay } from "../../domain/primitives/calendar_day.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { parseItemRank } from "../../domain/primitives/item_rank.ts";

/**
 * Benchmark suite for graph index query performance
 *
 * These benchmarks measure the performance of edge-based placement queries.
 *
 * Run with: deno bench --allow-read --allow-write src/infrastructure/fileSystem/graph_index_bench.ts
 */

const setupWorkspace = async (itemCount: number) => {
  const root = await Deno.makeTempDir({ prefix: "mm-bench-" });
  const edgeDir = join(root, ".index", "graph", "dates", "2025-01-15");
  await Deno.mkdir(edgeDir, { recursive: true });

  // Create edge files for benchmark
  for (let i = 0; i < itemCount; i++) {
    const itemId = generateUuidV7();
    const rank = `a${i.toString().padStart(4, "0")}`;
    const edgeFile = join(edgeDir, `${itemId}.edge.json`);
    const edgeContent = JSON.stringify(
      {
        schema: "mm.edge/1",
        rank,
      },
      null,
      2,
    );
    await Deno.writeTextFile(edgeFile, `${edgeContent}\n`);
  }

  return root;
};

const cleanup = async (root: string) => {
  try {
    await Deno.remove(root, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
};

// Baseline: Single date placement with small result set
Deno.bench({
  name: "queryEdgeReferences - single date, 10 items",
  group: "single-date",
  baseline: true,
  permissions: { read: true, write: true },
  async fn(b) {
    const root = await setupWorkspace(10);
    const date = parseCalendarDay("2025-01-15");
    if (date.type === "error") throw new Error("Invalid date");
    const placement = createDatePlacement(date.value, []);
    const range = createSingleRange(placement);

    b.start();
    const result = await queryEdgeReferences(root, range);
    b.end();

    if (result.type === "error") {
      throw new Error(`Query failed: ${JSON.stringify(result.error)}`);
    }
    await cleanup(root);
  },
});

// Scale test: 100 items
Deno.bench({
  name: "queryEdgeReferences - single date, 100 items",
  group: "single-date",
  permissions: { read: true, write: true },
  async fn(b) {
    const root = await setupWorkspace(100);
    const date = parseCalendarDay("2025-01-15");
    if (date.type === "error") throw new Error("Invalid date");
    const placement = createDatePlacement(date.value, []);
    const range = createSingleRange(placement);

    b.start();
    const result = await queryEdgeReferences(root, range);
    b.end();

    if (result.type === "error") {
      throw new Error(`Query failed: ${JSON.stringify(result.error)}`);
    }
    await cleanup(root);
  },
});

// Scale test: 1000 items
Deno.bench({
  name: "queryEdgeReferences - single date, 1000 items",
  group: "single-date",
  permissions: { read: true, write: true },
  async fn(b) {
    const root = await setupWorkspace(1000);
    const date = parseCalendarDay("2025-01-15");
    if (date.type === "error") throw new Error("Invalid date");
    const placement = createDatePlacement(date.value, []);
    const range = createSingleRange(placement);

    b.start();
    const result = await queryEdgeReferences(root, range);
    b.end();

    if (result.type === "error") {
      throw new Error(`Query failed: ${JSON.stringify(result.error)}`);
    }
    await cleanup(root);
  },
});

// Date range query
Deno.bench({
  name: "queryEdgeReferences - date range (7 days, 70 items total)",
  group: "date-range",
  permissions: { read: true, write: true },
  async fn(b) {
    const root = await Deno.makeTempDir({ prefix: "mm-bench-" });

    // Create items across 7 days (10 items per day)
    for (let day = 15; day <= 21; day++) {
      const dateStr = `2025-01-${day.toString().padStart(2, "0")}`;
      const edgeDir = join(root, ".index", "graph", "dates", dateStr);
      await Deno.mkdir(edgeDir, { recursive: true });

      for (let i = 0; i < 10; i++) {
        const itemId = generateUuidV7();
        const rank = `a${i.toString().padStart(4, "0")}`;
        const edgeFile = join(edgeDir, `${itemId}.edge.json`);
        const edgeContent = JSON.stringify(
          {
            schema: "mm.edge/1",
            rank,
          },
          null,
          2,
        );
        await Deno.writeTextFile(edgeFile, `${edgeContent}\n`);
      }
    }

    const from = parseCalendarDay("2025-01-15");
    const to = parseCalendarDay("2025-01-21");
    if (from.type === "error" || to.type === "error") throw new Error("Invalid date");
    const range = createDateRange(from.value, to.value);

    b.start();
    const result = await queryEdgeReferences(root, range);
    b.end();

    if (result.type === "error") {
      throw new Error(`Query failed: ${JSON.stringify(result.error)}`);
    }
    await cleanup(root);
  },
});

// Empty result test
Deno.bench({
  name: "queryEdgeReferences - non-existent date (empty result)",
  group: "edge-cases",
  permissions: { read: true, write: true },
  async fn(b) {
    const root = await Deno.makeTempDir({ prefix: "mm-bench-" });
    const date = parseCalendarDay("2025-01-15");
    if (date.type === "error") throw new Error("Invalid date");
    const placement = createDatePlacement(date.value, []);
    const range = createSingleRange(placement);

    b.start();
    const result = await queryEdgeReferences(root, range);
    b.end();

    if (result.type === "error") {
      throw new Error(`Query failed: ${JSON.stringify(result.error)}`);
    }
    await cleanup(root);
  },
});

// Parent placement query
Deno.bench({
  name: "queryEdgeReferences - parent placement, 50 items",
  group: "parent-placement",
  permissions: { read: true, write: true },
  async fn(b) {
    const root = await Deno.makeTempDir({ prefix: "mm-bench-" });
    const parentId = parseItemId("019965a7-2789-740a-b8c1-1415904fd100");
    if (parentId.type === "error") throw new Error("Invalid parent ID");

    const edgeDir = join(root, ".index", "graph", "parents", parentId.value.toString());
    await Deno.mkdir(edgeDir, { recursive: true });

    for (let i = 0; i < 50; i++) {
      const childId = generateUuidV7();
      const rank = parseItemRank(`a${i.toString().padStart(4, "0")}`);
      if (rank.type === "error") throw new Error("Invalid rank");

      const edgeFile = join(edgeDir, `${childId}.edge.json`);
      const edgeContent = JSON.stringify(
        {
          schema: "mm.edge/1",
          from: parentId.value.toString(),
          to: childId,
          rank: rank.value.toString(),
        },
        null,
        2,
      );
      await Deno.writeTextFile(edgeFile, `${edgeContent}\n`);
    }

    const placement = createItemPlacement(parentId.value, []);
    const range = createSingleRange(placement);

    b.start();
    const result = await queryEdgeReferences(root, range);
    b.end();

    if (result.type === "error") {
      throw new Error(`Query failed: ${JSON.stringify(result.error)}`);
    }
    await cleanup(root);
  },
});
