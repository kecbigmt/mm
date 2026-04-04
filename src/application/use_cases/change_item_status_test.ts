import { assertEquals } from "@std/assert";
import { changeItemStatus } from "./change_item_status.ts";
import { createItem } from "../../domain/models/item.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusClosed,
  itemStatusOpen,
  itemTitleFromString,
  parseDirectory,
  parseTimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { Result } from "../../shared/result.ts";

const TEST_TIMEZONE = Result.unwrap(parseTimezoneIdentifier("UTC"));

const createDeps = () => ({
  itemRepository: new InMemoryItemRepository(),
  aliasRepository: new InMemoryAliasRepository(),
});

const createTestItem = (idSuffix: string, status: "open" | "closed" = "open") => {
  const id = Result.unwrap(itemIdFromString(`0193d6c0-${idSuffix}-7000-8000-000000000000`));
  const now = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));
  return createItem({
    id,
    title: Result.unwrap(itemTitleFromString("Test Item")),
    icon: createItemIcon("note"),
    status: status === "open" ? itemStatusOpen() : itemStatusClosed(),
    directory: Result.unwrap(parseDirectory("2024-09-20")),
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
    ...(status === "closed" ? { closedAt: now } : {}),
  });
};

Deno.test("changeItemStatus returns structured partial-success DTOs", async () => {
  const deps = createDeps();
  const openItem = createTestItem("0001", "open");
  deps.itemRepository.set(openItem);
  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));
  const missingId = "0193d6c0-9999-7000-8000-000000000000";

  const result = await changeItemStatus({
    itemIds: [openItem.data.id.toString(), missingId],
    action: "close",
    occurredAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.succeeded.length, 1);
  assertEquals(result.value.succeeded[0].status, "closed");
  assertEquals(result.value.failed.length, 1);
  assertEquals(result.value.failed[0].itemId, missingId);
  assertEquals(result.value.failed[0].error.kind, "ValidationError");
});

Deno.test("changeItemStatus returns validation error for empty itemIds", async () => {
  const deps = createDeps();
  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await changeItemStatus({
    itemIds: [],
    action: "close",
    occurredAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
});
