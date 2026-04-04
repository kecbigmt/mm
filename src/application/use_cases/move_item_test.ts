import { assertEquals } from "@std/assert";
import { moveItem } from "./move_item.ts";
import { Result } from "../../shared/result.ts";
import { createItem as createDomainItem, Item } from "../../domain/models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDirectory,
} from "../../domain/primitives/mod.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";

const createDeps = () => ({
  itemRepository: new InMemoryItemRepository(),
  aliasRepository: new InMemoryAliasRepository(),
  rankService: createLexoRankService(),
});

const createExistingItem = (id: string, title: string, rank: string, directory: string): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const parsedTitle = Result.unwrap(itemTitleFromString(title));
  const itemDirectory = Result.unwrap(parseDirectory(directory));
  const itemRank = Result.unwrap(itemRankFromString(rank));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  return createDomainItem({
    id: itemId,
    title: parsedTitle,
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    directory: itemDirectory,
    rank: itemRank,
    createdAt,
    updatedAt: createdAt,
  });
};

Deno.test(
  "moveItem returns a presentation-free DTO and preserves ordering for after: placement",
  async () => {
    const deps = createDeps();
    const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
    const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

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
    Result.unwrap(await deps.itemRepository.save(itemA));
    Result.unwrap(await deps.itemRepository.save(itemB));
    Result.unwrap(await deps.itemRepository.save(itemC));
    Result.unwrap(await deps.itemRepository.save(itemD));

    const moveResult = await moveItem({
      itemLocator: itemD.data.id.toString(),
      destination: `after:${itemA.data.id.toString()}`,
      cwd: parentDirectory,
      occurredAt,
    }, deps);

    assertEquals(moveResult.type, "ok");
    if (moveResult.type !== "ok") return;

    assertEquals(moveResult.value.item.id, itemD.data.id.toString());
    assertEquals(moveResult.value.item.title, "Item D");
    assertEquals(moveResult.value.item.directory, "2024-09-20");
    assertEquals(Object.isFrozen(moveResult.value.item), true);

    const finalListResult = await deps.itemRepository.listByDirectory({
      kind: "single",
      at: parentDirectory,
    });
    assertEquals(finalListResult.type, "ok");
    if (finalListResult.type !== "ok") return;

    const sortedItems = finalListResult.value.slice().sort((a, b) =>
      deps.rankService.compareRanks(a.data.rank, b.data.rank)
    );
    assertEquals(sortedItems.map((item) => item.data.id.toString()), [
      itemA.data.id.toString(),
      itemD.data.id.toString(),
      itemB.data.id.toString(),
      itemC.data.id.toString(),
    ]);
  },
);

Deno.test("moveItem preserves ordering for before: placement", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

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
  Result.unwrap(await deps.itemRepository.save(itemA));
  Result.unwrap(await deps.itemRepository.save(itemB));
  Result.unwrap(await deps.itemRepository.save(itemC));
  Result.unwrap(await deps.itemRepository.save(itemD));

  const moveResult = await moveItem({
    itemLocator: itemA.data.id.toString(),
    destination: `before:${itemD.data.id.toString()}`,
    cwd: parentDirectory,
    occurredAt,
  }, deps);

  assertEquals(moveResult.type, "ok");
  if (moveResult.type !== "ok") return;

  const finalListResult = await deps.itemRepository.listByDirectory({
    kind: "single",
    at: parentDirectory,
  });
  assertEquals(finalListResult.type, "ok");
  if (finalListResult.type !== "ok") return;

  const sortedItems = finalListResult.value.slice().sort((a, b) =>
    deps.rankService.compareRanks(a.data.rank, b.data.rank)
  );
  assertEquals(sortedItems.map((item) => item.data.id.toString()), [
    itemB.data.id.toString(),
    itemC.data.id.toString(),
    itemA.data.id.toString(),
    itemD.data.id.toString(),
  ]);
});

Deno.test("moveItem maps invalid item locators to ValidationError", async () => {
  const deps = createDeps();
  const parentDirectory = Result.unwrap(parseDirectory("2024-09-20"));
  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const moveResult = await moveItem({
    itemLocator: "[]",
    destination: "2024-09-21",
    cwd: parentDirectory,
    occurredAt,
  }, deps);

  assertEquals(moveResult.type, "error");
  if (moveResult.type !== "error") return;
  assertEquals(moveResult.error.kind, "ValidationError");
  if (moveResult.error.kind !== "ValidationError") return;
  assertEquals(moveResult.error.objectKind, "MoveItem");
  assertEquals(moveResult.error.issues[0]?.path, ["itemLocator"]);
});
