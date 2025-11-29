import { assert, assertEquals } from "@std/assert";
import { CreateItemWorkflow } from "./create_item.ts";
import { Result } from "../../shared/result.ts";
import { createItem, Item } from "../models/item.ts";
import {
  aliasSlugFromString,
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDuration,
  parsePlacement,
  timezoneIdentifierFromString,
} from "../primitives/mod.ts";
import { createRankService, RankGenerator, RankService } from "../services/rank_service.ts";
import { createIdGenerationService } from "../services/id_generation_service.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import {
  AliasAutoGenerator,
  createAliasAutoGenerator,
  RandomSource,
} from "../services/alias_auto_generator.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createTestRankService = (): RankService => {
  const generator: RankGenerator = {
    min: () => "a",
    max: () => "z",
    middle: () => "m",
    between: (first) => `${first}n`,
    next: (rank) => `${rank}n`,
    prev: (rank) => `${rank}p`,
    compare: (first, second) => first.localeCompare(second),
  };

  return createRankService(generator);
};

const createFixedIdService = (id: string) =>
  createIdGenerationService({
    generate: () => id,
  });

const createTestAliasAutoGenerator = (): AliasAutoGenerator => {
  const random: RandomSource = {
    nextInt: (max) => Math.floor(Math.random() * max),
  };
  return createAliasAutoGenerator(random);
};

const createExistingItem = (id: string, rank: string, section: string): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const title = Result.unwrap(itemTitleFromString("Existing"));
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const placement = Result.unwrap(parsePlacement(section));
  const itemRank = Result.unwrap(itemRankFromString(rank));
  const createdAt = Result.unwrap(parseDateTime("2024-09-20T12:00:00Z"));

  return createItem({
    id: itemId,
    title,
    icon,
    status,
    placement,
    rank: itemRank,
    createdAt,
    updatedAt: createdAt,
  });
};

Deno.test("CreateItemWorkflow assigns middle rank when section is empty", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "New note",
    itemType: "note",
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.rank.toString(), "m");

  const listResult = await repository.listByPlacement(
    { kind: "single", at: Result.unwrap(parsePlacement("2024-09-20")) },
  );
  if (listResult.type !== "ok") {
    throw new Error(`expected ok list result, received ${JSON.stringify(listResult.error)}`);
  }
  assertEquals(listResult.value.length, 1);
});

Deno.test("CreateItemWorkflow appends rank after existing siblings", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121");

  const existing = createExistingItem(
    "019965a7-2789-740a-b8c1-1415904fd110",
    "m",
    "2024-09-20",
  );
  Result.unwrap(await repository.save(existing));

  const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "Follow-up",
    itemType: "note",
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.rank.toString(), "mn");

  const listResult = await repository.listByPlacement(
    { kind: "single", at: Result.unwrap(parsePlacement("2024-09-20")) },
  );
  if (listResult.type !== "ok") {
    throw new Error(`expected ok list result, received ${JSON.stringify(listResult.error)}`);
  }
  assertEquals(listResult.value.length, 2);
  assertEquals(
    listResult.value.map((item) => item.data.rank.toString()),
    ["m", "mn"],
  );
});

Deno.test("CreateItemWorkflow saves alias when provided", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "Chapter 1",
    itemType: "note",
    alias: "chapter1",
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  // Verify alias is set on item
  assertEquals(result.value.item.data.alias?.toString(), "chapter1");

  // Verify alias is saved in repository
  const aliasSlug = Result.unwrap(aliasSlugFromString("chapter1"));
  const aliasResult = await aliasRepository.load(aliasSlug);
  if (aliasResult.type !== "ok" || !aliasResult.value) {
    throw new Error("alias should be saved");
  }
  assertEquals(aliasResult.value.data.itemId.toString(), "019965a7-2789-740a-b8c1-1415904fd120");
});

Deno.test("CreateItemWorkflow rejects duplicate alias", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService1 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");
  const idService2 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121");

  const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  // Create first item with alias
  const firstResult = await CreateItemWorkflow.execute({
    title: "First",
    itemType: "note",
    alias: "chapter1",
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService1,
  });

  if (firstResult.type !== "ok") {
    throw new Error(`first item creation should succeed`);
  }

  // Try to create second item with same alias
  const secondResult = await CreateItemWorkflow.execute({
    title: "Second",
    itemType: "note",
    alias: "chapter1",
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService2,
  });

  if (secondResult.type === "ok") {
    throw new Error("should reject duplicate alias");
  }

  assertEquals(secondResult.error.kind, "validation");
  if (secondResult.error.kind === "validation") {
    assertEquals(
      secondResult.error.issues.some((issue) => issue.message.includes("already exists")),
      true,
    );
  }
});

// CreateItemWorkflow with scheduling fields
Deno.test("CreateItemWorkflow - creates task with dueAt", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentPlacement = Result.unwrap(parsePlacement("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00Z"));
  const dueAt = Result.unwrap(parseDateTime("2025-01-20T23:59:59Z"));

  const result = await CreateItemWorkflow.execute({
    title: "Review PR",
    itemType: "task",
    dueAt,
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.dueAt, dueAt);
});

Deno.test("CreateItemWorkflow - creates event with startAt and duration", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentPlacement = Result.unwrap(parsePlacement("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00Z"));
  const startAt = Result.unwrap(parseDateTime("2025-01-15T14:00:00Z"));
  const duration = Result.unwrap(parseDuration("2h"));

  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt,
    duration,
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.startAt, startAt);
  assertEquals(result.value.item.data.duration, duration);
});

Deno.test("CreateItemWorkflow - rejects event with mismatched startAt date", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentPlacement = Result.unwrap(parsePlacement("2025-01-16"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-16T10:00:00Z"));
  const startAt = Result.unwrap(parseDateTime("2025-01-15T14:00:00Z")); // Wrong date

  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt,
    parentPlacement,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "validation");
    if (result.error.kind === "validation") {
      assert(result.error.issues.some((i) => i.code === "date_time_inconsistency"));
    }
  }
});

Deno.test("CreateItemWorkflow - allows event with different date for item placement", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService1 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd110");
  const idService2 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  // Create a parent item under a date
  const parentItemResult = await CreateItemWorkflow.execute({
    title: "Project",
    itemType: "note",
    parentPlacement: Result.unwrap(parsePlacement("2025-01-10")),
    createdAt: Result.unwrap(parseDateTime("2025-01-10T10:00:00Z")),
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService1,
  });

  if (parentItemResult.type !== "ok") {
    throw new Error("Failed to create parent item");
  }

  const parentId = parentItemResult.value.item.data.id;
  const itemPlacement = Result.unwrap(parsePlacement(parentId.toString()));
  const startAt = Result.unwrap(parseDateTime("2025-01-15T14:00:00Z")); // Different date - OK for item placement

  // Create event under item placement with different date
  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt,
    parentPlacement: itemPlacement,
    createdAt: Result.unwrap(parseDateTime("2025-01-15T10:00:00Z")),
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService2,
  });

  // Should succeed because validation is skipped for item placements
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.item.data.startAt, startAt);
  }
});
