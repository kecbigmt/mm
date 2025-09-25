import { assertEquals } from "@std/assert";
import { CreateItemWorkflow } from "./create_item.ts";
import { Result } from "../../shared/result.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { Item } from "../models/item.ts";
import { ItemId } from "../primitives/item_id.ts";
import { ItemShortId } from "../primitives/item_short_id.ts";
import { createRootPlacement, createRootPlacementBin, PlacementBin } from "../models/placement.ts";
import { createItem } from "../models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseCalendarDay,
  parseSectionPath,
} from "../primitives/mod.ts";
import { createRankService, RankGenerator, RankService } from "../services/rank_service.ts";
import { createIdGenerationService } from "../services/id_generation_service.ts";
import { parseDateTime } from "../primitives/date_time.ts";

class InMemoryItemRepository implements ItemRepository {
  private readonly items = new Map<string, Item>();

  load(id: ItemId) {
    return Promise.resolve(Result.ok(this.items.get(id.toString())));
  }

  save(item: Item) {
    this.items.set(item.data.id.toString(), item);
    return Promise.resolve(Result.ok(undefined));
  }

  delete(id: ItemId) {
    this.items.delete(id.toString());
    return Promise.resolve(Result.ok(undefined));
  }

  listByPlacementBin(bin: PlacementBin) {
    const siblings = Array.from(this.items.values())
      .filter((item) => item.data.placement.belongsTo(bin))
      .sort((first, second) => first.data.placement.rank.compare(second.data.placement.rank));

    return Promise.resolve(Result.ok(siblings));
  }

  findByShortId(_shortId: ItemShortId) {
    return Promise.resolve(Result.ok(undefined));
  }

  set(item: Item) {
    this.items.set(item.data.id.toString(), item);
  }
}

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

const createExistingItem = (id: string, rank: string, section: string): Item => {
  const itemId = Result.unwrap(itemIdFromString(id));
  const title = Result.unwrap(itemTitleFromString("Existing"));
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const sectionPath = Result.unwrap(parseSectionPath(`:${section}`));
  const placementRank = Result.unwrap(itemRankFromString(rank));
  const placement = createRootPlacement(sectionPath, placementRank);
  const createdAt = Result.unwrap(parseDateTime("2024-09-20T12:00:00Z"));

  return createItem({
    id: itemId,
    title,
    icon,
    status,
    placement,
    createdAt,
    updatedAt: createdAt,
  });
};

Deno.test("CreateItemWorkflow assigns middle rank when section is empty", async () => {
  const repository = new InMemoryItemRepository();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const day = Result.unwrap(parseCalendarDay("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "New note",
    itemType: "note",
    day,
    createdAt,
  }, {
    itemRepository: repository,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.placement.rank.toString(), "m");

  const listResult = await repository.listByPlacementBin(
    createRootPlacementBin(Result.unwrap(parseSectionPath(":2024-09-20"))),
  );
  if (listResult.type !== "ok") {
    throw new Error(`expected ok list result, received ${JSON.stringify(listResult.error)}`);
  }
  assertEquals(listResult.value.length, 1);
});

Deno.test("CreateItemWorkflow appends rank after existing siblings", async () => {
  const repository = new InMemoryItemRepository();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd121");

  const existing = createExistingItem(
    "019965a7-2789-740a-b8c1-1415904fd110",
    "m",
    "2024-09-20",
  );
  Result.unwrap(await repository.save(existing));

  const day = Result.unwrap(parseCalendarDay("2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "Follow-up",
    itemType: "note",
    day,
    createdAt,
  }, {
    itemRepository: repository,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.placement.rank.toString(), "mn");

  const listResult = await repository.listByPlacementBin(
    createRootPlacementBin(Result.unwrap(parseSectionPath(":2024-09-20"))),
  );
  if (listResult.type !== "ok") {
    throw new Error(`expected ok list result, received ${JSON.stringify(listResult.error)}`);
  }
  assertEquals(listResult.value.length, 2);
  assertEquals(
    listResult.value.map((item) => item.data.placement.rank.toString()),
    ["m", "mn"],
  );
});
