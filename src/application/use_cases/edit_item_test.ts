import { assertEquals, assertExists } from "@std/assert";
import { editItem } from "./edit_item.ts";
import { Result } from "../../shared/result.ts";
import { Alias, createAlias } from "../../domain/models/alias.ts";
import { Item } from "../../domain/models/item.ts";
import { createItem } from "../../domain/models/item.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import {
  aliasSlugFromString,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDirectory,
  parseDuration,
  timezoneIdentifierFromString,
} from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/repository_error.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";
import { createIdGenerationService } from "../../domain/services/id_generation_service.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createDeps = () => ({
  itemRepository: new InMemoryItemRepository(),
  aliasRepository: new InMemoryAliasRepository(),
  rankService: createLexoRankService(),
  idGenerationService: createIdGenerationService({
    generate: () => "019965a7-9999-740a-b8c1-9999904fd120",
  }),
});

const createTestItem = (overrides?: { title?: string; body?: string }): Item => {
  const id = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const now = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));
  return createItem({
    id,
    title: Result.unwrap(itemTitleFromString(overrides?.title ?? "Original")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    directory: Result.unwrap(parseDirectory("2024-09-20")),
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
    ...(overrides?.body ? { body: overrides.body } : {}),
  });
};

Deno.test("editItem returns presentation-free DTOs for updated items", async () => {
  const deps = createDeps();
  const item = createTestItem({ body: "Old body" });
  deps.itemRepository.set(item);
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await editItem({
    itemLocator: item.data.id.toString(),
    updates: {
      title: "Updated title",
      body: "New body",
      alias: "updated-alias",
    },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.id, item.data.id.toString());
  assertEquals(result.value.item.title, "Updated title");
  assertEquals(result.value.item.alias, "updated-alias");
  assertEquals(result.value.item.body, "New body");
  assertEquals(result.value.createdTopics, []);
  assertEquals(Object.isFrozen(result.value.item), true);
});

Deno.test("editItem returns created topic aliases as strings", async () => {
  const deps = createDeps();
  const item = createTestItem();
  deps.itemRepository.set(item);
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await editItem({
    itemLocator: item.data.id.toString(),
    updates: {
      project: "project-alpha",
      contexts: ["ctx-review"],
    },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.createdTopics, ["project-alpha", "ctx-review"]);
});

Deno.test("editItem maps locator failures to ValidationError", async () => {
  const deps = createDeps();
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await editItem({
    itemLocator: "missing-item",
    updates: { title: "Updated title" },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
  if (result.error.kind !== "ValidationError") return;
  assertExists(result.error.issues.find((issue) => issue.code === "not_found"));
});

Deno.test("editItem preserves existing schedule fields on partial update", async () => {
  const deps = createDeps();
  const item = createTestItem();
  const startAt = Result.unwrap(dateTimeFromDate(new Date("2025-01-15T10:00:00Z")));
  const duration = Result.unwrap(parseDuration("2h"));
  const dueAt = Result.unwrap(dateTimeFromDate(new Date("2025-01-20T18:00:00Z")));
  deps.itemRepository.set(item.schedule({ startAt, duration, dueAt }, item.data.updatedAt));
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await editItem({
    itemLocator: item.data.id.toString(),
    updates: { duration: "30m" },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.duration, "30m");
  assertEquals(result.value.item.startAt, startAt.toString());
  assertEquals(result.value.item.dueAt, dueAt.toString());
});

Deno.test("editItem rejects alias collisions", async () => {
  const deps = createDeps();
  const item = createTestItem();
  deps.itemRepository.set(item);
  const conflictAlias = Result.unwrap(aliasSlugFromString("existing-alias"));
  const otherItemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd999"));
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  deps.aliasRepository.set(createAlias({
    slug: conflictAlias,
    itemId: otherItemId,
    createdAt: updatedAt,
  }));

  const result = await editItem({
    itemLocator: item.data.id.toString(),
    updates: { alias: "existing-alias" },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
  if (result.error.kind !== "ValidationError") return;
  assertEquals(result.error.issues[0]?.code, "conflict");
});

Deno.test("editItem uses directory date for time-only values in workspace timezone", async () => {
  const deps = createDeps();
  const id = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd121"));
  const now = Result.unwrap(dateTimeFromDate(new Date("2025-02-10T12:00:00Z")));
  deps.itemRepository.set(createItem({
    id,
    title: Result.unwrap(itemTitleFromString("Task")),
    icon: createItemIcon("task"),
    status: itemStatusOpen(),
    directory: Result.unwrap(parseDirectory("2025-02-10")),
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));
  const timezone = Result.unwrap(timezoneIdentifierFromString("Asia/Tokyo"));

  const result = await editItem({
    itemLocator: id.toString(),
    updates: {
      startAt: "09:00",
      dueAt: "17:00",
    },
    updatedAt: now,
    timezone,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.startAt, "2025-02-10T00:00:00.000Z");
  assertEquals(result.value.item.dueAt, "2025-02-10T08:00:00.000Z");
});

Deno.test("editItem does not persist prepared topics when later validation fails", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const otherItemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd999"));
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2025-02-10T12:00:00Z")));
  const originalItem = createTestItem();
  const existingAliasSlug = Result.unwrap(aliasSlugFromString("taken-alias"));
  const existingAlias = createAlias({
    slug: existingAliasSlug,
    itemId: otherItemId,
    createdAt: updatedAt,
  });

  const savedItems: Item[] = [];
  const savedAliases: Alias[] = [];

  const itemRepository: ItemRepository = {
    load: (id) => Promise.resolve(Result.ok(id.equals(itemId) ? originalItem : undefined)),
    save: (item) => {
      savedItems.push(item);
      return Promise.resolve(Result.ok(undefined));
    },
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByDirectory: () => Promise.resolve(Result.ok([])),
  };

  const aliasRepository: AliasRepository = {
    load: (slug) =>
      Promise.resolve(Result.ok(slug.equals(existingAliasSlug) ? existingAlias : undefined)),
    save: (alias) => {
      savedAliases.push(alias);
      return Promise.resolve(Result.ok(undefined));
    },
    delete: () => Promise.resolve(Result.ok(undefined)),
    list: () => Promise.resolve(Result.ok([])),
  };

  const result = await editItem({
    itemLocator: itemId.toString(),
    updates: {
      project: "new-project",
      alias: "taken-alias",
    },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository,
    aliasRepository,
    rankService: createLexoRankService(),
    idGenerationService: createIdGenerationService({
      generate: () => "019965a7-9999-740a-b8c1-9999904fd120",
    }),
  });

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
  assertEquals(savedItems.length, 0);
  assertEquals(savedAliases.length, 0);
});

Deno.test("editItem maps repository save failures to RepositoryError", async () => {
  const itemId = Result.unwrap(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd120"));
  const item = createTestItem();
  const updatedAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));
  const repoError = createRepositoryError("item", "save", "disk full", {
    identifier: itemId.toString(),
  });

  const itemRepository: ItemRepository = {
    load: (id) => Promise.resolve(Result.ok(id.equals(itemId) ? item : undefined)),
    save: () => Promise.resolve(Result.error(repoError)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByDirectory: () => Promise.resolve(Result.ok([])),
  };

  const result = await editItem({
    itemLocator: itemId.toString(),
    updates: { title: "Updated title" },
    updatedAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository,
    aliasRepository: new InMemoryAliasRepository(),
    rankService: createLexoRankService(),
    idGenerationService: createIdGenerationService({
      generate: () => "019965a7-9999-740a-b8c1-9999904fd120",
    }),
  });

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "RepositoryError");
  assertEquals(result.error.message, "disk full");
});
