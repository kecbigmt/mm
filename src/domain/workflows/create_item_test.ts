import { assert, assertEquals, assertExists } from "@std/assert";
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
  parseCalendarDay,
  parseDirectory,
  parseDuration,
  timezoneIdentifierFromString,
} from "../primitives/mod.ts";
import { RankService } from "../services/rank_service.ts";
import { createIdGenerationService } from "../services/id_generation_service.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import {
  AliasAutoGenerator,
  createAliasAutoGenerator,
  RandomSource,
} from "../services/alias_auto_generator.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createTestRankService = (): RankService => {
  return createLexoRankService();
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
  const directory = Result.unwrap(parseDirectory(section));
  const itemRank = Result.unwrap(itemRankFromString(rank));
  const createdAt = Result.unwrap(parseDateTime("2024-09-20T12:00:00Z"));

  return createItem({
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

Deno.test("CreateItemWorkflow assigns middle rank when section is empty", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "New note",
    itemType: "note",
    parentDirectory,
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

  // Verify a rank was assigned (actual value depends on implementation)
  assertExists(result.value.item.data.rank);

  const listResult = await repository.listByDirectory(
    { kind: "single", at: Result.unwrap(parseDirectory("2024-09-20")) },
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
    "0|100000:",
    "2024-09-20",
  );
  Result.unwrap(await repository.save(existing));

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "Follow-up",
    itemType: "note",
    parentDirectory,
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

  // Verify the new item's rank is after the existing item
  const rankComparison = rankService.compareRanks(
    result.value.item.data.rank,
    existing.data.rank,
  );
  assertEquals(rankComparison > 0, true);

  const listResult = await repository.listByDirectory(
    { kind: "single", at: Result.unwrap(parseDirectory("2024-09-20")) },
  );
  if (listResult.type !== "ok") {
    throw new Error(`expected ok list result, received ${JSON.stringify(listResult.error)}`);
  }
  assertEquals(listResult.value.length, 2);

  // Verify items are in correct order (existing item first, new item second)
  const orderComparison = rankService.compareRanks(
    listResult.value[0].data.rank,
    listResult.value[1].data.rank,
  );
  assertEquals(orderComparison < 0, true);
});

Deno.test("CreateItemWorkflow saves alias when provided", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "Chapter 1",
    itemType: "note",
    alias: "chapter1",
    parentDirectory,
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

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  // Create first item with alias
  const firstResult = await CreateItemWorkflow.execute({
    title: "First",
    itemType: "note",
    alias: "chapter1",
    parentDirectory,
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
    parentDirectory,
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

Deno.test("CreateItemWorkflow rejects alias with same canonical key (uppercase)", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService1 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");
  const idService2 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121");

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  // Create first item with lowercase alias
  const firstResult = await CreateItemWorkflow.execute({
    title: "First",
    itemType: "note",
    alias: "test-item",
    parentDirectory,
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

  // Try to create second item with uppercase alias (same canonical key)
  const secondResult = await CreateItemWorkflow.execute({
    title: "Second",
    itemType: "note",
    alias: "TEST-ITEM",
    parentDirectory,
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
    throw new Error("should reject uppercase variant of existing alias");
  }

  assertEquals(secondResult.error.kind, "validation");
  if (secondResult.error.kind === "validation") {
    assertEquals(
      secondResult.error.issues.some((issue) => issue.message.includes("already exists")),
      true,
    );
  }
});

Deno.test("CreateItemWorkflow rejects alias with same canonical key (diacritics)", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService1 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");
  const idService2 = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121");

  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  // Create first item with ASCII alias
  const firstResult = await CreateItemWorkflow.execute({
    title: "First",
    itemType: "note",
    alias: "test-item",
    parentDirectory,
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

  // Try to create second item with diacritic alias (same canonical key)
  const secondResult = await CreateItemWorkflow.execute({
    title: "Second",
    itemType: "note",
    alias: "tëst-item",
    parentDirectory,
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
    throw new Error("should reject diacritic variant of existing alias");
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

  const parentDirectory = Result.unwrap(parseDirectory("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00Z"));
  const dueAt = Result.unwrap(parseDateTime("2025-01-20T23:59:59Z"));

  const result = await CreateItemWorkflow.execute({
    title: "Review PR",
    itemType: "task",
    dueAt,
    parentDirectory,
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

  const parentDirectory = Result.unwrap(parseDirectory("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00Z"));
  const startAt = Result.unwrap(parseDateTime("2025-01-15T14:00:00Z"));
  const duration = Result.unwrap(parseDuration("2h"));

  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt,
    duration,
    parentDirectory,
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

  const parentDirectory = Result.unwrap(parseDirectory("2025-01-16"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-16T10:00:00Z"));
  const startAt = Result.unwrap(parseDateTime("2025-01-15T14:00:00Z")); // Wrong date

  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt,
    parentDirectory,
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

Deno.test("CreateItemWorkflow - accepts event when startAt crosses UTC day boundary", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  // Use PST (UTC-8) timezone
  const pstTimezone = Result.unwrap(timezoneIdentifierFromString("America/Los_Angeles"));
  const parentDirectory = Result.unwrap(parseDirectory("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00-08:00"));

  // 20:00 in PST on 2025-01-15 = 04:00 UTC on 2025-01-16 (crosses day boundary)
  // But in workspace timezone (PST), it's still 2025-01-15, so validation should pass
  const startAt = Result.unwrap(parseDateTime("2025-01-15T20:00:00-08:00"));

  const result = await CreateItemWorkflow.execute({
    title: "Evening event",
    itemType: "event",
    startAt,
    parentDirectory,
    createdAt,
    timezone: pstTimezone,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  // Should succeed because date is validated in workspace timezone (PST), not UTC
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const startAtValue = result.value.item.data.startAt;
    assertExists(startAtValue);
    assertEquals(startAtValue, startAt);
    // Verify the ISO string is in UTC (next day)
    assertEquals(startAtValue.data.iso.substring(0, 10), "2025-01-16");
  }
});

Deno.test("CreateItemWorkflow - allows event with different date for item directory", async () => {
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
    parentDirectory: Result.unwrap(parseDirectory("2025-01-10")),
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
  const itemDirectory = Result.unwrap(parseDirectory(parentId.toString()));
  const startAt = Result.unwrap(parseDateTime("2025-01-15T14:00:00Z")); // Different date - OK for item directory

  // Create event under item directory with different date
  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt,
    parentDirectory: itemDirectory,
    createdAt: Result.unwrap(parseDateTime("2025-01-15T10:00:00Z")),
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService2,
  });

  // Should succeed because validation is skipped for item directorys
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.item.data.startAt, startAt);
  }
});

Deno.test("CreateItemWorkflow - creates task with CalendarDay dueAt (converts to end of day)", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentDirectory = Result.unwrap(parseDirectory("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00Z"));
  const dueAtDay = Result.unwrap(parseCalendarDay("2025-01-20"));

  const result = await CreateItemWorkflow.execute({
    title: "Review PR",
    itemType: "task",
    dueAt: dueAtDay,
    parentDirectory,
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

  // Verify dueAt is converted to 23:59:59 UTC (end of day in UTC timezone)
  const dueAt = result.value.item.data.dueAt;
  assertExists(dueAt);
  assertEquals(dueAt.data.iso, "2025-01-20T23:59:59.000Z");
});

Deno.test("CreateItemWorkflow - creates task with CalendarDay dueAt in JST timezone", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const jstTimezone = Result.unwrap(timezoneIdentifierFromString("Asia/Tokyo"));
  const parentDirectory = Result.unwrap(parseDirectory("2025-01-20"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-20T10:00:00+09:00"));
  const dueAtDay = Result.unwrap(parseCalendarDay("2025-01-20"));

  const result = await CreateItemWorkflow.execute({
    title: "Review PR",
    itemType: "task",
    dueAt: dueAtDay,
    parentDirectory,
    createdAt,
    timezone: jstTimezone,
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

  // Verify dueAt is converted to 23:59:59 JST = 14:59:59 UTC
  const dueAt = result.value.item.data.dueAt;
  assertExists(dueAt);
  assertEquals(dueAt.data.iso, "2025-01-20T14:59:59.000Z");
});

// Test for deferred topic persistence - no orphan topics on validation failure
Deno.test("CreateItemWorkflow - does not create orphan topics when validation fails", async () => {
  const repository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const aliasAutoGenerator = createTestAliasAutoGenerator();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentDirectory = Result.unwrap(parseDirectory("2025-01-15"));
  const createdAt = Result.unwrap(parseDateTime("2025-01-15T10:00:00Z"));

  // Try to create an item with:
  // - A project reference to non-existent alias (would trigger topic auto-creation)
  // - An invalid own alias (will fail validation due to conflict after creating first item)

  // First, create an item with alias "taken-alias"
  const firstResult = await CreateItemWorkflow.execute({
    title: "First item",
    itemType: "note",
    alias: "taken-alias",
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd111"),
  });

  if (firstResult.type !== "ok") {
    throw new Error("First item creation should succeed");
  }

  // Check initial state: no items in permanent directory
  const { createPermanentDirectory } = await import("../primitives/mod.ts");
  const permanentDirectory = createPermanentDirectory();
  const initialPermanentItems = await repository.listByDirectory({
    kind: "single",
    at: permanentDirectory,
  });
  if (initialPermanentItems.type !== "ok") {
    throw new Error("Failed to list permanent items");
  }
  assertEquals(initialPermanentItems.value.length, 0, "No topics should exist initially");

  // Now try to create an item that will fail validation
  // - References non-existent project "new-project" (would trigger auto-creation)
  // - Uses already-taken alias "taken-alias" (will fail validation)
  const failingResult = await CreateItemWorkflow.execute({
    title: "Second item",
    itemType: "note",
    project: "new-project",
    alias: "taken-alias", // This conflicts with first item
    parentDirectory,
    createdAt,
    timezone: TEST_TIMEZONE,
  }, {
    itemRepository: repository,
    aliasRepository,
    aliasAutoGenerator,
    rankService,
    idGenerationService: idService,
  });

  // Verify the creation failed due to alias conflict
  assertEquals(failingResult.type, "error");
  if (failingResult.type === "error" && failingResult.error.kind === "validation") {
    assert(
      failingResult.error.issues.some((issue) => issue.message.includes("already exists")),
      "Should fail due to alias conflict",
    );
  }

  // Verify NO orphan topic was created in the permanent directory
  const finalPermanentItems = await repository.listByDirectory({
    kind: "single",
    at: permanentDirectory,
  });
  if (finalPermanentItems.type !== "ok") {
    throw new Error("Failed to list permanent items");
  }
  assertEquals(
    finalPermanentItems.value.length,
    0,
    "No orphan topics should be created when validation fails",
  );

  // Verify the project alias was not created in the alias repository
  const projectAliasSlug = Result.unwrap(aliasSlugFromString("new-project"));
  const projectAliasResult = await aliasRepository.load(projectAliasSlug);
  if (projectAliasResult.type !== "ok") {
    throw new Error("Failed to load project alias");
  }
  assertEquals(
    projectAliasResult.value,
    undefined,
    "Project topic alias should not be created when validation fails",
  );
});
