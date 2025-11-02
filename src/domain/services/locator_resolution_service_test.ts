import { assertEquals } from "@std/assert";
import { LocatorResolutionService } from "./locator_resolution_service.ts";
import { Result } from "../../shared/result.ts";
import { Item, createItem } from "../models/item.ts";
import { Alias, createAlias } from "../models/alias.ts";
import {
  aliasSlugFromString,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parsePath,
  timezoneIdentifierFromString,
} from "../primitives/mod.ts";
import { ItemId } from "../primitives/item_id.ts";
import {
  createFileSystemAliasRepository,
  createFileSystemItemRepository,
} from "../../infrastructure/fileSystem/mod.ts";
import { createSha256HashingService } from "../../infrastructure/hash/sha256_hashing_service.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";

const createTestItem = (id: string, section: string): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const title = Result.unwrap(itemTitleFromString("Test Item"));
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const rank = Result.unwrap(itemRankFromString("a0"));
  const path = Result.unwrap(parsePath(`/${section}`));
  const timestamp = Result.unwrap(dateTimeFromDate(new Date("2024-09-18T15:00:00Z")));

  return createItem({
    id: itemId,
    title,
    icon,
    status,
    path,
    rank,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
};

const createAliasFor = (raw: string, itemId: ItemId): Alias => {
  const slug = Result.unwrap(aliasSlugFromString(raw));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-18T15:30:00Z")));
  return createAlias({
    slug,
    itemId,
    createdAt,
  });
};

Deno.test("LocatorResolutionService resolves items by UUID", async () => {
  const item = createTestItem("019965a7-2789-740a-b8c1-1415904fd108", "2024-09-18");
  const itemRepository = new InMemoryItemRepository([item]);
  const aliasRepository = new InMemoryAliasRepository();

  const result = await LocatorResolutionService.resolveItem(
    item.data.id.toString(),
    { itemRepository, aliasRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value?.data.id.toString(), item.data.id.toString());
  }
});

Deno.test("LocatorResolutionService resolves items by alias", async () => {
  const item = createTestItem("019965a7-2789-740a-b8c1-1415904fd109", "2024-09-18");
  const itemRepository = new InMemoryItemRepository([item]);
  const alias = createAliasFor("note-alias", item.data.id);
  const aliasRepository = new InMemoryAliasRepository([alias]);

  const result = await LocatorResolutionService.resolveItem("note-alias", {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value?.data.id.toString(), item.data.id.toString());
  }
});

Deno.test("LocatorResolutionService returns undefined for missing alias", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const result = await LocatorResolutionService.resolveItem("missing-alias", {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value, undefined);
  }
});

Deno.test("LocatorResolutionService rejects range locators", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const base = parsePath("/");
  if (base.type !== "ok") {
    throw new Error("expected base path");
  }

  const result = await LocatorResolutionService.resolveItem("today..+2d", {
    itemRepository,
    aliasRepository,
  }, {
    today: new Date(Date.UTC(2024, 8, 18)),
    cwd: base.value,
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
  }
});

Deno.test("LocatorResolutionService rejects date-only locators", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const result = await LocatorResolutionService.resolveItem("2024-09-18", {
    itemRepository,
    aliasRepository,
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
  }
});

Deno.test({
  name: "LocatorResolutionService resolves aliases via filesystem repositories",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-locator-" });
    try {
      const timezone = Result.unwrap(timezoneIdentifierFromString("UTC"));
      const itemRepository = createFileSystemItemRepository({ root, timezone });
      const hashingService = createSha256HashingService();
      const aliasRepository = createFileSystemAliasRepository({ root, hashingService });

      const item = createTestItem("019965a7-2789-740a-b8c1-1415904fd10a", "2024-09-18");
      Result.unwrap(await itemRepository.save(item));

      const alias = createAliasFor("fs-alias", item.data.id);
      Result.unwrap(await aliasRepository.save(alias));

      const result = await LocatorResolutionService.resolveItem("fs-alias", {
        itemRepository,
        aliasRepository,
      });

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value?.data.id.toString(), item.data.id.toString());
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
