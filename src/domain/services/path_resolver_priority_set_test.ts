/**
 * Tests for PathResolver priority set integration.
 * When resolving alias prefixes, PathResolver loads recent items (today ± 7 days)
 * to form a priority set, giving recent aliases matching priority.
 */

import { assertEquals } from "@std/assert";
import { createPathResolver } from "./path_resolver.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { parsePathExpression } from "../../presentation/cli/path_parser.ts";
import { createAlias } from "../models/alias.ts";
import { createItem } from "../models/item.ts";
import {
  createDateDirectory,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemStatusOpen,
  parseAliasSlug,
  parseCalendarDay,
  parseDateTime,
  parseDirectory,
  parseItemId,
  parseItemRank,
  parseItemTitle,
  parseTimezoneIdentifier,
} from "../primitives/mod.ts";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../repositories/repository_error.ts";
import type { ItemRepository } from "../repositories/item_repository.ts";

const TODAY = new Date("2026-02-11T00:00:00Z");

const makeItem = (
  overrides: Partial<{ id: string; title: string; directory: string; alias: string }>,
) => {
  const id = Result.unwrap(parseItemId(overrides.id ?? "019a0000-0000-7000-8000-000000000099"));
  const title = Result.unwrap(parseItemTitle(overrides.title ?? "Test item"));
  const icon = createItemIcon("task");
  const status = itemStatusOpen();
  const directory = Result.unwrap(parseDirectory(overrides.directory ?? "2026-02-11"));
  const rank = Result.unwrap(parseItemRank("0|aaaaaa:"));
  const createdAt = Result.unwrap(parseDateTime("2026-02-10T09:00:00Z"));
  const updatedAt = Result.unwrap(parseDateTime("2026-02-10T09:00:00Z"));
  const alias = overrides.alias ? Result.unwrap(parseAliasSlug(overrides.alias)) : undefined;

  return createItem({
    id,
    title,
    icon,
    status,
    directory,
    rank,
    createdAt,
    updatedAt,
    alias,
  });
};

const setup = () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const now = Result.unwrap(dateTimeFromDate(TODAY));
  const today = Result.unwrap(parseCalendarDay("2026-02-11"));
  const cwd = createDateDirectory(today, []);
  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));

  const addAlias = (slug: string, itemId: string) => {
    aliasRepository.set(createAlias({
      slug: Result.unwrap(parseAliasSlug(slug)),
      itemId: Result.unwrap(itemIdFromString(itemId)),
      createdAt: now,
    }));
  };

  const addItem = (
    overrides: Partial<{ id: string; title: string; directory: string; alias: string }>,
  ) => {
    const item = makeItem(overrides);
    itemRepository.set(item);
    return item;
  };

  const createResolver = () =>
    createPathResolver({
      itemRepository,
      aliasRepository,
      timezone,
      today: TODAY,
    });

  return { itemRepository, aliasRepository, addAlias, addItem, createResolver, cwd };
};

// --- AC 1: Priority Set Loading ---

Deno.test("PathResolver priority - recent item alias in priority set resolves short prefix", async () => {
  const { addAlias, addItem, createResolver, cwd } = setup();

  // bace-x7q is placed today (within ±7 days) → in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000001",
    directory: "2026-02-11",
    alias: "bace-x7q",
  });
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  // bace-y2m is placed 30 days ago (outside ±7 days) → NOT in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000002",
    directory: "2026-01-12",
    alias: "bace-y2m",
  });
  addAlias("bace-y2m", "019a0000-0000-7000-8000-000000000002");

  // kuno-p3r is placed today → in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000003",
    directory: "2026-02-11",
    alias: "kuno-p3r",
  });
  addAlias("kuno-p3r", "019a0000-0000-7000-8000-000000000003");

  const resolver = createResolver();
  // prefix "b" should match bace-x7q in priority set (bace-y2m is outside)
  const expr = Result.unwrap(parsePathExpression("b"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

Deno.test("PathResolver priority - empty priority set falls back to all items", async () => {
  const { addAlias, addItem, createResolver, cwd } = setup();

  // Item placed 30 days ago → NOT in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000001",
    directory: "2026-01-12",
    alias: "bace-x7q",
  });
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  const resolver = createResolver();
  // prefix "b" should fall back to all items and match bace-x7q
  const expr = Result.unwrap(parsePathExpression("b"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

// --- AC 2: Priority Set Scoping ---

Deno.test("PathResolver priority - ambiguous within priority set returns error", async () => {
  const { addAlias, addItem, createResolver, cwd } = setup();

  // Both bace-x7q and bace-y2m placed today → both in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000001",
    directory: "2026-02-11",
    alias: "bace-x7q",
  });
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  addItem({
    id: "019a0000-0000-7000-8000-000000000002",
    directory: "2026-02-11",
    alias: "bace-y2m",
  });
  addAlias("bace-y2m", "019a0000-0000-7000-8000-000000000002");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("bace"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "ambiguous_alias_prefix");
  }
});

Deno.test("PathResolver priority - ambiguous in all-items tier when no priority match", async () => {
  const { addAlias, addItem, createResolver, cwd } = setup();

  // kuno-p3r placed today → in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000003",
    directory: "2026-02-11",
    alias: "kuno-p3r",
  });
  addAlias("kuno-p3r", "019a0000-0000-7000-8000-000000000003");

  // bace-x7q and bace-y2m placed 30 days ago → NOT in priority set
  addItem({
    id: "019a0000-0000-7000-8000-000000000001",
    directory: "2026-01-12",
    alias: "bace-x7q",
  });
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  addItem({
    id: "019a0000-0000-7000-8000-000000000002",
    directory: "2026-01-12",
    alias: "bace-y2m",
  });
  addAlias("bace-y2m", "019a0000-0000-7000-8000-000000000002");

  const resolver = createResolver();
  // prefix "bace" not in priority set → falls back to all items → ambiguous
  const expr = Result.unwrap(parsePathExpression("bace"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "ambiguous_alias_prefix");
  }
});

// --- AC 3: Exact Match Still Works ---

Deno.test("PathResolver priority - exact alias match still works", async () => {
  const { addAlias, addItem, createResolver, cwd } = setup();

  addItem({
    id: "019a0000-0000-7000-8000-000000000001",
    directory: "2026-02-11",
    alias: "bace-x7q",
  });
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("bace-x7q"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

// --- AC 4: Edge Cases ---

Deno.test("PathResolver priority - recent item without alias excluded from priority set", async () => {
  const { addAlias, addItem, createResolver, cwd } = setup();

  // Recent item WITHOUT alias → should not affect priority set
  addItem({ id: "019a0000-0000-7000-8000-000000000010", directory: "2026-02-11" });

  // bace-x7q placed 30 days ago → only in all items
  addItem({
    id: "019a0000-0000-7000-8000-000000000001",
    directory: "2026-01-12",
    alias: "bace-x7q",
  });
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  const resolver = createResolver();
  // No aliases in priority set → falls back to all items → matches bace-x7q
  const expr = Result.unwrap(parsePathExpression("b"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

Deno.test("PathResolver priority - degrades gracefully when item repository fails", async () => {
  const aliasRepository = new InMemoryAliasRepository();
  const now = Result.unwrap(dateTimeFromDate(TODAY));
  const today = Result.unwrap(parseCalendarDay("2026-02-11"));
  const cwd = createDateDirectory(today, []);
  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));

  // Item repository that fails on listByDirectory
  const failingItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(undefined)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByDirectory: () =>
      Promise.resolve(
        Result.error(createRepositoryError("item", "list", "simulated failure")),
      ),
  };

  aliasRepository.set(createAlias({
    slug: Result.unwrap(parseAliasSlug("bace-x7q")),
    itemId: Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000001")),
    createdAt: now,
  }));

  const resolver = createPathResolver({
    itemRepository: failingItemRepository,
    aliasRepository,
    timezone,
    today: TODAY,
  });

  // Priority set loading fails → empty priority set → falls back to all items
  const expr = Result.unwrap(parsePathExpression("b"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});
