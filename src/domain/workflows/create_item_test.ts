import { assertEquals } from "@std/assert";
import { CreateItemWorkflow } from "./create_item.ts";
import { Result } from "../../shared/result.ts";
import { createItem, Item } from "../models/item.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parsePath,
} from "../primitives/mod.ts";
import { createRankService, RankGenerator, RankService } from "../services/rank_service.ts";
import { createIdGenerationService } from "../services/id_generation_service.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";

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
  const path = Result.unwrap(parsePath(`/${section}`));
  const itemRank = Result.unwrap(itemRankFromString(rank));
  const createdAt = Result.unwrap(parseDateTime("2024-09-20T12:00:00Z"));

  return createItem({
    id: itemId,
    title,
    icon,
    status,
    path,
    rank: itemRank,
    createdAt,
    updatedAt: createdAt,
  });
};

Deno.test("CreateItemWorkflow assigns middle rank when section is empty", async () => {
  const repository = new InMemoryItemRepository();
  const rankService = createTestRankService();
  const idService = createFixedIdService("019965a7-2789-740a-b8c1-1415904fd120");

  const parentPath = Result.unwrap(parsePath("/2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T12:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "New note",
    itemType: "note",
    parentPath,
    createdAt,
  }, {
    itemRepository: repository,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.rank.toString(), "m");

  const listResult = await repository.listByPath(
    Result.unwrap(parsePath("/2024-09-20")),
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

  const parentPath = Result.unwrap(parsePath("/2024-09-20"));
  const createdAt = Result.unwrap(dateTimeFromDate(new Date("2024-09-20T13:00:00Z")));

  const result = await CreateItemWorkflow.execute({
    title: "Follow-up",
    itemType: "note",
    parentPath,
    createdAt,
  }, {
    itemRepository: repository,
    rankService,
    idGenerationService: idService,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, received ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.item.data.rank.toString(), "mn");

  const listResult = await repository.listByPath(
    Result.unwrap(parsePath("/2024-09-20")),
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
