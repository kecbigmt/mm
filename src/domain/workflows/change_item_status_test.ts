import { assertEquals } from "@std/assert";
import { ChangeItemStatusWorkflow } from "./change_item_status.ts";
import { createItem } from "../models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemStatusClosed,
  itemStatusOpen,
  parsePath,
} from "../primitives/mod.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { Result } from "../../shared/result.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";

const createAliasRepository = (): InMemoryAliasRepository => new InMemoryAliasRepository();

function createTestItem(id: string, status: "open" | "closed" = "open") {
  // Use actual UUID v7 format for testing
  const validId = id.length < 36 ? `0193d6c0-${id.padStart(4, "0")}-7000-8000-000000000000` : id;
  const itemId = Result.unwrap(itemIdFromString(validId));
  const title = Result.unwrap(itemTitleFromString("Test Item"));
  const icon = createItemIcon("note");
  const itemStatus = status === "open" ? itemStatusOpen() : itemStatusClosed();
  const rank = Result.unwrap(itemRankFromString("a0"));
  const path = Result.unwrap(parsePath("/2024-01-01"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  return createItem({
    id: itemId,
    title,
    icon,
    status: itemStatus,
    path,
    rank,
    createdAt: now,
    updatedAt: now,
    closedAt: status === "closed" ? now : undefined,
  });
}

Deno.test("ChangeItemStatusWorkflow - close single open item", async () => {
  const repository = new InMemoryItemRepository();
  const item = createTestItem("0001", "open");
  repository.set(item);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item.data.id.toString()],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isClosed(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - reopen single closed item", async () => {
  const repository = new InMemoryItemRepository();
  const item = createTestItem("0002", "closed");
  repository.set(item);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item.data.id.toString()],
    action: "reopen",
    occurredAt: now,
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isOpen(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - close multiple items", async () => {
  const repository = new InMemoryItemRepository();
  const item1 = createTestItem("0003", "open");
  const item2 = createTestItem("0004", "open");
  repository.set(item1);
  repository.set(item2);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item1.data.id.toString(), item2.data.id.toString()],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
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
  const repository = new InMemoryItemRepository();
  const item = createTestItem("0005", "closed");
  repository.set(item);

  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item.data.id.toString()],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.succeeded.length, 1);
    assertEquals(result.value.failed.length, 0);
    assertEquals(result.value.succeeded[0].data.status.isClosed(), true);
  }
});

Deno.test("ChangeItemStatusWorkflow - partial failure", async () => {
  const repository = new InMemoryItemRepository();
  const item1 = createTestItem("0006", "open");
  repository.set(item1);
  // Second item doesn't exist

  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const nonExistentId = "0193d6c0-9999-7000-8000-000000000000";

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [item1.data.id.toString(), nonExistentId],
    action: "close",
    occurredAt: now,
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

Deno.test("ChangeItemStatusWorkflow - empty item list", async () => {
  const repository = new InMemoryItemRepository();
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const result = await ChangeItemStatusWorkflow.execute({
    itemIds: [],
    action: "close",
    occurredAt: now,
  }, {
    itemRepository: repository,
    aliasRepository: createAliasRepository(),
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
  }
});
