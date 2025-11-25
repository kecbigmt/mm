import { assertEquals, assertExists } from "@std/assert";
import { Result } from "../../shared/result.ts";
import { Item } from "../models/item.ts";
import { EditItemWorkflow } from "./edit_item.ts";
import { createItem } from "../models/item.ts";
import {
  AliasSlug,
  aliasSlugFromString,
  createItemIcon,
  DateTime,
  dateTimeFromDate,
  ItemId,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDuration,
  parsePlacement,
} from "../primitives/mod.ts";
import { createRepositoryError } from "../repositories/repository_error.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { Alias, createAlias } from "../models/alias.ts";

const createTestItem = (
  id: ItemId,
  title: string,
  createdAt: DateTime,
): Item => {
  const itemTitle = Result.unwrap(itemTitleFromString(title));
  const placement = Result.unwrap(parsePlacement("2024-01-01"));
  const rank = Result.unwrap(itemRankFromString("a0"));
  return createItem({
    id,
    title: itemTitle,
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement,
    rank,
    createdAt,
    updatedAt: createdAt,
  });
};

Deno.test("EditItemWorkflow - should update item title", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Original Title", now);

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(originalItem));
      }
      return Promise.resolve(Result.error(
        createRepositoryError("item", "load", "Item not found", { identifier: id.toString() }),
      ));
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (_alias) => Promise.resolve(Result.ok(undefined)),
    delete: (_slug) => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        title: "Updated Title",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.title.toString(), "Updated Title");
  }
});

Deno.test("EditItemWorkflow - should update item via alias", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const aliasSlug = Result.unwrap(aliasSlugFromString("my-alias"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Original Title", now);

  const mockAlias: Alias = createAlias({
    slug: aliasSlug,
    itemId,
    createdAt: now,
  });

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(originalItem));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      );
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (slug) => {
      if (slug.equals(aliasSlug)) {
        return Promise.resolve(Result.ok(mockAlias));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("alias", "load", "Alias not found")),
      );
    },
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: "my-alias",
      updates: {
        title: "Updated via Alias",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.title.toString(), "Updated via Alias");
  }
});

Deno.test("EditItemWorkflow - should update multiple fields", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Original Title", now);

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(originalItem));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      );
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (_alias) => Promise.resolve(Result.ok(undefined)),
    delete: (_slug) => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        title: "Updated Title",
        icon: "task",
        body: "New body content",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.title.toString(), "Updated Title");
    assertEquals(result.value.data.icon.toString(), "task");
    assertEquals(result.value.data.body, "New body content");
  }
});

Deno.test("EditItemWorkflow - should return error for non-existent item", async () => {
  const mockItemRepository: ItemRepository = {
    load: (_id) =>
      Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      ),
    save: (_item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (_alias) => Promise.resolve(Result.ok(undefined)),
    delete: (_slug) => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const result = await EditItemWorkflow.execute(
    {
      itemLocator: "nonexistent",
      updates: {
        title: "Updated Title",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    if ("kind" in result.error && result.error.kind === "ValidationError") {
      assertExists(
        result.error.issues.find((i: { message: string }) => i.message.includes("not found")),
      );
    }
  }
});

Deno.test("EditItemWorkflow - should handle invalid title", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Original Title", now);

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(originalItem));
      }
      return Promise.resolve(Result.error(
        createRepositoryError("item", "load", "Item not found", { identifier: id.toString() }),
      ));
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (_alias) => Promise.resolve(Result.ok(undefined)),
    delete: (_slug) => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        title: "",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error" && "kind" in result.error) {
    assertEquals(result.error.kind, "ValidationError");
  }
});

Deno.test("EditItemWorkflow - should update alias index when alias changes", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const oldAliasSlug = Result.unwrap(aliasSlugFromString("old-alias"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Test Item", now);
  const itemWithAlias = originalItem.setAlias(oldAliasSlug, now);

  let deletedAlias: typeof oldAliasSlug | undefined;
  let savedAlias: Alias | undefined;

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(itemWithAlias));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      );
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (alias: Alias) => {
      savedAlias = alias;
      return Promise.resolve(Result.ok(undefined));
    },
    delete: (slug) => {
      deletedAlias = slug;
      return Promise.resolve(Result.ok(undefined));
    },
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        alias: "new-alias",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.alias?.toString(), "new-alias");
  }

  // Verify old alias was deleted
  assertExists(deletedAlias);
  assertEquals(deletedAlias.toString(), "old-alias");

  // Verify new alias was saved
  assertExists(savedAlias);
  assertEquals(savedAlias.data.slug.toString(), "new-alias");
  assertEquals(savedAlias.data.itemId.equals(itemId), true);
});

Deno.test("EditItemWorkflow - should delete alias index when alias is cleared", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const oldAliasSlug = Result.unwrap(aliasSlugFromString("old-alias"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Test Item", now);
  const itemWithAlias = originalItem.setAlias(oldAliasSlug, now);

  let deletedAlias: typeof oldAliasSlug | undefined;
  let savedAlias: Alias | undefined;

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(itemWithAlias));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      );
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (alias: Alias) => {
      savedAlias = alias;
      return Promise.resolve(Result.ok(undefined));
    },
    delete: (slug) => {
      deletedAlias = slug;
      return Promise.resolve(Result.ok(undefined));
    },
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        alias: "", // Clear alias
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.alias, undefined);
  }

  // Verify old alias was deleted
  assertExists(deletedAlias);
  assertEquals(deletedAlias.toString(), "old-alias");

  // Verify no new alias was saved
  assertEquals(savedAlias, undefined);
});

Deno.test("EditItemWorkflow - should save alias index when alias is added", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const originalItem = createTestItem(itemId, "Test Item", now);

  let deletedAlias: AliasSlug | undefined;
  let savedAlias: Alias | undefined;

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(originalItem));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      );
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (alias: Alias) => {
      savedAlias = alias;
      return Promise.resolve(Result.ok(undefined));
    },
    delete: (slug) => {
      deletedAlias = slug;
      return Promise.resolve(Result.ok(undefined));
    },
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        alias: "new-alias",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.data.alias?.toString(), "new-alias");
  }

  // Verify no alias was deleted (since there was no old alias)
  assertEquals(deletedAlias, undefined);

  // Verify new alias was saved
  assertExists(savedAlias);
  assertEquals(savedAlias.data.slug.toString(), "new-alias");
  assertEquals(savedAlias.data.itemId.equals(itemId), true);
});

Deno.test("EditItemWorkflow - should preserve existing schedule fields on partial update", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date()));
  const startAt = Result.unwrap(dateTimeFromDate(new Date("2025-01-15T10:00:00Z")));
  const duration = Result.unwrap(parseDuration("2h"));
  const dueAt = Result.unwrap(dateTimeFromDate(new Date("2025-01-20T18:00:00Z")));

  const originalItem = createTestItem(itemId, "Test Item", now);
  const itemWithSchedule = originalItem.schedule({ startAt, duration, dueAt }, now);

  const mockItemRepository: ItemRepository = {
    load: (id: ItemId) => {
      if (id.equals(itemId)) {
        return Promise.resolve(Result.ok(itemWithSchedule));
      }
      return Promise.resolve(
        Result.error(createRepositoryError("item", "load", "Item not found")),
      );
    },
    save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
    delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
    listByPlacement: () => Promise.resolve(Result.ok([])),
  };

  const mockAliasRepository: AliasRepository = {
    load: (_slug) =>
      Promise.resolve(Result.error(
        createRepositoryError("alias", "load", "Alias not found"),
      )),
    save: (_alias) => Promise.resolve(Result.ok(undefined)),
    delete: (_slug) => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  // Update only duration
  const result = await EditItemWorkflow.execute(
    {
      itemLocator: itemId.toString(),
      updates: {
        duration: "30m",
      },
      updatedAt: now,
    },
    {
      itemRepository: mockItemRepository,
      aliasRepository: mockAliasRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Duration should be updated
    assertEquals(result.value.data.duration?.toString(), "30m");
    // startAt and dueAt should be preserved
    assertEquals(result.value.data.startAt?.toString(), startAt.toString());
    assertEquals(result.value.data.dueAt?.toString(), dueAt.toString());
  }
});
