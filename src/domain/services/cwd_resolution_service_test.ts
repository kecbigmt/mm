import { assert, assertEquals } from "@std/assert";
import { CwdResolutionService } from "./cwd_resolution_service.ts";
import { createItem } from "../models/item.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { dateTimeFromDate } from "../primitives/date_time.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { parsePlacement } from "../primitives/placement.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { createItemStatus } from "../primitives/item_status.ts";
import { createItemIcon } from "../primitives/item_icon.ts";
import { aliasSlugFromString } from "../primitives/alias_slug.ts";
import type { ItemRepository } from "../repositories/item_repository.ts";
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

// ============================================================================
// getCwd tests - reads from MM_CWD environment variable
// ============================================================================

Deno.test("CwdResolutionService.getCwd returns today when MM_CWD is not set", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => undefined, itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.placement.toString(), "2024-06-15");
  assertEquals(result.value.warning, undefined);
});

Deno.test("CwdResolutionService.getCwd returns today when MM_CWD is empty", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => "", itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.placement.toString(), "2024-06-15");
  assertEquals(result.value.warning, undefined);
});

Deno.test("CwdResolutionService.getCwd returns placement from MM_CWD when set to date", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => "2024-12-25", itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.placement.toString(), "2024-12-25");
  assertEquals(result.value.warning, undefined);
});

Deno.test("CwdResolutionService.getCwd returns placement from MM_CWD with sections", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => "2024-12-25/1/3", itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.placement.toString(), "2024-12-25/1/3");
  assertEquals(result.value.warning, undefined);
});

Deno.test("CwdResolutionService.getCwd returns placement from MM_CWD for permanent", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => "permanent", itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.placement.toString(), "permanent");
  assertEquals(result.value.warning, undefined);
});

Deno.test("CwdResolutionService.getCwd returns placement from MM_CWD for valid item", async () => {
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
  const itemRepo = createMockItemRepository(items);
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => item.data.id.toString(), itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "getCwd should succeed");
  assertEquals(result.value.placement.toString(), item.data.id.toString());
  assertEquals(result.value.warning, undefined);
});

Deno.test("CwdResolutionService.getCwd falls back to today with warning when MM_CWD is invalid", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => "not-a-valid-placement", itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed with fallback");
  assertEquals(result.value.placement.toString(), "2024-06-15");
  assert(result.value.warning !== undefined, "should have a warning");
  assert(result.value.warning.includes("MM_CWD"), "warning should mention MM_CWD");
});

Deno.test("CwdResolutionService.getCwd falls back to today with warning when item not found", async () => {
  const itemRepo = createMockItemRepository(new Map());
  const today = new Date("2024-06-15");

  const result = await CwdResolutionService.getCwd(
    { getEnv: () => "019965a7-2789-740a-b8c1-1415904fd108", itemRepository: itemRepo },
    today,
  );

  assert(result.type === "ok", "operation should succeed with fallback");
  assertEquals(result.value.placement.toString(), "2024-06-15");
  assert(result.value.warning !== undefined, "should have a warning");
});

// ============================================================================
// validatePlacement tests - validates placement without persisting
// ============================================================================

Deno.test("CwdResolutionService.validatePlacement allows date placements", async () => {
  const itemRepo = createMockItemRepository(new Map());

  const datePlacement = parsePlacement("2024-06-15");
  assert(datePlacement.type === "ok");

  const result = await CwdResolutionService.validatePlacement(
    datePlacement.value,
    { itemRepository: itemRepo },
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), "2024-06-15");
});

Deno.test("CwdResolutionService.validatePlacement allows permanent placements", async () => {
  const itemRepo = createMockItemRepository(new Map());

  const permanentPlacement = parsePlacement("permanent");
  assert(permanentPlacement.type === "ok");

  const result = await CwdResolutionService.validatePlacement(
    permanentPlacement.value,
    { itemRepository: itemRepo },
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), "permanent");
});

Deno.test("CwdResolutionService.validatePlacement rejects non-existent item", async () => {
  const itemRepo = createMockItemRepository(new Map());

  const nonExistentItemPlacement = parsePlacement("019965a7-2789-740a-b8c1-1415904fd108");
  assert(nonExistentItemPlacement.type === "ok");

  const result = await CwdResolutionService.validatePlacement(
    nonExistentItemPlacement.value,
    { itemRepository: itemRepo },
  );

  assert(result.type === "error", "should fail for non-existent item");
  assertEquals(result.error.kind, "ValidationError");
});

Deno.test("CwdResolutionService.validatePlacement allows valid item paths", async () => {
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
  const itemRepo = createMockItemRepository(items);

  const itemPlacement = parsePlacement(item.data.id.toString());
  assert(itemPlacement.type === "ok");

  const result = await CwdResolutionService.validatePlacement(
    itemPlacement.value,
    { itemRepository: itemRepo },
  );

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.toString(), item.data.id.toString());
});

Deno.test("CwdResolutionService.validatePlacement allows paths with numeric sections", async () => {
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

  const items = new Map([[item.data.id.toString(), item]]);
  const itemRepo = createMockItemRepository(items);

  const placementWithSection = parsePlacement(`${item.data.id.toString()}/1`);
  assert(placementWithSection.type === "ok");

  const result = await CwdResolutionService.validatePlacement(
    placementWithSection.value,
    { itemRepository: itemRepo },
  );

  assert(result.type === "ok", "should accept placements with numeric sections");
  assertEquals(result.value.toString(), `${item.data.id.toString()}/1`);
});
