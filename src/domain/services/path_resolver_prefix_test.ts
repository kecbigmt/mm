/**
 * Tests for PathResolver prefix resolution integration.
 * When exact alias lookup fails, PathResolver falls back to prefix matching.
 */

import { assertEquals } from "@std/assert";
import { createPathResolver } from "./path_resolver.ts";
import { InMemoryItemRepository } from "../repositories/item_repository_fake.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";
import { parsePathExpression } from "../../presentation/cli/path_parser.ts";
import { createAlias } from "../models/alias.ts";
import {
  createDateDirectory,
  dateTimeFromDate,
  itemIdFromString,
  parseAliasSlug,
  parseCalendarDay,
  parseTimezoneIdentifier,
} from "../primitives/mod.ts";
import { Result } from "../../shared/result.ts";

const setup = () => {
  const itemRepository = new InMemoryItemRepository();
  const aliasRepository = new InMemoryAliasRepository();
  const now = Result.unwrap(dateTimeFromDate(new Date("2026-02-11T00:00:00Z")));
  const today = Result.unwrap(parseCalendarDay("2026-02-11"));
  const cwd = createDateDirectory(today, []);
  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));

  const addAlias = (slug: string, itemId: string) => {
    aliasRepository.set(createAlias({
      slug: Result.unwrap(parseAliasSlug(slug)),
      itemId: Result.unwrap(itemIdFromString(itemId)),
      createdAt: now,
    }));
  };

  const createResolver = () =>
    createPathResolver({
      itemRepository,
      aliasRepository,
      timezone,
      today: new Date("2026-02-11T00:00:00Z"),
    });

  return { itemRepository, aliasRepository, addAlias, createResolver, cwd };
};

// --- AC 1: Prefix Resolution Fallback ---

Deno.test("PathResolver - resolves prefix match when exact alias not found", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");
  addAlias("kuno-p3r", "019a0000-0000-7000-8000-000000000002");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("bacex"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

Deno.test("PathResolver - resolves single-char prefix", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");
  addAlias("kuno-p3r", "019a0000-0000-7000-8000-000000000002");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("k"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000002");
    }
  }
});

Deno.test("PathResolver - exact alias match still works", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("bace-x7q"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

// --- AC 2: Ambiguous Prefix Error ---

Deno.test("PathResolver - returns error for ambiguous prefix", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");
  addAlias("bace-y2m", "019a0000-0000-7000-8000-000000000002");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("bace"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "ambiguous_alias_prefix");
  }
});

Deno.test("PathResolver - longer prefix disambiguates", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");
  addAlias("bace-y2m", "019a0000-0000-7000-8000-000000000002");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("bacex"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

// --- AC 3: No Match Falls Through ---

Deno.test("PathResolver - returns alias not found when no prefix match", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("xyz"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "alias_not_found");
  }
});

// --- AC 4: Input Normalization ---

Deno.test("PathResolver - case-insensitive prefix matching", async () => {
  const { addAlias, createResolver, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");

  const resolver = createResolver();
  const expr = Result.unwrap(parsePathExpression("BACE"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

// --- prefixCandidates mode ---

Deno.test("PathResolver - prefixCandidates resolves prefix against provided candidates", async () => {
  const { addAlias, aliasRepository, itemRepository, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");
  addAlias("kuno-p3r", "019a0000-0000-7000-8000-000000000002");

  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));
  const resolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone,
    today: new Date("2026-02-11T00:00:00Z"),
    prefixCandidates: () => Promise.resolve(["bace-x7q", "kuno-p3r"]),
  });

  const expr = Result.unwrap(parsePathExpression("b"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.head.kind, "item");
    if (result.value.head.kind === "item") {
      assertEquals(result.value.head.id.toString(), "019a0000-0000-7000-8000-000000000001");
    }
  }
});

Deno.test("PathResolver - prefixCandidates returns not_found for alias outside candidates", async () => {
  const { addAlias, aliasRepository, itemRepository, cwd } = setup();
  addAlias("bace-x7q", "019a0000-0000-7000-8000-000000000001");
  addAlias("kuno-p3r", "019a0000-0000-7000-8000-000000000002");

  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));
  // Only kuno-p3r is in candidates; bace-x7q is not
  const resolver = createPathResolver({
    itemRepository,
    aliasRepository,
    timezone,
    today: new Date("2026-02-11T00:00:00Z"),
    prefixCandidates: () => Promise.resolve(["kuno-p3r"]),
  });

  const expr = Result.unwrap(parsePathExpression("b"));
  const result = await resolver.resolvePath(cwd, expr);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "alias_not_found");
  }
});
