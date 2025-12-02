import { assertEquals } from "@std/assert";
import { ListItemsWorkflow } from "./list_items.ts";
import { parseItem } from "../models/item.ts";
import { Result } from "../../shared/result.ts";
import { parsePlacement, timezoneIdentifierFromString } from "../primitives/mod.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createTestItem = async (
  itemRepository: InMemoryItemRepository,
  overrides: Partial<Parameters<typeof parseItem>[0]> = {},
) => {
  const snapshot = {
    id: `01936d9a-0000-7000-8000-${Math.random().toString().slice(2, 14)}`,
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

Deno.test("ListItemsWorkflow: hides snoozed items by default", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // Create item snoozed until future
  await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000001",
    title: "Snoozed Item",
    snoozeUntil: "2025-12-02T20:00:00Z",
  });

  // Create normal item
  await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000002",
    title: "Normal Item",
  });

  const cwd = Result.unwrap(parsePlacement("2025-12-02"));

  const result = await ListItemsWorkflow.execute({
    cwd,
    timezone: TEST_TIMEZONE,
    today: new Date("2025-12-02T10:00:00Z"),
    status: "open", // default filter
  }, {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should only show the normal item
    assertEquals(result.value.items.length, 1);
    assertEquals(result.value.items[0].data.title.toString(), "Normal Item");
  }
});

Deno.test("ListItemsWorkflow: shows snoozed items with status=all", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // Create item snoozed until future
  await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000003",
    title: "Snoozed Item",
    snoozeUntil: "2025-12-02T20:00:00Z",
  });

  // Create normal item
  await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000004",
    title: "Normal Item",
  });

  const cwd = Result.unwrap(parsePlacement("2025-12-02"));

  const result = await ListItemsWorkflow.execute({
    cwd,
    timezone: TEST_TIMEZONE,
    today: new Date("2025-12-02T10:00:00Z"),
    status: "all", // show all items including snoozed
  }, {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should show both items
    assertEquals(result.value.items.length, 2);
  }
});

Deno.test("ListItemsWorkflow: shows items with past snoozeUntil", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // Create item snoozed until past
  await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000005",
    title: "Past Snooze Item",
    snoozeUntil: "2025-12-02T08:00:00Z", // before current time
  });

  const cwd = Result.unwrap(parsePlacement("2025-12-02"));

  const result = await ListItemsWorkflow.execute({
    cwd,
    timezone: TEST_TIMEZONE,
    today: new Date("2025-12-02T10:00:00Z"),
    status: "open",
  }, {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should show the item since snooze time has passed
    assertEquals(result.value.items.length, 1);
    assertEquals(result.value.items[0].data.title.toString(), "Past Snooze Item");
  }
});

Deno.test("ListItemsWorkflow: shows items with snoozeUntil equal to current time", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // Create item snoozed until exactly now
  await createTestItem(itemRepository, {
    id: "01936d9a-0000-7000-8000-000000000006",
    title: "Snooze Ending Item",
    snoozeUntil: "2025-12-02T10:00:00Z", // exactly current time
  });

  const cwd = Result.unwrap(parsePlacement("2025-12-02"));

  const result = await ListItemsWorkflow.execute({
    cwd,
    timezone: TEST_TIMEZONE,
    today: new Date("2025-12-02T10:00:00Z"),
    status: "open",
  }, {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should show the item since snooze time has arrived
    assertEquals(result.value.items.length, 1);
    assertEquals(result.value.items[0].data.title.toString(), "Snooze Ending Item");
  }
});
