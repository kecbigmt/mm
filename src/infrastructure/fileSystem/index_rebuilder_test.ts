import { assertEquals } from "@std/assert";
import { rebuildFromItems } from "./index_rebuilder.ts";
import { createItem, ItemData } from "../../domain/models/item.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { parseItemRank } from "../../domain/primitives/item_rank.ts";
import { parseDirectory } from "../../domain/primitives/directory.ts";
import { parseDateTime } from "../../domain/primitives/date_time.ts";
import { parseItemTitle } from "../../domain/primitives/item_title.ts";
import { parseItemIcon } from "../../domain/primitives/item_icon.ts";
import { itemStatusOpen } from "../../domain/primitives/item_status.ts";
import { parseAliasSlug } from "../../domain/primitives/alias_slug.ts";
import { Result } from "../../shared/result.ts";

// Helper to create a test item
const createTestItem = (
  id: string,
  directory: string,
  rank: string,
  options: { alias?: string; createdAt?: string } = {},
) => {
  const itemId = Result.unwrap(parseItemId(id));
  const itemDirectory = Result.unwrap(parseDirectory(directory));
  const itemRank = Result.unwrap(parseItemRank(rank));
  const createdAt = Result.unwrap(parseDateTime(options.createdAt ?? "2025-01-15T10:00:00Z"));
  const title = Result.unwrap(parseItemTitle("Test Item"));
  const icon = Result.unwrap(parseItemIcon("note"));
  const alias = options.alias ? Result.unwrap(parseAliasSlug(options.alias)) : undefined;

  const data: ItemData = {
    id: itemId,
    title,
    icon,
    status: itemStatusOpen(),
    directory: itemDirectory,
    rank: itemRank,
    createdAt,
    updatedAt: createdAt,
    alias,
  };

  return createItem(data);
};

Deno.test("rebuildFromItems - empty items array returns empty result", async () => {
  const result = await rebuildFromItems([]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.itemsProcessed, 0);
    assertEquals(result.value.edgesCreated, 0);
    assertEquals(result.value.aliasesCreated, 0);
    assertEquals(result.value.graphEdges.size, 0);
    assertEquals(result.value.aliases.size, 0);
  }
});

Deno.test("rebuildFromItems - single item with date directory", async () => {
  const item = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "2025-01-15",
    "aaa",
  );

  const result = await rebuildFromItems([item]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.itemsProcessed, 1);
    assertEquals(result.value.edgesCreated, 1);
    assertEquals(result.value.aliasesCreated, 0);

    // Check graph edges
    const edges = result.value.graphEdges.get("dates/2025-01-15");
    assertEquals(edges?.length, 1);
    assertEquals(edges?.[0].itemId.toString(), "019a85fc-67c4-7a54-be8e-305bae009f9e");
    assertEquals(edges?.[0].rank.toString(), "aaa");
  }
});

Deno.test("rebuildFromItems - single item with date section directory", async () => {
  const item = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "2025-01-15/1/3",
    "aaa",
  );

  const result = await rebuildFromItems([item]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const edges = result.value.graphEdges.get("dates/2025-01-15/1/3");
    assertEquals(edges?.length, 1);
    assertEquals(edges?.[0].itemId.toString(), "019a85fc-67c4-7a54-be8e-305bae009f9e");
  }
});

Deno.test("rebuildFromItems - single item with parent directory", async () => {
  const item = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "019a8603-1234-7890-abcd-1234567890ab",
    "aaa",
  );

  const result = await rebuildFromItems([item]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const edges = result.value.graphEdges.get("parents/019a8603-1234-7890-abcd-1234567890ab");
    assertEquals(edges?.length, 1);
    assertEquals(edges?.[0].itemId.toString(), "019a85fc-67c4-7a54-be8e-305bae009f9e");
  }
});

Deno.test("rebuildFromItems - single item with parent section directory", async () => {
  const item = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "019a8603-1234-7890-abcd-1234567890ab/1/2",
    "aaa",
  );

  const result = await rebuildFromItems([item]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const edges = result.value.graphEdges.get(
      "parents/019a8603-1234-7890-abcd-1234567890ab/1/2",
    );
    assertEquals(edges?.length, 1);
    assertEquals(edges?.[0].itemId.toString(), "019a85fc-67c4-7a54-be8e-305bae009f9e");
  }
});

Deno.test("rebuildFromItems - multiple items sorted by rank", async () => {
  const item1 = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "2025-01-15",
    "ccc",
  );
  const item2 = createTestItem(
    "019a8603-1234-7890-abcd-1234567890ab",
    "2025-01-15",
    "aaa",
  );
  const item3 = createTestItem(
    "019a8610-5678-7890-abcd-0987654321ab",
    "2025-01-15",
    "bbb",
  );

  const result = await rebuildFromItems([item1, item2, item3]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.edgesCreated, 3);

    const edges = result.value.graphEdges.get("dates/2025-01-15");
    assertEquals(edges?.length, 3);
    // Should be sorted by rank: aaa, bbb, ccc
    assertEquals(edges?.[0].rank.toString(), "aaa");
    assertEquals(edges?.[1].rank.toString(), "bbb");
    assertEquals(edges?.[2].rank.toString(), "ccc");
  }
});

Deno.test("rebuildFromItems - item with alias", async () => {
  const item = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "2025-01-15",
    "aaa",
    { alias: "my-alias" },
  );

  const result = await rebuildFromItems([item]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.aliasesCreated, 1);
    assertEquals(result.value.aliases.size, 1);

    // Find the alias entry
    const [aliasPath, aliasSnapshot] = [...result.value.aliases.entries()][0];
    assertEquals(aliasSnapshot.raw, "my-alias");
    assertEquals(aliasSnapshot.canonicalKey, "my-alias");
    assertEquals(aliasSnapshot.itemId, "019a85fc-67c4-7a54-be8e-305bae009f9e");

    // Check path format: "xx/<64-char-sha256-hash>"
    const parts = aliasPath.split("/");
    assertEquals(parts.length, 2);
    assertEquals(parts[0].length, 2);
    assertEquals(parts[1].length, 64);
  }
});

Deno.test("rebuildFromItems - multiple items with mixed directories", async () => {
  const item1 = createTestItem(
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "2025-01-15",
    "aaa",
  );
  const item2 = createTestItem(
    "019a8603-1234-7890-abcd-1234567890ab",
    "2025-01-16",
    "bbb",
  );
  const item3 = createTestItem(
    "019a8610-5678-7890-abcd-0987654321ab",
    "019a85fc-67c4-7a54-be8e-305bae009f9e",
    "ccc",
  );

  const result = await rebuildFromItems([item1, item2, item3]);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.graphEdges.size, 3);
    assertEquals(result.value.graphEdges.has("dates/2025-01-15"), true);
    assertEquals(result.value.graphEdges.has("dates/2025-01-16"), true);
    assertEquals(
      result.value.graphEdges.has("parents/019a85fc-67c4-7a54-be8e-305bae009f9e"),
      true,
    );
  }
});
