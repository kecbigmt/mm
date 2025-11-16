/**
 * Tests for PathResolver service - dotdot (..) navigation
 */

import { assertEquals } from "@std/assert";
import { createPathResolver } from "./path_resolver.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { parsePathExpression } from "../../presentation/cli/path_expression.ts";
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
  const { parseRangeExpression } = await import("../../presentation/cli/path_expression.ts");
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
  const { parseRangeExpression } = await import("../../presentation/cli/path_expression.ts");
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
  const { parseRangeExpression } = await import("../../presentation/cli/path_expression.ts");
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
