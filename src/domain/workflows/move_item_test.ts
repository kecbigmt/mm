import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { MoveItemWorkflow } from "./move_item.ts";
import { Result } from "../../shared/result.ts";
import { createItem as createDomainItem, Item } from "../models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDirectory,
} from "../primitives/mod.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";

const createTestRankService = () => {
  return createLexoRankService();
};

const createExistingItem = (id: string, title: string, rank: string, section: string): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const parsedTitle = Result.unwrap(itemTitleFromString(title));
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const directory = Result.unwrap(parseDirectory(section));
  const itemRank = Result.unwrap(itemRankFromString(rank));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  return createDomainItem({
    id: itemId,
    title: parsedTitle,
    icon,
    status,
    directory,
    rank: itemRank,
    createdAt,
    updatedAt: createdAt,
  });
};

describe("MoveItemWorkflow", () => {
  it("moves item after another item with correct rank (A > B > C > D, move D after:A -> A > D > B > C)", async () => {
    const itemRepository = new InMemoryItemRepository();
    const aliasRepository = new InMemoryAliasRepository();
    const rankService = createTestRankService();
    const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    const itemA = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd001",
      "Item A",
      "0|100000:",
      "2024-09-20",
    );
    const itemB = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd002",
      "Item B",
      "0|200000:",
      "2024-09-20",
    );
    const itemC = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd003",
      "Item C",
      "0|300000:",
      "2024-09-20",
    );
    const itemD = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd004",
      "Item D",
      "0|400000:",
      "2024-09-20",
    );
    Result.unwrap(await itemRepository.save(itemA));
    Result.unwrap(await itemRepository.save(itemB));
    Result.unwrap(await itemRepository.save(itemC));
    Result.unwrap(await itemRepository.save(itemD));

    // Verify initial order: A, B, C, D
    const initialListResult = await itemRepository.listByDirectory({
      kind: "single",
      at: parentDirectory,
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
      cwd: parentDirectory,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "ok");

    // Verify final order: A, D, B, C
    const finalListResult = await itemRepository.listByDirectory({
      kind: "single",
      at: parentDirectory,
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
    const rankService = createTestRankService();
    const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
    const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

    const itemA = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd005",
      "Item A",
      "0|100000:",
      "2024-09-20",
    );
    const itemB = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd006",
      "Item B",
      "0|200000:",
      "2024-09-20",
    );
    const itemC = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd007",
      "Item C",
      "0|300000:",
      "2024-09-20",
    );
    const itemD = createExistingItem(
      "019965a7-2789-740a-b8c1-1415904fd008",
      "Item D",
      "0|400000:",
      "2024-09-20",
    );
    Result.unwrap(await itemRepository.save(itemA));
    Result.unwrap(await itemRepository.save(itemB));
    Result.unwrap(await itemRepository.save(itemC));
    Result.unwrap(await itemRepository.save(itemD));

    // Move A before D
    const moveResult = await MoveItemWorkflow.execute({
      itemExpression: itemA.data.id.toString(),
      targetExpression: `before:${itemD.data.id.toString()}`,
      cwd: parentDirectory,
      occurredAt: createdAt,
    }, {
      itemRepository,
      aliasRepository,
      rankService,
    });

    assertEquals(moveResult.type, "ok");

    // Verify final order: B, C, A, D
    const finalListResult = await itemRepository.listByDirectory({
      kind: "single",
      at: parentDirectory,
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
