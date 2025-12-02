import { assertEquals } from "@std/assert";
import { SnoozeItemWorkflow } from "./snooze_item.ts";
import { parseItem } from "../models/item.ts";
import { Result } from "../../shared/result.ts";
import {
  dateTimeFromDate,
  parseDateTime,
  parseItemId,
  timezoneIdentifierFromString,
} from "../primitives/mod.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createTestItem = async (
  itemRepository: InMemoryItemRepository,
  overrides: Partial<Parameters<typeof parseItem>[0]> = {},
) => {
  const snapshot = {
    id: "01936d9a-0000-7000-8000-000000000001",
    title: "Test Item",
    icon: "note",
    status: "open",
    placement: "2025-12-02",
    rank: "a",
    createdAt: "2025-12-02T09:00:00Z",
    updatedAt: "2025-12-02T09:00:00Z",
    ...overrides,
  };
  const item = Result.unwrap(parseItem(snapshot));
  await itemRepository.save(item);
  return item;
};

Deno.test("SnoozeItemWorkflow: snoozes item with default duration (8h)", async () => {
  const itemRepository = new InMemoryItemRepository();

  const item = await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000001",
  });

  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));
  const itemId = Result.unwrap(parseItemId(item.data.id.toString()));

  const result = await SnoozeItemWorkflow.execute({
    itemId,
    snoozeUntil: undefined, // default 8h
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, {
    itemRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const snoozedItem = result.value.item;
    // Should be snoozed until 18:00 (10:00 + 8h)
    assertEquals(snoozedItem.data.snoozeUntil?.toString(), "2025-12-02T18:00:00.000Z");
    // Placement should remain 2025-12-02 (snoozeUntil is same day)
    assertEquals(snoozedItem.data.placement.toString(), "2025-12-02");
  }
});

Deno.test("SnoozeItemWorkflow: snoozes item to tomorrow and moves placement", async () => {
  const itemRepository = new InMemoryItemRepository();

  const item = await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000002",
  });

  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));
  const itemId = Result.unwrap(parseItemId(item.data.id.toString()));
  const snoozeUntil = Result.unwrap(parseDateTime("2025-12-03T00:00:00Z")); // tomorrow 00:00

  const result = await SnoozeItemWorkflow.execute({
    itemId,
    snoozeUntil,
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, {
    itemRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const snoozedItem = result.value.item;
    // Should be snoozed until tomorrow 00:00
    assertEquals(snoozedItem.data.snoozeUntil?.toString(), "2025-12-03T00:00:00.000Z");
    // Placement should be moved to 2025-12-03
    assertEquals(snoozedItem.data.placement.toString(), "2025-12-03");
  }
});

Deno.test("SnoozeItemWorkflow: unsnoozes item when clear flag is true", async () => {
  const itemRepository = new InMemoryItemRepository();

  const item = await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000003",
    snoozeUntil: "2025-12-02T18:00:00Z",
  });

  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));
  const itemId = Result.unwrap(parseItemId(item.data.id.toString()));

  const result = await SnoozeItemWorkflow.execute({
    itemId,
    snoozeUntil: undefined,
    clear: true, // clear flag means unsnooze
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, {
    itemRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const unsnoozedItem = result.value.item;
    // Should be unsnoozed
    assertEquals(unsnoozedItem.data.snoozeUntil, undefined);
  }
});
