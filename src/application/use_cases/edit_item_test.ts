import { assertEquals, assertExists } from "@std/assert";
import { editItem } from "./edit_item.ts";
import { Result } from "../../shared/result.ts";
import { Item } from "../../domain/models/item.ts";
import { createItem } from "../../domain/models/item.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDirectory,
  timezoneIdentifierFromString,
} from "../../domain/primitives/mod.ts";
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
