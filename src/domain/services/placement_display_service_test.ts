import { assert, assertEquals } from "@std/assert";
import {
  formatPlacementForDisplay,
  placementToResolvedGraphPath,
} from "./placement_display_service.ts";
import { createItem } from "../models/item.ts";
import { itemTitleFromString } from "../primitives/item_title.ts";
import { dateTimeFromDate } from "../primitives/date_time.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { createPermanentPlacement, parsePlacement } from "../primitives/placement.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";
import { createItemStatus } from "../primitives/item_status.ts";
import { createItemIcon } from "../primitives/item_icon.ts";
import { aliasSlugFromString } from "../primitives/alias_slug.ts";
import type { ItemRepository } from "../repositories/item_repository.ts";
import { Result } from "../../shared/result.ts";

const unwrap = Result.unwrap;

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
// Criterion 1: Display permanent placement as /permanent
// ============================================================================

Deno.test("placementToResolvedGraphPath - converts permanent placement to /permanent", async () => {
  const placement = createPermanentPlacement();
  const itemRepo = createMockItemRepository(new Map());

  const result = await placementToResolvedGraphPath(placement, { itemRepository: itemRepo });

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value.segments.length, 1);
  assertEquals(result.value.segments[0].kind, "permanent");
});

Deno.test("formatPlacementForDisplay - formats permanent placement as /permanent", async () => {
  const placement = createPermanentPlacement();
  const itemRepo = createMockItemRepository(new Map());

  const result = await formatPlacementForDisplay(placement, { itemRepository: itemRepo });

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value, "/permanent");
});

// ============================================================================
// Criterion 2: Display permanent items with alias as /permanent/<alias>
// ============================================================================

Deno.test("formatPlacementForDisplay - formats permanent item with alias as /permanent/<alias>", async () => {
  const itemId = unwrap(itemIdFromString("019bdfaa-9922-7d88-9794-b8b013cd5609"));
  const items = new Map<string, ReturnType<typeof createItem>>();

  const item = createItem({
    id: itemId,
    title: unwrap(itemTitleFromString("My Topic")),
    icon: createItemIcon("note"),
    status: createItemStatus("open"),
    placement: createPermanentPlacement(),
    rank: unwrap(itemRankFromString("aaa")),
    createdAt: unwrap(dateTimeFromDate(new Date("2026-01-21T00:00:00Z"))),
    updatedAt: unwrap(dateTimeFromDate(new Date("2026-01-21T00:00:00Z"))),
    alias: unwrap(aliasSlugFromString("my-topic")),
  });
  items.set(itemId.toString(), item);

  const itemRepo = createMockItemRepository(items);

  // Placement is "under" the permanent item (item head pointing to the permanent item)
  const itemPlacement = unwrap(parsePlacement(itemId.toString()));

  const result = await formatPlacementForDisplay(itemPlacement, { itemRepository: itemRepo });

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value, "/permanent/my-topic");
});

// ============================================================================
// Criterion 2b: Display permanent items without alias as /permanent/<uuid>
// ============================================================================

Deno.test("formatPlacementForDisplay - formats permanent item without alias as /permanent/<uuid>", async () => {
  const itemId = unwrap(itemIdFromString("019bdfaa-9922-7d88-9794-b8b013cd5609"));
  const items = new Map<string, ReturnType<typeof createItem>>();

  const item = createItem({
    id: itemId,
    title: unwrap(itemTitleFromString("My Topic")),
    icon: createItemIcon("note"),
    status: createItemStatus("open"),
    placement: createPermanentPlacement(),
    rank: unwrap(itemRankFromString("aaa")),
    createdAt: unwrap(dateTimeFromDate(new Date("2026-01-21T00:00:00Z"))),
    updatedAt: unwrap(dateTimeFromDate(new Date("2026-01-21T00:00:00Z"))),
    // No alias
  });
  items.set(itemId.toString(), item);

  const itemRepo = createMockItemRepository(items);

  // Placement is "under" the permanent item (item head pointing to the permanent item)
  const itemPlacement = unwrap(parsePlacement(itemId.toString()));

  const result = await formatPlacementForDisplay(itemPlacement, { itemRepository: itemRepo });

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value, "/permanent/019bdfaa-9922-7d88-9794-b8b013cd5609");
});

// ============================================================================
// Criterion 3: No regression for date placements
// ============================================================================

Deno.test("formatPlacementForDisplay - formats date placement correctly (no regression)", async () => {
  const placement = Result.unwrap(parsePlacement("2026-01-21"));
  const itemRepo = createMockItemRepository(new Map());

  const result = await formatPlacementForDisplay(placement, { itemRepository: itemRepo });

  assert(result.type === "ok", "operation should succeed");
  assertEquals(result.value, "/2026-01-21");
});
