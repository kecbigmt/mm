import { assertEquals, assertExists } from "@std/assert";
import { createItem } from "./create_item.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { createItem as createDomainItem, Item } from "../../domain/models/item.ts";
import {
  aliasSlugFromString,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseCalendarDay,
  parseDirectory,
  parseDuration,
  parseTimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { Result } from "../../shared/result.ts";
import {
  AliasAutoGenerator,
  createAliasAutoGenerator,
  RandomSource,
} from "../../domain/services/alias_auto_generator.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";
import { createIdGenerationService } from "../../domain/services/id_generation_service.ts";
import { createRepositoryError } from "../../domain/repositories/repository_error.ts";

const TEST_TIMEZONE = Result.unwrap(parseTimezoneIdentifier("UTC"));

const createFixedIdService = (id: string) =>
  createIdGenerationService({
    generate: () => id,
  });

const createTestAliasAutoGenerator = (): AliasAutoGenerator => {
  const random: RandomSource = {
    nextInt: (max) => Math.floor(max / 2),
  };
  return createAliasAutoGenerator(random);
};

const createDeps = () => ({
  itemRepository: new InMemoryItemRepository(),
  aliasRepository: new InMemoryAliasRepository(),
  aliasAutoGenerator: createTestAliasAutoGenerator(),
  rankService: createLexoRankService(),
  idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120"),
});

const createExistingItem = (id: string, rank: string, section: string): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const title = Result.unwrap(itemTitleFromString("Existing"));
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const directory = Result.unwrap(parseDirectory(section));
  const itemRank = Result.unwrap(itemRankFromString(rank));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  return createDomainItem({
    id: itemId,
    title,
    icon,
    status,
    directory,
    rank: itemRank,
    createdAt,
    updatedAt: createdAt,
  });
};

Deno.test("createItem assigns middle rank when section is empty", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await createItem({
    title: "New note",
    itemType: "note",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertExists(result.value.item.rank);

  const listResult = await deps.itemRepository.listByDirectory(
    { kind: "single", at: parentDirectory },
  );
  assertEquals(listResult.type, "ok");
  if (listResult.type !== "ok") return;
  assertEquals(listResult.value.length, 1);
});

Deno.test("createItem appends rank after existing siblings", async () => {
  const deps = createDeps();
  const existing = createExistingItem(
    "019965a7-2789-740a-b8c1-1415904fd110",
    "0|100000:",
    "2024-09-20",
  );
  Result.unwrap(await deps.itemRepository.save(existing));

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await createItem({
    title: "Follow-up",
    itemType: "note",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    ...deps,
    idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121"),
  });

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  const listResult = await deps.itemRepository.listByDirectory(
    { kind: "single", at: parentDirectory },
  );
  assertEquals(listResult.type, "ok");
  if (listResult.type !== "ok") return;
  assertEquals(listResult.value.length, 2);

  const orderComparison = deps.rankService.compareRanks(
    listResult.value[0].data.rank,
    listResult.value[1].data.rank,
  );
  assertEquals(orderComparison < 0, true);
});

Deno.test("createItem returns a presentation-free DTO for created task", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));
  const dueAt = Result.unwrap(parseCalendarDay("2024-09-21"));

  const result = await createItem({
    title: "Buy milk",
    itemType: "task",
    alias: "buy-milk",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
    dueAt,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.id, "019965a7-2789-740a-b8c1-1415904fd120");
  assertEquals(result.value.item.icon, "task");
  assertEquals(result.value.item.title, "Buy milk");
  assertEquals(result.value.item.alias, "buy-milk");
  assertEquals(result.value.item.directory, "2024-09-20");
  assertExists(result.value.item.dueAt);
  assertEquals(result.value.createdTopics.length, 0);
  assertEquals(Object.isFrozen(result.value.item), true);
});

Deno.test("createItem returns auto-created topics as strings", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await createItem({
    title: "Write spec",
    itemType: "note",
    project: "project-alpha",
    contexts: ["ctx-review"],
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.createdTopics, ["project-alpha", "ctx-review"]);
});

Deno.test("createItem maps workflow validation failures to ValidationError", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await createItem({
    title: "Planning session",
    itemType: "event",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
    startAt: Result.unwrap(dateTimeFromDate(new Date("2024-09-21T09:00:00Z"))),
    duration: Result.unwrap(parseDuration("30m")),
  }, deps);

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
  if (result.error.kind !== "ValidationError") return;
  assertEquals(result.error.objectKind, "CreateItem");
  assertEquals(
    result.error.issues.some((issue) => issue.code === "date_time_inconsistency"),
    true,
  );
});

Deno.test("createItem maps repository failures to RepositoryError", async () => {
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));
  const repoError = createRepositoryError("item", "save", "disk full", {
    identifier: "019965a7-2789-740a-b8c1-1415904fd120",
  });
  const deps = {
    itemRepository: {
      load: () => Promise.resolve(Result.ok(undefined)),
      save: () => Promise.resolve(Result.error(repoError)),
      delete: () => Promise.resolve(Result.ok(undefined)),
      listByDirectory: () => Promise.resolve(Result.ok([])),
    },
    aliasRepository: new InMemoryAliasRepository(),
    aliasAutoGenerator: createTestAliasAutoGenerator(),
    rankService: createLexoRankService(),
    idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120"),
  };

  const result = await createItem({
    title: "Broken save",
    itemType: "note",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "RepositoryError");
  assertEquals(result.error.message, "disk full");
});

Deno.test("createItem persists manual alias", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await createItem({
    title: "Chapter 1",
    itemType: "note",
    alias: "chapter1",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  const aliasSlug = Result.unwrap(aliasSlugFromString("chapter1"));
  const aliasResult = await deps.aliasRepository.load(aliasSlug);
  assertEquals(aliasResult.type, "ok");
  if (aliasResult.type !== "ok") return;
  assertExists(aliasResult.value);
});

Deno.test("createItem rejects duplicate alias", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const firstResult = await createItem({
    title: "First",
    itemType: "note",
    alias: "chapter1",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, deps);
  assertEquals(firstResult.type, "ok");

  const secondResult = await createItem({
    title: "Second",
    itemType: "note",
    alias: "chapter1",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    ...deps,
    idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121"),
  });

  assertEquals(secondResult.type, "error");
  if (secondResult.type !== "error") return;
  assertEquals(secondResult.error.kind, "ValidationError");
});

Deno.test("createItem accepts event when startAt crosses UTC day boundary", async () => {
  const deps = createDeps();
  const jst = Result.unwrap(parseTimezoneIdentifier("Asia/Tokyo"));
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-21"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-21T00:00:00+09:00")));

  const result = await createItem({
    title: "Morning Event",
    itemType: "event",
    parentDirectory,
    createdAt,
    timezone: jst,
    startAt: Result.unwrap(dateTimeFromDate(new Date("2024-09-20T15:30:00Z"))),
    duration: Result.unwrap(parseDuration("1h")),
  }, deps);

  assertEquals(result.type, "ok");
});

Deno.test("createItem allows event with different date for item directory", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("permanent"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await createItem({
    title: "Sub Event",
    itemType: "event",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
    startAt: Result.unwrap(dateTimeFromDate(new Date("2024-09-25T10:00:00Z"))),
    duration: Result.unwrap(parseDuration("1h")),
  }, deps);

  assertEquals(result.type, "ok");
});
