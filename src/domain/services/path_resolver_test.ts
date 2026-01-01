/**
 * Tests for PathResolver service - dotdot (..) navigation
 */

import { assertEquals } from "@std/assert";
import { createPathResolver } from "./path_resolver.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { parsePathExpression } from "../../presentation/cli/path_parser.ts";
import { createItem } from "../models/item.ts";
import {
  createDatePlacement,
  createItemIcon,
  createItemPlacement,
  dateTimeFromDate,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseCalendarDay,
  parseTimezoneIdentifier,
} from "../primitives/mod.ts";
import { Result } from "../../shared/result.ts";

Deno.test("PathResolver - navigates to parent item using ../", async () => {
  // Create hierarchy: today -> parent -> child
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));
  const parentId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000001"));
  const childId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000002"));

  const parentPlacement = createDatePlacement(today, []);
  const childPlacement = createItemPlacement(parentId, []);

  const now = Result.unwrap(dateTimeFromDate(new Date("2025-11-16T00:00:00Z")));
  const parent = createItem({
    id: parentId,
    title: Result.unwrap(itemTitleFromString("Parent")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: parentPlacement,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  });
  const child = createItem({
    id: childId,
    title: Result.unwrap(itemTitleFromString("Child")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: childPlacement,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  });

  await itemRepository.save(parent);
  await itemRepository.save(child);

  // Navigate from child using ../
  const expr = Result.unwrap(parsePathExpression("../"));
  const result = await pathResolver.resolvePath(childPlacement, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), parentPlacement.toString());
  }
});

Deno.test("PathResolver - navigates multiple levels using ../../", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));
  const parentId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000001"));
  const childId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000002"));
  const grandchildId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000003"));

  const parentPlacement = createDatePlacement(today, []);
  const childPlacement = createItemPlacement(parentId, []);
  const grandchildPlacement = createItemPlacement(childId, []);

  const now = Result.unwrap(dateTimeFromDate(new Date("2025-11-16T00:00:00Z")));
  await itemRepository.save(createItem({
    id: parentId,
    title: Result.unwrap(itemTitleFromString("Parent")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: parentPlacement,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));
  await itemRepository.save(createItem({
    id: childId,
    title: Result.unwrap(itemTitleFromString("Child")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: childPlacement,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));
  await itemRepository.save(createItem({
    id: grandchildId,
    title: Result.unwrap(itemTitleFromString("Grandchild")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: grandchildPlacement,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));

  // Navigate from grandchild using ../../
  const expr = Result.unwrap(parsePathExpression("../../"));
  const result = await pathResolver.resolvePath(grandchildPlacement, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), parentPlacement.toString());
  }
});

Deno.test("PathResolver - removes section first with ../", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));
  const parentId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000001"));

  const parentPlacement = createDatePlacement(today, []);
  const currentPlacement = createItemPlacement(parentId, [1]);

  const now = Result.unwrap(dateTimeFromDate(new Date("2025-11-16T00:00:00Z")));
  await itemRepository.save(createItem({
    id: parentId,
    title: Result.unwrap(itemTitleFromString("Parent")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: parentPlacement,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));

  // Navigate from parent/1 using ../
  const expr = Result.unwrap(parsePathExpression("../"));
  const result = await pathResolver.resolvePath(currentPlacement, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should remove the section first, going to parent (no sections)
    assertEquals(result.value.toString(), createItemPlacement(parentId, []).toString());
  }
});

Deno.test("PathResolver - returns error when navigating above date root", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));
  const rootPlacement = createDatePlacement(today, []);

  const expr = Result.unwrap(parsePathExpression("../"));
  const result = await pathResolver.resolvePath(rootPlacement, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_parent");
  }
});

Deno.test("PathResolver - returns error when parent item does not exist", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const nonExistentId = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000999"));
  const childPlacement = createItemPlacement(nonExistentId, []);

  const expr = Result.unwrap(parsePathExpression("../"));
  const result = await pathResolver.resolvePath(childPlacement, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "item_not_found");
  }
});

Deno.test("PathResolver - returns error for reversed numeric range (5..3)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve range using absolute path 2025-11-16/5..3 (reversed)
  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("2025-11-16/5..3"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_range_order");
  }
});

Deno.test("PathResolver - returns error for large reversed numeric range (10..1)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve range 2025-11-16/10..1 (large reversed range)
  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("2025-11-16/10..1"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_range_order");
  }
});

Deno.test("PathResolver - returns error for adjacent reversed numeric range (2..1)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve range 2025-11-16/2..1 (adjacent reversed)
  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("2025-11-16/2..1"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_range_order");
  }
});

Deno.test("PathResolver - returns error for absolute path with no segments (/)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve absolute path with no segments (/)
  const expr = Result.unwrap(parsePathExpression("/"));
  const result = await pathResolver.resolvePath(createDatePlacement(today, []), expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "absolute_path_missing_head");
  }
});

Deno.test("PathResolver - returns error for absolute path starting with numeric section (/1)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve absolute path starting with numeric section (/1)
  const expr = Result.unwrap(parsePathExpression("/1"));
  const result = await pathResolver.resolvePath(createDatePlacement(today, []), expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "absolute_path_invalid_head");
  }
});

Deno.test("PathResolver - returns error for absolute path starting with dotdot (/../)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve absolute path starting with dotdot (/../)
  const expr = Result.unwrap(parsePathExpression("/../"));
  const result = await pathResolver.resolvePath(createDatePlacement(today, []), expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "absolute_path_invalid_head");
  }
});

Deno.test("PathResolver - returns error for absolute path starting with dot (/./)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve absolute path starting with dot (/.)
  const expr = Result.unwrap(parsePathExpression("/."));
  const result = await pathResolver.resolvePath(createDatePlacement(today, []), expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "absolute_path_invalid_head");
  }
});

Deno.test("PathResolver - returns error for different date parents", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));

  // Try to resolve range with different date parents (2025-11-15/1..2025-11-16/3)
  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("2025-11-15/1..2025-11-16/3"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "range_different_parents");
  }
});

Deno.test("PathResolver - returns error for different item parents", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-11-16"));
  const itemA = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000001"));
  const itemB = Result.unwrap(itemIdFromString("019a0000-0000-7000-8000-000000000002"));

  const placementA = createDatePlacement(today, []);
  const placementB = createDatePlacement(today, []);
  const now = Result.unwrap(dateTimeFromDate(new Date("2025-11-16T00:00:00Z")));

  await itemRepository.save(createItem({
    id: itemA,
    title: Result.unwrap(itemTitleFromString("Item A")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: placementA,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));

  await itemRepository.save(createItem({
    id: itemB,
    title: Result.unwrap(itemTitleFromString("Item B")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    placement: placementB,
    rank: Result.unwrap(itemRankFromString("a0")),
    createdAt: now,
    updatedAt: now,
  }));

  // Try to resolve range with different item parents (itemA/1..itemB/3)
  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(
    parseRangeExpression(`${itemA.toString()}/1..${itemB.toString()}/3`),
  );
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "range_different_parents");
  }
});

// Test: Period keyword expansion
Deno.test("PathResolver - resolveRange expands this-week to Mon-Sun date range", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // Reference: Saturday 2025-12-06
  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-12-06T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-12-06"));

  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("this-week"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.kind, "dateRange");
    if (result.value.kind === "dateRange") {
      // Week containing Sat 2025-12-06: Mon 2025-12-01 to Sun 2025-12-07
      assertEquals(result.value.from.toString(), "2025-12-01");
      assertEquals(result.value.to.toString(), "2025-12-07");
    }
  }
});

Deno.test("PathResolver - resolveRange expands tw alias to Mon-Sun date range", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-12-06T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-12-06"));

  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("tw"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.kind, "dateRange");
    if (result.value.kind === "dateRange") {
      assertEquals(result.value.from.toString(), "2025-12-01");
      assertEquals(result.value.to.toString(), "2025-12-07");
    }
  }
});

Deno.test("PathResolver - resolveRange expands next-week to Mon-Sun of next week", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-12-06T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-12-06"));

  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("next-week"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.kind, "dateRange");
    if (result.value.kind === "dateRange") {
      // Next week: Mon 2025-12-08 to Sun 2025-12-14
      assertEquals(result.value.from.toString(), "2025-12-08");
      assertEquals(result.value.to.toString(), "2025-12-14");
    }
  }
});

Deno.test("PathResolver - resolveRange expands this-month to 1st to last day", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-12-06T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-12-06"));

  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("this-month"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.kind, "dateRange");
    if (result.value.kind === "dateRange") {
      // December 2025: 1st to 31st
      assertEquals(result.value.from.toString(), "2025-12-01");
      assertEquals(result.value.to.toString(), "2025-12-31");
    }
  }
});

Deno.test("PathResolver - resolveRange expands next-month crossing year boundary", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-12-06T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-12-06"));

  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("next-month"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.kind, "dateRange");
    if (result.value.kind === "dateRange") {
      // January 2026: 1st to 31st
      assertEquals(result.value.from.toString(), "2026-01-01");
      assertEquals(result.value.to.toString(), "2026-01-31");
    }
  }
});

Deno.test("PathResolver - resolveRange keeps today as single date (not period keyword)", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-12-06T00:00:00Z"),
  });

  const today = Result.unwrap(parseCalendarDay("2025-12-06"));

  const { parseRangeExpression } = await import("../../presentation/cli/path_parser.ts");
  const rangeExpr = Result.unwrap(parseRangeExpression("today"));
  const result = await pathResolver.resolveRange(createDatePlacement(today, []), rangeExpr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // today is NOT a period keyword, should be single range
    assertEquals(result.value.kind, "single");
  }
});

// Tests for resolvePath with relative date keywords (scenario_04 coverage)
Deno.test("PathResolver - resolvePath resolves 'today' keyword to current date", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("today"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      assertEquals(result.value.head.date.toString(), "2025-11-16");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves 'tomorrow' keyword to next day", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("tomorrow"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      assertEquals(result.value.head.date.toString(), "2025-11-17");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves 'yesterday' keyword to previous day", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("yesterday"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      assertEquals(result.value.head.date.toString(), "2025-11-15");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves '+1d' to one day forward", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("+1d"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      assertEquals(result.value.head.date.toString(), "2025-11-17");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves '+1w' to one week forward", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("+1w"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      // 2025-11-16 + 7 days = 2025-11-23
      assertEquals(result.value.head.date.toString(), "2025-11-23");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves '~1w' to one week backward", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("~1w"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      // 2025-11-16 - 7 days = 2025-11-09
      assertEquals(result.value.head.date.toString(), "2025-11-09");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves '~mon' to previous Monday", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // 2025-11-16 is Sunday
  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("~mon"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      // 2025-11-16 (Sunday) -> previous Monday is 2025-11-10
      assertEquals(result.value.head.date.toString(), "2025-11-10");
    }
  }
});

Deno.test("PathResolver - resolvePath resolves '+fri' to next Friday", async () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();

  // 2025-11-16 is Sunday
  const pathResolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone: Result.unwrap(parseTimezoneIdentifier("UTC")),
    today: new Date("2025-11-16T00:00:00Z"),
  });

  const cwd = Result.unwrap(parseCalendarDay("2025-11-10"));

  const expr = Result.unwrap(parsePathExpression("+fri"));
  const result = await pathResolver.resolvePath(createDatePlacement(cwd, []), expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "date");
    if (result.value.head.kind === "date") {
      // 2025-11-16 (Sunday) -> next Friday is 2025-11-21
      assertEquals(result.value.head.date.toString(), "2025-11-21");
    }
  }
});
