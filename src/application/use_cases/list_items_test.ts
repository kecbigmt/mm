import { assertEquals } from "@std/assert";
import { ListItemDto, listItems } from "./list_items.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { createItem, Item } from "../../domain/models/item.ts";
import { Result } from "../../shared/result.ts";
import {
  createDateDirectory,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusClosed,
  itemStatusOpen,
  itemTitleFromString,
  parseCalendarDay,
  parseTimezoneIdentifier,
} from "../../domain/primitives/mod.ts";

const TODAY = new Date("2025-11-16T00:00:00Z");
const TZ = Result.unwrap(parseTimezoneIdentifier("UTC"));
const NOW = Result.unwrap(dateTimeFromDate(TODAY));
const DAY = Result.unwrap(parseCalendarDay("2025-11-16"));
const DIR = createDateDirectory(DAY, []);

const makeItem = (
  overrides: Partial<{
    id: string;
    title: string;
    icon: "note" | "task" | "event" | "topic";
    status: "open" | "closed";
    rank: string;
  }> = {},
): Item => {
  const id = overrides.id ?? "019a0000-0000-7000-8000-000000000001";
  return createItem({
    id: Result.unwrap(itemIdFromString(id)),
    title: Result.unwrap(itemTitleFromString(overrides.title ?? "Test Item")),
    icon: createItemIcon(overrides.icon ?? "note"),
    status: overrides.status === "closed" ? itemStatusClosed() : itemStatusOpen(),
    directory: DIR,
    rank: Result.unwrap(itemRankFromString(overrides.rank ?? "a0")),
    createdAt: NOW,
    updatedAt: NOW,
  });
};

const makeDeps = (items: Item[] = []) => ({
  itemRepository: new InMemoryItemRepository(items),
  aliasRepository: new InMemoryAliasRepository(),
});

Deno.test("listItems - returns DTOs with correct field mapping", async () => {
  const item = makeItem({ title: "Buy milk", icon: "task" });
  const deps = makeDeps([item]);

  const result = await listItems({ cwd: DIR, timezone: TZ, today: TODAY }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.items.length, 1);
  const dto: ListItemDto = result.value.items[0];
  assertEquals(dto.id, item.data.id.toString());
  assertEquals(dto.icon, "task");
  assertEquals(dto.title, "Buy milk");
  assertEquals(dto.status, "open");
  assertEquals(dto.rank, item.data.rank.toString());
  assertEquals(dto.directory, item.data.directory.toString());
  assertEquals(dto.createdAt, item.data.createdAt.toString());
  assertEquals(dto.updatedAt, item.data.updatedAt.toString());
  assertEquals(dto.alias, undefined);
  assertEquals(dto.project, undefined);
  assertEquals(dto.contexts, undefined);
});

Deno.test("listItems - returns empty list when no items match", async () => {
  const deps = makeDeps([]);

  const result = await listItems({ cwd: DIR, timezone: TZ, today: TODAY }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;
  assertEquals(result.value.items.length, 0);
});

Deno.test("listItems - filters by status=open (default)", async () => {
  const open = makeItem({
    id: "019a0000-0000-7000-8000-000000000001",
    title: "Open",
  });
  const closed = makeItem({
    id: "019a0000-0000-7000-8000-000000000002",
    title: "Closed",
    status: "closed",
  });
  const deps = makeDeps([open, closed]);

  const result = await listItems(
    { cwd: DIR, timezone: TZ, today: TODAY, status: "open" },
    deps,
  );

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;
  assertEquals(result.value.items.length, 1);
  assertEquals(result.value.items[0].title, "Open");
});

Deno.test("listItems - filters by status=closed", async () => {
  const open = makeItem({
    id: "019a0000-0000-7000-8000-000000000001",
    title: "Open",
  });
  const closed = makeItem({
    id: "019a0000-0000-7000-8000-000000000002",
    title: "Closed",
    status: "closed",
  });
  const deps = makeDeps([open, closed]);

  const result = await listItems(
    { cwd: DIR, timezone: TZ, today: TODAY, status: "closed" },
    deps,
  );

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;
  assertEquals(result.value.items.length, 1);
  assertEquals(result.value.items[0].title, "Closed");
});

Deno.test("listItems - filters by status=all returns both", async () => {
  const open = makeItem({
    id: "019a0000-0000-7000-8000-000000000001",
    status: "open",
  });
  const closed = makeItem({
    id: "019a0000-0000-7000-8000-000000000002",
    status: "closed",
  });
  const deps = makeDeps([open, closed]);

  const result = await listItems(
    { cwd: DIR, timezone: TZ, today: TODAY, status: "all" },
    deps,
  );

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;
  assertEquals(result.value.items.length, 2);
});

Deno.test("listItems - filters by icon", async () => {
  const note = makeItem({
    id: "019a0000-0000-7000-8000-000000000001",
    icon: "note",
  });
  const task = makeItem({
    id: "019a0000-0000-7000-8000-000000000002",
    icon: "task",
  });
  const deps = makeDeps([note, task]);

  const result = await listItems(
    { cwd: DIR, timezone: TZ, today: TODAY, icon: "task" },
    deps,
  );

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;
  assertEquals(result.value.items.length, 1);
  assertEquals(result.value.items[0].icon, "task");
});

Deno.test("listItems - invalid expression returns validation error", async () => {
  const deps = makeDeps([]);

  // An expression with invalid syntax should propagate as a validation error
  const result = await listItems(
    { cwd: DIR, timezone: TZ, today: TODAY, expression: ":::invalid" },
    deps,
  );

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
});

Deno.test("listItems - DTO fields are frozen", async () => {
  const item = makeItem();
  const deps = makeDeps([item]);

  const result = await listItems({ cwd: DIR, timezone: TZ, today: TODAY }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;
  assertEquals(Object.isFrozen(result.value.items[0]), true);
});
