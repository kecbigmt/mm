import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { MoveItemWorkflow } from "./move_item.ts";
import { CreateItemWorkflow } from "./create_item.ts";
import { Result } from "../../shared/result.ts";
import {
  dateTimeFromDate,
  parsePlacement,
  timezoneIdentifierFromString,
} from "../primitives/mod.ts";
import { createRankService, type RankGenerator } from "../services/rank_service.ts";
import { createIdGenerationService } from "../services/id_generation_service.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { createAliasAutoGenerator, type RandomSource } from "../services/alias_auto_generator.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createTestRankService = () => {
  const generator: RankGenerator = {
    min: () => "a",
    max: () => "z",
    middle: () => "m",
    between: (first, second) => {
      // Simple lexicographic midpoint for testing
      if (first < second) {
        return first + "m";
      }
      return "m";
    },
    next: (rank) => (rank === "z" ? "z" : `${rank}n`), // max stays at max
    prev: (rank) => (rank === "a" ? "a" : `p${rank}`), // min stays at min
    compare: (first, second) => first.localeCompare(second),
  };

  return createRankService(generator);
};

const createFixedIdService = (id: string) =>
  createIdGenerationService({
    generate: () => id,
  });

const createTestAliasAutoGenerator = () => {
  const random: RandomSource = {
    nextInt: (max) => Math.floor(Math.random() * max),
  };
  return createAliasAutoGenerator(random);
};

describe("MoveItemWorkflow", () => {
  it("moves item after another item with correct rank (A > B > C > D, move D after:A -> A > D > B > C)", async () => {
    const itemRepository = new InMemoryItemRepository();
    const aliasRepository = new InMemoryAliasRepository();
    const aliasAutoGenerator = createTestAliasAutoGenerator();
    const rankService = createTestRankService();
    const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    // Create items A, B, C, D
    const itemAResult = await CreateItemWorkflow.execute({
      title: "Item A",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd001"),
    });
    assertEquals(itemAResult.type, "ok");
    const itemA = itemAResult.type === "ok" ? itemAResult.value.item : undefined;
    assertExists(itemA);

    const itemBResult = await CreateItemWorkflow.execute({
      title: "Item B",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd002"),
    });
    assertEquals(itemBResult.type, "ok");
    const itemB = itemBResult.type === "ok" ? itemBResult.value.item : undefined;
    assertExists(itemB);

    const itemCResult = await CreateItemWorkflow.execute({
      title: "Item C",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd003"),
    });
    assertEquals(itemCResult.type, "ok");
    const itemC = itemCResult.type === "ok" ? itemCResult.value.item : undefined;
    assertExists(itemC);

    const itemDResult = await CreateItemWorkflow.execute({
      title: "Item D",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd004"),
    });
    assertEquals(itemDResult.type, "ok");
    const itemD = itemDResult.type === "ok" ? itemDResult.value.item : undefined;
    assertExists(itemD);

    // Verify initial order: A, B, C, D
    const initialListResult = await itemRepository.listByPlacement({
      kind: "single",
      at: parentPlacement,
    });
    assertEquals(initialListResult.type, "ok");
    if (initialListResult.type === "ok") {
      const sortedItems = initialListResult.value.slice().sort((a, b) =>
        rankService.compareRanks(a.data.rank, b.data.rank)
      );
      assertEquals(sortedItems.length, 4);
      assertEquals(sortedItems[0].data.id.toString(), itemA.data.id.toString());
      assertEquals(sortedItems[1].data.id.toString(), itemB.data.id.toString());
      assertEquals(sortedItems[2].data.id.toString(), itemC.data.id.toString());
      assertEquals(sortedItems[3].data.id.toString(), itemD.data.id.toString());
    }

    // Move D after A
    const moveResult = await MoveItemWorkflow.execute({
      itemExpression: itemD.data.id.toString(),
      targetExpression: `after:${itemA.data.id.toString()}`,
      cwd: parentPlacement,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "ok");

    // Verify final order: A, D, B, C
    const finalListResult = await itemRepository.listByPlacement({
      kind: "single",
      at: parentPlacement,
    });
    assertEquals(finalListResult.type, "ok");
    if (finalListResult.type === "ok") {
      const sortedItems = finalListResult.value.slice().sort((a, b) =>
        rankService.compareRanks(a.data.rank, b.data.rank)
      );
      assertEquals(sortedItems.length, 4);
      assertEquals(
        sortedItems[0].data.id.toString(),
        itemA.data.id.toString(),
        "First item should be A",
      );
      assertEquals(
        sortedItems[1].data.id.toString(),
        itemD.data.id.toString(),
        "Second item should be D",
      );
      assertEquals(
        sortedItems[2].data.id.toString(),
        itemB.data.id.toString(),
        "Third item should be B",
      );
      assertEquals(
        sortedItems[3].data.id.toString(),
        itemC.data.id.toString(),
        "Fourth item should be C",
      );
    }
  });

  it("moves item before another item with correct rank (A > B > C > D, move A before:D -> B > C > A > D)", async () => {
    const itemRepository = new InMemoryItemRepository();
    const aliasRepository = new InMemoryAliasRepository();
    const aliasAutoGenerator = createTestAliasAutoGenerator();
    const rankService = createTestRankService();
    const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    // Create items A, B, C, D
    const itemAResult = await CreateItemWorkflow.execute({
      title: "Item A",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd005"),
    });
    assertEquals(itemAResult.type, "ok");
    const itemA = itemAResult.type === "ok" ? itemAResult.value.item : undefined;
    assertExists(itemA);

    const itemBResult = await CreateItemWorkflow.execute({
      title: "Item B",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd006"),
    });
    assertEquals(itemBResult.type, "ok");
    const itemB = itemBResult.type === "ok" ? itemBResult.value.item : undefined;
    assertExists(itemB);

    const itemCResult = await CreateItemWorkflow.execute({
      title: "Item C",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd007"),
    });
    assertEquals(itemCResult.type, "ok");
    const itemC = itemCResult.type === "ok" ? itemCResult.value.item : undefined;
    assertExists(itemC);

    const itemDResult = await CreateItemWorkflow.execute({
      title: "Item D",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd008"),
    });
    assertEquals(itemDResult.type, "ok");
    const itemD = itemDResult.type === "ok" ? itemDResult.value.item : undefined;
    assertExists(itemD);

    // Move A before D
    const moveResult = await MoveItemWorkflow.execute({
      itemExpression: itemA.data.id.toString(),
      targetExpression: `before:${itemD.data.id.toString()}`,
      cwd: parentPlacement,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "ok");

    // Verify final order: B, C, A, D
    const finalListResult = await itemRepository.listByPlacement({
      kind: "single",
      at: parentPlacement,
    });
    assertEquals(finalListResult.type, "ok");
    if (finalListResult.type === "ok") {
      const sortedItems = finalListResult.value.slice().sort((a, b) =>
        rankService.compareRanks(a.data.rank, b.data.rank)
      );
      assertEquals(sortedItems.length, 4);
      assertEquals(
        sortedItems[0].data.id.toString(),
        itemB.data.id.toString(),
        "First item should be B",
      );
      assertEquals(
        sortedItems[1].data.id.toString(),
        itemC.data.id.toString(),
        "Second item should be C",
      );
      assertEquals(
        sortedItems[2].data.id.toString(),
        itemA.data.id.toString(),
        "Third item should be A",
      );
      assertEquals(
        sortedItems[3].data.id.toString(),
        itemD.data.id.toString(),
        "Fourth item should be D",
      );
    }
  });

  it("fails to move to head: when item at minimum rank already exists", async () => {
    const itemRepository = new InMemoryItemRepository();
    const aliasRepository = new InMemoryAliasRepository();
    const aliasAutoGenerator = createTestAliasAutoGenerator();
    const rankService = createTestRankService();
    const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    // Create first item
    const itemAResult = await CreateItemWorkflow.execute({
      title: "Item A",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd009"),
    });
    assertEquals(itemAResult.type, "ok");
    const itemA = itemAResult.type === "ok" ? itemAResult.value.item : undefined;
    assertExists(itemA);

    // Manually move item A to min rank
    const minRank = Result.unwrap(rankService.minRank());
    const relocatedA = itemA.relocate(parentPlacement, minRank, createdAt);
    await itemRepository.save(relocatedA);

    // Create second item
    const itemBResult = await CreateItemWorkflow.execute({
      title: "Item B",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd010"),
    });
    assertEquals(itemBResult.type, "ok");
    const itemB = itemBResult.type === "ok" ? itemBResult.value.item : undefined;
    assertExists(itemB);

    // Try to move item B to head (should fail because A is already at min rank)
    const moveResult = await MoveItemWorkflow.execute({
      itemExpression: itemB.data.id.toString(),
      targetExpression: "head:2024-09-20",
      cwd: parentPlacement,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "error");
    if (moveResult.type === "error") {
      assertEquals(moveResult.error.kind, "ValidationError");
      if ("objectKind" in moveResult.error) {
        assertEquals(moveResult.error.objectKind, "MoveItem");
        assertEquals(moveResult.error.issues[0].code, "no_headroom");
      }
    }
  });

  it("fails to move before: item at minimum rank", async () => {
    const itemRepository = new InMemoryItemRepository();
    const aliasRepository = new InMemoryAliasRepository();
    const aliasAutoGenerator = createTestAliasAutoGenerator();
    const rankService = createTestRankService();
    const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    // Create first item
    const itemAResult = await CreateItemWorkflow.execute({
      title: "Item A",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd011"),
    });
    assertEquals(itemAResult.type, "ok");
    const itemA = itemAResult.type === "ok" ? itemAResult.value.item : undefined;
    assertExists(itemA);

    // Manually move item A to min rank
    const minRank = Result.unwrap(rankService.minRank());
    const relocatedA = itemA.relocate(parentPlacement, minRank, createdAt);
    await itemRepository.save(relocatedA);

    // Create second item
    const itemBResult = await CreateItemWorkflow.execute({
      title: "Item B",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd012"),
    });
    assertEquals(itemBResult.type, "ok");
    const itemB = itemBResult.type === "ok" ? itemBResult.value.item : undefined;
    assertExists(itemB);

    // Try to move item B before A (should fail because A is at min rank and prevRank would return same rank)
    const moveResult = await MoveItemWorkflow.execute({
      itemExpression: itemB.data.id.toString(),
      targetExpression: `before:${itemA.data.id.toString()}`,
      cwd: parentPlacement,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "error");
    if (moveResult.type === "error") {
      assertEquals(moveResult.error.kind, "ValidationError");
      if ("objectKind" in moveResult.error) {
        assertEquals(moveResult.error.objectKind, "MoveItem");
        assertEquals(moveResult.error.issues[0].code, "no_headroom");
      }
    }
  });

  it("fails to move to tail: when item at maximum rank already exists", async () => {
    const itemRepository = new InMemoryItemRepository();
    const aliasRepository = new InMemoryAliasRepository();
    const aliasAutoGenerator = createTestAliasAutoGenerator();

    // Create a test rank service where max rank is reachable
    const generator: RankGenerator = {
      min: () => "a",
      max: () => "z",
      middle: () => "m",
      between: (first, second) => {
        if (first < second) {
          return first + "m";
        }
        return "m";
      },
      next: (rank) => (rank === "z" ? "z" : `${rank}n`), // max stays at max
      prev: (rank) => `p${rank}`,
      compare: (first, second) => first.localeCompare(second),
    };
    const rankService = createRankService(generator);

    const parentPlacement = Result.unwrap(parsePlacement("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    // Create first item
    const itemAResult = await CreateItemWorkflow.execute({
      title: "Item A",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd013"),
    });
    assertEquals(itemAResult.type, "ok");
    const itemA = itemAResult.type === "ok" ? itemAResult.value.item : undefined;
    assertExists(itemA);

    // Create second item (before relocating A to max rank)
    const itemBResult = await CreateItemWorkflow.execute({
      title: "Item B",
      itemType: "note",
      parentPlacement,
      createdAt,
      timezone: TEST_TIMEZONE,
    }, {
      itemRepository,
      aliasRepository,
      aliasAutoGenerator,
      rankService,
      idGenerationService: createFixedIdService("019965a7-2789-740a-b8c1-1415904fd014"),
    });
    assertEquals(itemBResult.type, "ok");
    const itemB = itemBResult.type === "ok" ? itemBResult.value.item : undefined;
    assertExists(itemB);

    // Now manually move item B to max rank by relocating it
    const maxRank = Result.unwrap(rankService.maxRank());
    const relocatedB = itemB.relocate(parentPlacement, maxRank, createdAt);
    await itemRepository.save(relocatedB);

    // Try to move item A to tail (should fail because B is already at max rank)
    const moveResult = await MoveItemWorkflow.execute({
      itemExpression: itemA.data.id.toString(),
      targetExpression: "tail:2024-09-20",
      cwd: parentPlacement,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "error");
    if (moveResult.type === "error") {
      assertEquals(moveResult.error.kind, "ValidationError");
      if ("objectKind" in moveResult.error) {
        assertEquals(moveResult.error.objectKind, "MoveItem");
        assertEquals(moveResult.error.issues[0].code, "no_headroom");
      }
    }
  });
});
