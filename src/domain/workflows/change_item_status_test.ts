import { assertEquals } from "@std/assert";
import { ChangeItemStatusWorkflow } from "./change_item_status.ts";
import { createItem } from "../models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemStatusClosed,
  itemStatusOpen,
  parseSectionPath,
} from "../primitives/mod.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { Result } from "../../shared/result.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { Item } from "../models/item.ts";
import { ItemId } from "../primitives/item_id.ts";
import { ItemShortId } from "../primitives/item_short_id.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AmbiguousShortIdError } from "../repositories/short_id_resolution_error.ts";
import { createRootPlacement } from "../models/placement.ts";

// Mock ItemRepository for testing
class MockItemRepository implements ItemRepository {
  private items = new Map<string, Item>();

  load(id: ItemId): Promise<Result<Item | undefined, RepositoryError>> {
    const item = this.items.get(id.toString());
    if (!item) {
      return Promise.resolve(Result.ok(undefined));
    }
    return Promise.resolve(Result.ok(item));
  }

  save(item: Item): Promise<Result<void, RepositoryError>> {
    this.items.set(item.data.id.toString(), item);
    return Promise.resolve(Result.ok(undefined));
  }

  delete(id: ItemId): Promise<Result<void, RepositoryError>> {
    this.items.delete(id.toString());
    return Promise.resolve(Result.ok(undefined));
  }

  findByShortId(
    shortId: ItemShortId,
  ): Promise<Result<Item | undefined, RepositoryError | AmbiguousShortIdError>> {
    const shortIdStr = shortId.toString();
    const matchingItems: Item[] = [];

    for (const item of this.items.values()) {
      if (item.data.id.toString().endsWith(shortIdStr)) {
        matchingItems.push(item);
      }
    }

    if (matchingItems.length === 0) {
      return Promise.resolve(Result.ok(undefined));
    }

    if (matchingItems.length > 1) {
      return Promise.resolve(Result.error({
        kind: "ambiguous_short_id",
        shortId: shortIdStr,
        foundCount: matchingItems.length,
        message: `Short ID '${shortIdStr}' is ambiguous: found ${matchingItems.length} items`,
      }));
    }

    return Promise.resolve(Result.ok(matchingItems[0]));
  }

  // Helper method for tests
  setItem(item: Item) {
    this.items.set(item.data.id.toString(), item);
  }
}

function createTestItem(id: string, status: "open" | "closed" = "open") {
  // Use actual UUID v7 format for testing
  const validId = id.length < 36 ? `0193d6c0-${id.padStart(4, "0")}-7000-8000-000000000000` : id;
  const itemId = Result.unwrap(itemIdFromString(validId));
  const title = Result.unwrap(itemTitleFromString("Test Item"));
  const icon = createItemIcon("note");
  const itemStatus = status === "open" ? itemStatusOpen() : itemStatusClosed();
  const rank = Result.unwrap(itemRankFromString("a0"));
  const section = Result.unwrap(parseSectionPath(":2024-01-01"));
  const placement = createRootPlacement(section, rank);
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  return createItem({
    id: itemId,
    title,
    icon,
    status: itemStatus,
    placement,
    createdAt: now,
    updatedAt: now,
    closedAt: status === "closed" ? now : undefined,
  });
}

Deno.test("ChangeItemStatusWorkflow - close single open item", async () => {
  const repository = new MockItemRepository();
  const item = createTestItem("0001", "open");
  repository.setItem(item);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item.data.id.toString()],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isClosed(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - reopen single closed item", async () => {
  const repository = new MockItemRepository();
  const item = createTestItem("0002", "closed");
  repository.setItem(item);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item.data.id.toString()],
    action: "reopen",
    occurredAt: now,
  }, {
    itemRepository: repository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isOpen(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - close multiple items", async () => {
  const repository = new MockItemRepository();
  const item1 = createTestItem("0003", "open");
  const item2 = createTestItem("0004", "open");
  repository.setItem(item1);
  repository.setItem(item2);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item1.data.id.toString(), item2.data.id.toString()],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 2);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isClosed(), true);
    assertEquals(result.value.succeeded[1].data.status.isClosed(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - idempotent close", async () => {
  const repository = new MockItemRepository();
  const item = createTestItem("0005", "closed");
  repository.setItem(item);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item.data.id.toString()],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isClosed(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - partial failure", async () => {
  const repository = new MockItemRepository();
  const item1 = createTestItem("0006", "open");
  repository.setItem(item1);
  // Second item doesn't exist

  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const nonExistentId = "0193d6c0-9999-7000-8000-000000000000";

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item1.data.id.toString(), nonExistentId],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 1);
    assertEquals(result.value.succeeded[0].data.id.toString(), item1.data.id.toString());
    assertEquals(result.value.failed[0].itemId, nonExistentId);
  }
});

Deno.test("ChangeItemStatusWorkflow - empty item list", async () => {
  const repository = new MockItemRepository();
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
  }
});
