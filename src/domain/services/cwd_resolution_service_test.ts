import { assert, assertEquals } from "@std/assert";
import { CwdResolutionService } from "./cwd_resolution_service.ts";
import { createItem } from "../models/item.ts";
import { createAlias } from "../models/alias.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { dateTimeFromDate } from "../primitives/date_time.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { parsePlacement } from "../primitives/placement.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { createItemStatus } from "../primitives/item_status.ts";
import { createItemIcon } from "../primitives/item_icon.ts";
import { aliasSlugFromString } from "../primitives/alias_slug.ts";
import type { ItemRepository } from "../repositories/item_repository.ts";
import type { AliasRepository } from "../repositories/alias_repository.ts";
import type { StateRepository } from "../repositories/state_repository.ts";
import type { Alias } from "../models/alias.ts";
import { Result } from "../../shared/result.ts";

const createMockItemRepository = (
  items: Map<string, ReturnType<typeof createItem>>,
): ItemRepository => ({
  load: (id) => {
    const item = items.get(id.toString());
    return Promise.resolve(Result.ok(item));
  },
  save: () => Promise.resolve(Result.ok(undefined)),
  delete: () => Promise.resolve(Result.ok(undefined)),
  listByPlacement: () => Promise.resolve(Result.ok([])),
});

const createMockAliasRepository = (aliases?: Map<string, Alias>): AliasRepository => ({
  load: (slug) => {
    const alias = aliases?.get(slug.toString());
    return Promise.resolve(Result.ok(alias));
  },
  save: () => Promise.resolve(Result.ok(undefined)),
  delete: () => Promise.resolve(Result.ok(undefined)),
  list: () => Promise.resolve(Result.ok([])),
});

const createMockStateRepository = (
  storedCwd?: string,
  shouldSave: boolean = true,
): StateRepository => ({
  loadCwd: () => {
    if (!storedCwd) return Promise.resolve(Result.ok(undefined));
    const parsed = parsePlacement(storedCwd);
    if (parsed.type === "error") return Promise.resolve(Result.ok(undefined));
    return Promise.resolve(Result.ok(parsed.value));
  },
  saveCwd: () =>
    shouldSave ? Promise.resolve(Result.ok(undefined)) : Promise.resolve(Result.ok(undefined)),
});

Deno.test("CwdResolutionService.getCwd returns default today path when nothing is stored", async () => {
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), "2024-06-15");
});

Deno.test("CwdResolutionService.getCwd returns stored CWD when valid", async () => {
  const itemId = itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108");
  assert(itemId.type === "ok");

  const title = itemTitleFromString("Test Item");
  assert(title.type === "ok");

  const createdAt = dateTimeFromDate(new Date("2024-01-01"));
  assert(createdAt.type === "ok");

  const placement = parsePlacement("2024-01-01");
  assert(placement.type === "ok");

  const rank = itemRankFromString("a0");
  assert(rank.type === "ok");

  const item = createItem({
    id: itemId.value,
    title: title.value,
    icon: createItemIcon("note"),
    placement: placement.value,
    rank: rank.value,
    status: createItemStatus("open"),
    createdAt: createdAt.value,
    updatedAt: createdAt.value,
  });

  const items = new Map([[item.data.id.toString(), item]]);
  const stateRepo = createMockStateRepository(item.data.id.toString());
  const itemRepo = createMockItemRepository(items);
  const aliasRepo = createMockAliasRepository();
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "getCwd should succeed");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), item.data.id.toString());
  }
});

Deno.test("CwdResolutionService.getCwd returns stored date path without overwriting", async () => {
  const stateRepo = createMockStateRepository("2024-06-15");
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();
  const today = new Date("2024-11-02");

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(
    result.value.toString(),
    "2024-06-15",
    "stored date placement should be returned as-is, not overwritten with today",
  );
});

Deno.test("CwdResolutionService.getCwd falls back to today when stored item not found", async () => {
  const stateRepo = createMockStateRepository("019965a7-2789-740a-b8c1-1415904fd108");
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const expectedDate = `${year}-${month}-${day}`;

  const result = await CwdResolutionService.getCwd(
    { stateRepository: stateRepo, itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), expectedDate);
});

Deno.test("CwdResolutionService.setCwd validates item path exists", async () => {
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(new Map());
  const aliasRepo = createMockAliasRepository();

  const nonExistentItemPlacement = parsePlacement("019965a7-2789-740a-b8c1-1415904fd108");
  assert(nonExistentItemPlacement.type === "ok");

  const result = await CwdResolutionService.setCwd(
    nonExistentItemPlacement.value,
    { stateRepository: stateRepo, itemRepository: itemRepo },
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

  const datePlacement = parsePlacement("2024-06-15");
  assert(datePlacement.type === "ok");

  const result = await CwdResolutionService.setCwd(
    datePlacement.value,
    { stateRepository: stateRepo, itemRepository: itemRepo },
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

  const placement = parsePlacement("2024-01-01");
  assert(placement.type === "ok");

  const rank = itemRankFromString("a0");
  assert(rank.type === "ok");

  const item = createItem({
    id: itemId.value,
    title: title.value,
    icon: createItemIcon("note"),
    placement: placement.value,
    rank: rank.value,
    status: createItemStatus("open"),
    createdAt: createdAt.value,
    updatedAt: createdAt.value,
  });

  const items = new Map([[item.data.id.toString(), item]]);
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(items);
  const aliasRepo = createMockAliasRepository();

  const itemPlacement = parsePlacement(item.data.id.toString());
  assert(itemPlacement.type === "ok");

  const result = await CwdResolutionService.setCwd(
    itemPlacement.value,
    { stateRepository: stateRepo, itemRepository: itemRepo },
  );

  assert(result.type === "ok", "operation should succeed");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), item.data.id.toString());
  }
});

Deno.test("CwdResolutionService.setCwd allows paths with numeric sections", async () => {
  const itemId = itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108");
  assert(itemId.type === "ok");

  const title = itemTitleFromString("Chapter 1");
  assert(title.type === "ok");

  const createdAt = dateTimeFromDate(new Date("2024-01-01"));
  assert(createdAt.type === "ok");

  const placement = parsePlacement("2024-01-01");
  assert(placement.type === "ok");

  const rank = itemRankFromString("a0");
  assert(rank.type === "ok");

  const aliasSlug = aliasSlugFromString("chapter1");
  assert(aliasSlug.type === "ok");

  const item = createItem({
    id: itemId.value,
    title: title.value,
    icon: createItemIcon("note"),
    placement: placement.value,
    rank: rank.value,
    status: createItemStatus("open"),
    createdAt: createdAt.value,
    updatedAt: createdAt.value,
    alias: aliasSlug.value,
  });

  const alias = createAlias({
    slug: aliasSlug.value,
    itemId: itemId.value,
    createdAt: createdAt.value,
  });

  const items = new Map([[item.data.id.toString(), item]]);
  const aliases = new Map([[alias.data.slug.toString(), alias]]);
  const stateRepo = createMockStateRepository();
  const itemRepo = createMockItemRepository(items);
  const aliasRepo = createMockAliasRepository(aliases);

  // Placement with numeric section: item ID + numeric section
  const placementWithSection = parsePlacement(`${item.data.id.toString()}/1`);
  assert(placementWithSection.type === "ok");

  const result = await CwdResolutionService.setCwd(
    placementWithSection.value,
    { stateRepository: stateRepo, itemRepository: itemRepo },
  );

  assert(result.type === "ok", "setCwd should accept placements with numeric sections");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), `${item.data.id.toString()}/1`);
  }
});
