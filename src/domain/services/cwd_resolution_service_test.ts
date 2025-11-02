import { assert, assertEquals } from "@std/assert";
import { CwdResolutionService } from "./cwd_resolution_service.ts";
import { createItem } from "../models/item.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { dateTimeFromDate } from "../primitives/date_time.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { parsePath } from "../primitives/path.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { createItemStatus } from "../primitives/item_status.ts";
import { createItemIcon } from "../primitives/item_icon.ts";
import type { ItemRepository } from "../repositories/item_repository.ts";
import type { AliasRepository } from "../repositories/alias_repository.ts";
import type { StateRepository } from "../repositories/state_repository.ts";
import { Result } from "../../shared/result.ts";

const createMockItemRepository = (items: Map<string, ReturnType<typeof createItem>>): ItemRepository => ({
  load: async (id) => {
    const item = items.get(id.toString());
    return Result.ok(item);
  },
  save: async () => Result.ok(undefined),
  delete: async () => Result.ok(undefined),
  listByPath: async () => Result.ok([]),
});

const createMockAliasRepository = (): AliasRepository => ({
  load: async () => Result.ok(undefined),
  save: async () => Result.ok(undefined),
  delete: async () => Result.ok(undefined),
  list: async () => Result.ok([]),
});

const createMockStateRepository = (
  storedCwd?: string,
  shouldSave: boolean = true,
): StateRepository => ({
  loadCwd: async () => {
    if (!storedCwd) return Result.ok(undefined);
    const parsed = parsePath(storedCwd);
    if (parsed.type === "error") return Result.ok(undefined);
    return Result.ok(parsed.value);
  },
  saveCwd: async () => shouldSave ? Result.ok(undefined) : Result.ok(undefined),
});

Deno.test("CwdResolutionService.getCwd returns default today path when nothing is stored", async () => {
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), "/2024-06-15");
});

Deno.test("CwdResolutionService.getCwd returns stored CWD when valid", async () => {
  const itemId = itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108");
  assert(itemId.type === "ok");

  const title = itemTitleFromString("Test Item");
  assert(title.type === "ok");

  const createdAt = dateTimeFromDate(new Date("2024-01-01"));
  assert(createdAt.type === "ok");

  const path = parsePath("/2024-01-01");
  assert(path.type === "ok");

  const rank = itemRankFromString("a0");
  assert(rank.type === "ok");

  const item = createItem({
    id: itemId.value,
    title: title.value,
    icon: createItemIcon("note"),
    path: path.value,
    rank: rank.value,
    status: createItemStatus("open"),
    createdAt: createdAt.value,
    updatedAt: createdAt.value,
  });

  const items = new Map([[item.data.id.toString(), item]]);
  const stateRepo = createMockStateRepository(`/${item.data.id.toString()}`);
  const itemRepo = createMockItemRepository(items);
  const aliasRepo = createMockAliasRepository();
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
    today,
  );

  assert(result.type === "ok", "getCwd should succeed");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), `/${item.data.id.toString()}`);
  }
});

Deno.test("CwdResolutionService.getCwd returns stored date path without overwriting", async () => {
  const stateRepo = createMockStateRepository("/2024-06-15");
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();
  const today = new Date("2024-11-02");

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), "/2024-06-15", "stored date path should be returned as-is, not overwritten with today");
});

Deno.test("CwdResolutionService.getCwd falls back to today when stored item not found", async () => {
  const stateRepo = createMockStateRepository("/019965a7-2789-740a-b8c1-1415904fd108");
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const expectedDate = `/${year}-${month}-${day}`;

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), expectedDate);
});

Deno.test("CwdResolutionService.setCwd validates item path exists", async () => {
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();

  const nonExistentItemPath = parsePath("/019965a7-2789-740a-b8c1-1415904fd108");
  assert(nonExistentItemPath.type === "ok");

  const result = await CwdResolutionService.setCwd(
    nonExistentItemPath.value,
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
  );

  assert(result.type === "error", "setCwd should fail for non-existent item");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
  }
});

Deno.test("CwdResolutionService.setCwd allows date paths", async () => {
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();

  const datePath = parsePath("/2024-06-15");
  assert(datePath.type === "ok");

  const result = await CwdResolutionService.setCwd(
    datePath.value,
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
  );

  assert(result.type === "ok", "operation should succeed");
});

Deno.test("CwdResolutionService.setCwd allows valid item paths", async () => {
  const itemId = itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108");
  assert(itemId.type === "ok");

  const title = itemTitleFromString("Test Item");
  assert(title.type === "ok");

  const createdAt = dateTimeFromDate(new Date("2024-01-01"));
  assert(createdAt.type === "ok");

  const path = parsePath("/2024-01-01");
  assert(path.type === "ok");

  const rank = itemRankFromString("a0");
  assert(rank.type === "ok");

  const item = createItem({
    id: itemId.value,
    title: title.value,
    icon: createItemIcon("note"),
    path: path.value,
    rank: rank.value,
    status: createItemStatus("open"),
    createdAt: createdAt.value,
    updatedAt: createdAt.value,
  });

  const items = new Map([[item.data.id.toString(), item]]);
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(items);
  const aliasRepo = createMockAliasRepository();

  const itemPath = parsePath(`/${item.data.id.toString()}`);
  assert(itemPath.type === "ok");

  const result = await CwdResolutionService.setCwd(
    itemPath.value,
    { stateRepository: stateRepo, itemRepository: itemRepo, aliasRepository: aliasRepo },
  );

  assert(result.type === "ok", "operation should succeed");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), `/${item.data.id.toString()}`);
  }
});

