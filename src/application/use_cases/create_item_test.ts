import { assertEquals, assertExists } from "@std/assert";
import { createItem } from "./create_item.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import {
  aliasSlugFromString,
  dateTimeFromDate,
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
