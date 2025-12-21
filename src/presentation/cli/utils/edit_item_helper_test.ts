import { assertEquals, assertRejects } from "@std/assert";
import { handlePostEditUpdates } from "./edit_item_helper.ts";
import { Result } from "../../../shared/result.ts";
import { createItem, Item } from "../../../domain/models/item.ts";
import { Alias, createAlias } from "../../../domain/models/alias.ts";
import { createRepositoryError } from "../../../domain/repositories/repository_error.ts";
import type { ItemRepository } from "../../../domain/repositories/item_repository.ts";
import type { AliasRepository } from "../../../domain/repositories/alias_repository.ts";
import {
  aliasSlugFromString,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parsePlacement,
} from "../../../domain/primitives/mod.ts";

const createTestItem = (
  id: string,
  title: string,
  alias?: string,
): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const itemTitle = Result.unwrap(itemTitleFromString(title));
  const placement = Result.unwrap(parsePlacement("2024-01-01"));
  const rank = Result.unwrap(itemRankFromString("a0"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const aliasSlug = alias ? Result.unwrap(aliasSlugFromString(alias)) : undefined;

  return createItem({
    id: itemId,
    title: itemTitle,
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement,
    rank,
    alias: aliasSlug,
    createdAt: now,
    updatedAt: now,
  });
};

Deno.test("handlePostEditUpdates - updates cache with reloaded item", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const updatedItem = createTestItem(itemId.toString(), "Updated Title");

  let cacheUpdated = false;

  const mockItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(updatedItem)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(undefined)), // Alias not found returns ok(undefined)
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => {
      cacheUpdated = true;
      return Promise.resolve();
    },
  } as { updateFromItem: (item: Item) => Promise<void> };

  const result = await handlePostEditUpdates(
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
      cacheUpdateService: mockCacheUpdateService,
    },
    {
      itemId,
      oldAlias: undefined,
      occurredAt: now,
    },
  );

  assertEquals(result.data.title.toString(), "Updated Title");
  assertEquals(cacheUpdated, true, "Cache should be updated");
});

Deno.test("handlePostEditUpdates - adds new alias when alias changed from undefined", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const newAliasSlug = Result.unwrap(aliasSlugFromString("new-alias"));
  const updatedItem = createTestItem(itemId.toString(), "Test", "new-alias");

  let savedAlias: Alias | undefined;

  const mockItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(updatedItem)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(undefined)), // Alias not found returns ok(undefined)
    save: (alias) => {
      savedAlias = alias;
      return Promise.resolve(Result.ok(undefined));
    },
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => Promise.resolve(),
  } as { updateFromItem: (item: Item) => Promise<void> };

  await handlePostEditUpdates(
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
      cacheUpdateService: mockCacheUpdateService,
    },
    {
      itemId,
      oldAlias: undefined,
      occurredAt: now,
    },
  );

  assertEquals(savedAlias?.data.slug.equals(newAliasSlug), true, "New alias should be saved");
  assertEquals(savedAlias?.data.itemId.equals(itemId), true, "Alias should point to correct item");
});

Deno.test("handlePostEditUpdates - deletes old alias and adds new alias when changed", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const oldAliasSlug = Result.unwrap(aliasSlugFromString("old-alias"));
  const newAliasSlug = Result.unwrap(aliasSlugFromString("new-alias"));
  const updatedItem = createTestItem(itemId.toString(), "Test", "new-alias");

  let deletedAlias: typeof oldAliasSlug | undefined;
  let savedAlias: Alias | undefined;

  const mockItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(updatedItem)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(undefined)), // Alias not found returns ok(undefined)
    save: (alias) => {
      savedAlias = alias;
      return Promise.resolve(Result.ok(undefined));
    },
    delete: (slug) => {
      deletedAlias = slug;
      return Promise.resolve(Result.ok(undefined));
    },
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => Promise.resolve(),
  } as { updateFromItem: (item: Item) => Promise<void> };

  await handlePostEditUpdates(
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
      cacheUpdateService: mockCacheUpdateService,
    },
    {
      itemId,
      oldAlias: oldAliasSlug,
      occurredAt: now,
    },
  );

  assertEquals(deletedAlias?.equals(oldAliasSlug), true, "Old alias should be deleted");
  assertEquals(savedAlias?.data.slug.equals(newAliasSlug), true, "New alias should be saved");
});

Deno.test("handlePostEditUpdates - does not modify aliases when unchanged", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const aliasSlug = Result.unwrap(aliasSlugFromString("same-alias"));
  const updatedItem = createTestItem(itemId.toString(), "Test", "same-alias");

  let aliasDeleted = false;
  let aliasSaved = false;

  const mockItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(updatedItem)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(undefined)), // Alias not found returns ok(undefined)
    save: () => {
      aliasSaved = true;
      return Promise.resolve(Result.ok(undefined));
    },
    delete: () => {
      aliasDeleted = true;
      return Promise.resolve(Result.ok(undefined));
    },
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => Promise.resolve(),
  } as { updateFromItem: (item: Item) => Promise<void> };

  await handlePostEditUpdates(
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
      cacheUpdateService: mockCacheUpdateService,
    },
    {
      itemId,
      oldAlias: aliasSlug,
      occurredAt: now,
    },
  );

  assertEquals(aliasDeleted, false, "Alias should not be deleted");
  assertEquals(aliasSaved, false, "Alias should not be saved");
});

Deno.test("handlePostEditUpdates - throws error when alias collision detected", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const otherItemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-999999999999"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const newAliasSlug = Result.unwrap(aliasSlugFromString("conflicting-alias"));
  const updatedItem = createTestItem(itemId.toString(), "Test", "conflicting-alias");

  const existingAlias = createAlias({
    slug: newAliasSlug,
    itemId: otherItemId,
    createdAt: now,
  });

  const mockItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(updatedItem)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(existingAlias)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => Promise.resolve(),
  } as { updateFromItem: (item: Item) => Promise<void> };

  await assertRejects(
    async () => {
      await handlePostEditUpdates(
        {
          itemRepository: mockItemRepository,
          aliasRepository: mockAliasRepository,
          cacheUpdateService: mockCacheUpdateService,
        },
        {
          itemId,
          oldAlias: undefined,
          occurredAt: now,
        },
      );
    },
    Error,
    "already in use by another item",
  );
});

Deno.test("handlePostEditUpdates - throws error when item reload fails", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const mockItemRepository: ItemRepository = {
    load: () =>
      Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Failed to reload")),
      ),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(undefined)), // Alias not found returns ok(undefined)
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => Promise.resolve(),
  } as { updateFromItem: (item: Item) => Promise<void> };

  await assertRejects(
    async () => {
      await handlePostEditUpdates(
        {
          itemRepository: mockItemRepository,
          aliasRepository: mockAliasRepository,
          cacheUpdateService: mockCacheUpdateService,
        },
        {
          itemId,
          oldAlias: undefined,
          occurredAt: now,
        },
      );
    },
    Error,
    "Failed to reload item after edit",
  );
});

Deno.test("handlePostEditUpdates - throws error when item not found after reload", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));

  const mockItemRepository: ItemRepository = {
    load: () => Promise.resolve(Result.ok(undefined)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: () => Promise.resolve(Result.ok(undefined)), // Alias not found returns ok(undefined)
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const mockCacheUpdateService = {
    updateFromItem: () => Promise.resolve(),
  } as { updateFromItem: (item: Item) => Promise<void> };

  await assertRejects(
    async () => {
      await handlePostEditUpdates(
        {
          itemRepository: mockItemRepository,
          aliasRepository: mockAliasRepository,
          cacheUpdateService: mockCacheUpdateService,
        },
        {
          itemId,
          oldAlias: undefined,
          occurredAt: now,
        },
      );
    },
    Error,
    "item not found",
  );
});
