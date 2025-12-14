import { assertEquals } from "@std/assert";
import { RemoveItemWorkflow } from "./remove_item.ts";
import { createItem } from "../models/item.ts";
import { createItemIcon, dateTimeFromDate, itemStatusOpen } from "../primitives/mod.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { parseAliasSlug } from "../primitives/alias_slug.ts";
import { createAlias } from "../models/alias.ts";
import { Result } from "../../shared/result.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";

const createAliasRepository = (): InMemoryAliasRepository => new InMemoryAliasRepository();

async function createTestItem(id: string, alias?: string) {
  // Use actual UUID v7 format for testing
  const validId = id.length < 36 ? `0193d6c0-${id.padStart(4, "0")}-7000-8000-000000000000` : id;
  const itemId = Result.unwrap(itemIdFromString(validId));
  const title = Result.unwrap(itemTitleFromString("Test Item"));
  const { parsePlacement } = await import("../primitives/placement.ts");
  const icon = createItemIcon("note");
  const itemStatus = itemStatusOpen();
  const rank = Result.unwrap(itemRankFromString("a0"));
  const placement = Result.unwrap(parsePlacement("2024-01-01"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  return createItem({
    id: itemId,
    title,
    icon,
    status: itemStatus,
    placement,
    rank,
    createdAt: now,
    updatedAt: now,
    alias: alias ? Result.unwrap(parseAliasSlug(alias)) : undefined,
  });
}

Deno.test("RemoveItemWorkflow - remove single item by ID", async () => {
  const repository = new InMemoryItemRepository();
  const item = await createTestItem("0001");
  repository.set(item);

  const result = await RemoveItemWorkflow.execute({
    itemIds: [item.data.id.toString()],
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.id.toString(), item.data.id.toString());

    // Verify item was deleted from repository
    const loadResult = await repository.load(item.data.id);
    assertEquals(loadResult.type, "ok");
    if (loadResult.type === "ok") {
      assertEquals(loadResult.value, undefined);
    }
  }
});

Deno.test("RemoveItemWorkflow - remove single item by alias", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = createAliasRepository();
  const item = await createTestItem("0002", "meeting");
  itemRepository.set(item);

  const aliasSlug = Result.unwrap(parseAliasSlug("meeting"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const alias = createAlias({
    slug: aliasSlug,
    itemId: item.data.id,
    createdAt: now,
  });
  aliasRepository.set(alias);

  const result = await RemoveItemWorkflow.execute({
    itemIds: ["meeting"],
  }, {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.id.toString(), item.data.id.toString());

    // Verify item was deleted
    const loadResult = await itemRepository.load(item.data.id);
    assertEquals(loadResult.type, "ok");
    if (loadResult.type === "ok") {
      assertEquals(loadResult.value, undefined);
    }
  }
});

Deno.test("RemoveItemWorkflow - remove multiple items", async () => {
  const repository = new InMemoryItemRepository();
  const item1 = await createTestItem("0003");
  const item2 = await createTestItem("0004");
  repository.set(item1);
  repository.set(item2);

  const result = await RemoveItemWorkflow.execute({
    itemIds: [item1.data.id.toString(), item2.data.id.toString()],
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 2);
    assertEquals(result.value.failed.length, 0);

    // Verify both items were deleted
    const load1 = await repository.load(item1.data.id);
    const load2 = await repository.load(item2.data.id);
    assertEquals(load1.type, "ok");
    assertEquals(load2.type, "ok");
    if (load1.type === "ok" && load2.type === "ok") {
      assertEquals(load1.value, undefined);
      assertEquals(load2.value, undefined);
    }
  }
});

Deno.test("RemoveItemWorkflow - mixed IDs and aliases", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = createAliasRepository();
  const item1 = await createTestItem("0005", "task-1");
  const item2 = await createTestItem("0006");
  itemRepository.set(item1);
  itemRepository.set(item2);

  const aliasSlug = Result.unwrap(parseAliasSlug("task-1"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const alias = createAlias({
    slug: aliasSlug,
    itemId: item1.data.id,
    createdAt: now,
  });
  aliasRepository.set(alias);

  const result = await RemoveItemWorkflow.execute({
    itemIds: ["task-1", item2.data.id.toString()],
  }, {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 2);
    assertEquals(result.value.failed.length, 0);
  }
});

Deno.test("RemoveItemWorkflow - partial failure", async () => {
  const repository = new InMemoryItemRepository();
  const item1 = await createTestItem("0007");
  repository.set(item1);
  // Second item doesn't exist

  const nonExistentId = "0193d6c0-9999-7000-8000-000000000000";

  const result = await RemoveItemWorkflow.execute({
    itemIds: [item1.data.id.toString(), nonExistentId],
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 1);
    assertEquals(result.value.succeeded[0].data.id.toString(), item1.data.id.toString());
    assertEquals(result.value.failed[0].itemId, nonExistentId);
  }
});

Deno.test("RemoveItemWorkflow - empty item list", async () => {
  const repository = new InMemoryItemRepository();

  const result = await RemoveItemWorkflow.execute({
    itemIds: [],
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
  }
});

Deno.test("RemoveItemWorkflow - item not found", async () => {
  const repository = new InMemoryItemRepository();
  const nonExistentId = "0193d6c0-8888-7000-8000-000000000000";

  const result = await RemoveItemWorkflow.execute({
    itemIds: [nonExistentId],
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 0);
    assertEquals(result.value.failed.length, 1);
    assertEquals(result.value.failed[0].itemId, nonExistentId);
  }
});
