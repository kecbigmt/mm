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
import { createIdGenerationService } from "../services/id_generation_service.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { createAliasAutoGenerator, type RandomSource } from "../services/alias_auto_generator.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";

const TEST_TIMEZONE = Result.unwrap(timezoneIdentifierFromString("UTC"));

const createTestRankService = () => {
  return createLexoRankService();
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

  // Note: Boundary condition tests (head/tail/before/after at min/max ranks)
  // are tested in infrastructure/lexorank/rank_service_test.ts as they are
  // implementation-specific and not part of the workflow's business logic
});
