import { assertEquals } from "@std/assert";
import { createItemLocatorService } from "./item_locator_service.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { createAlias } from "../models/alias.ts";
import { createItem } from "../models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemStatusOpen,
  parseAliasSlug,
  parseTimezoneIdentifier,
} from "../primitives/mod.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { parsePlacement } from "../primitives/placement.ts";
import { Result } from "../../shared/result.ts";

const setup = () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const now = Result.unwrap(dateTimeFromDate(new Date("2026-02-11T00:00:00Z")));
  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));

  const addItem = (id: string, alias?: string) => {
    const itemId = Result.unwrap(itemIdFromString(id));
    const item = createItem({
      id: itemId,
      title: Result.unwrap(itemTitleFromString("Test Item")),
      icon: createItemIcon("note"),
      status: itemStatusOpen(),
      placement: Result.unwrap(parsePlacement("2026-02-11")),
      rank: Result.unwrap(itemRankFromString("a0")),
      createdAt: now,
      updatedAt: now,
      alias: alias ? Result.unwrap(parseAliasSlug(alias)) : undefined,
    });
    itemRepository.set(item);

    if (alias) {
      aliasRepository.set(createAlias({
        slug: Result.unwrap(parseAliasSlug(alias)),
        itemId,
        createdAt: now,
      }));
    }

    return item;
  };

  const createLocator = () =>
    createItemLocatorService({
      itemRepository,
      aliasRepository,
      timezone,
      today: new Date("2026-02-11T00:00:00Z"),
    });

  return { itemRepository, aliasRepository, addItem, createLocator };
};

// --- UUID resolution ---

Deno.test("ItemLocatorService - resolves item by exact UUID", async () => {
  const { addItem, createLocator } = setup();
  const item = addItem("019a0000-0000-7000-8000-000000000001");

  const locator = createLocator();
  const result = await locator.resolve("019a0000-0000-7000-8000-000000000001");

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.id.toString(), item.data.id.toString());
  }
});

Deno.test("ItemLocatorService - UUID not found returns not_found", async () => {
  const { createLocator } = setup();

  const locator = createLocator();
  const result = await locator.resolve("019a0000-0000-7000-8000-000000000099");

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "not_found");
  }
});

// --- Exact alias resolution ---

Deno.test("ItemLocatorService - resolves item by exact alias", async () => {
  const { addItem, createLocator } = setup();
  const item = addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");

  const locator = createLocator();
  const result = await locator.resolve("bace-x7q");

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.id.toString(), item.data.id.toString());
  }
});

Deno.test("ItemLocatorService - alias exists but item missing returns not_found", async () => {
  const { aliasRepository, createLocator } = setup();
  const now = Result.unwrap(dateTimeFromDate(new Date("2026-02-11T00:00:00Z")));
  // Add alias without corresponding item
  aliasRepository.set(createAlias({
    slug: Result.unwrap(parseAliasSlug("orphan-alias")),
    itemId: Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-ffffffffffff")),
    createdAt: now,
  }));

  const locator = createLocator();
  const result = await locator.resolve("orphan-alias");

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "not_found");
  }
});

// --- Prefix resolution ---

Deno.test("ItemLocatorService - resolves unique prefix match", async () => {
  const { addItem, createLocator } = setup();
  addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");
  addItem("019a0000-0000-7000-8000-000000000002", "kuno-p3r");

  const locator = createLocator();
  const result = await locator.resolve("bacex");

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.id.toString(), "019a0000-0000-7000-8000-000000000001");
  }
});

Deno.test("ItemLocatorService - ambiguous prefix returns candidates", async () => {
  const { addItem, createLocator } = setup();
  addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");
  addItem("019a0000-0000-7000-8000-000000000002", "bace-y2m");

  const locator = createLocator();
  const result = await locator.resolve("bace");

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ambiguous_prefix");
    if (result.error.kind === "ambiguous_prefix") {
      assertEquals(result.error.candidates.length, 2);
    }
  }
});

Deno.test("ItemLocatorService - no prefix match returns not_found", async () => {
  const { addItem, createLocator } = setup();
  addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");

  const locator = createLocator();
  const result = await locator.resolve("xyz");

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "not_found");
  }
});

Deno.test("ItemLocatorService - case-insensitive prefix matching", async () => {
  const { addItem, createLocator } = setup();
  addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");

  const locator = createLocator();
  const result = await locator.resolve("BACE");

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.id.toString(), "019a0000-0000-7000-8000-000000000001");
  }
});

Deno.test("ItemLocatorService - single-char prefix resolves uniquely", async () => {
  const { addItem, createLocator } = setup();
  addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");
  addItem("019a0000-0000-7000-8000-000000000002", "kuno-p3r");

  const locator = createLocator();
  const result = await locator.resolve("k");

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.id.toString(), "019a0000-0000-7000-8000-000000000002");
  }
});

// --- Priority set preference ---

Deno.test("ItemLocatorService - priority set prefers recent items", async () => {
  const { addItem, createLocator } = setup();
  // Item placed within +-7 days of today (2026-02-11), so it's in the priority set
  const item1 = addItem("019a0000-0000-7000-8000-000000000001", "bace-x7q");

  const locator = createLocator();
  const result = await locator.resolve("b");

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.id.toString(), item1.data.id.toString());
  }
});
