import { Result } from "../../shared/result.ts";
import { aliasSlugFromString } from "../primitives/alias_slug.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { createAlias, parseAlias } from "./alias.ts";
import { InMemoryAliasRepository } from "../repositories/alias_repository_fake.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const expectOk = <T, E>(result: Result<T, E>): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseAlias returns Alias for valid snapshot", () => {
  const result = parseAlias({
    raw: "daily-focus",
    canonicalKey: "daily-focus",
    itemId: "019965a7-2789-740a-b8c1-1415904fd108",
    createdAt: "2024-03-15T12:34:56.000Z",
  });

  const alias = expectOk(result);
  assertEquals(alias.kind, "Alias");
  assertEquals(alias.data.slug.toString(), "daily-focus");
  assertEquals(alias.data.slug.canonicalKey.toString(), "daily-focus");
  assertEquals(alias.data.itemId.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(alias.data.createdAt.toString(), "2024-03-15T12:34:56.000Z");

  const snapshot = alias.toJSON();
  assertEquals(snapshot.raw, "daily-focus");
  assertEquals(snapshot.canonicalKey, "daily-focus");
  assertEquals(snapshot.itemId, "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(snapshot.createdAt, "2024-03-15T12:34:56.000Z");
});

Deno.test("parseAlias reports field issues", () => {
  const result = parseAlias({
    raw: "  ",
    canonicalKey: 42 as unknown as string,
    itemId: "not-a-uuid",
    createdAt: "invalid",
  });

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  const paths = result.error.issues.map((issue) => issue.path[0]);
  assertEquals(paths.includes("raw"), true);
  assertEquals(paths.includes("canonicalKey"), true);
  assertEquals(paths.includes("itemId"), true);
  assertEquals(paths.includes("createdAt"), true);
});

Deno.test("createAlias preserves provided data", () => {
  const slug = expectOk(aliasSlugFromString("weekly-review"));
  const itemId = expectOk(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108"));
  const createdAt = expectOk(parseDateTime("2024-03-15T12:34:56.000Z"));

  const alias = createAlias({ slug, itemId: itemId, createdAt });
  assertEquals(alias.data.slug, slug);
  assertEquals(alias.data.itemId, itemId);
  assertEquals(alias.data.createdAt, createdAt);
});

// Tests for alias lookup with case/diacritic normalization (scenario_12 coverage)
Deno.test("AliasSlug.equals returns true for uppercase variant", () => {
  const slug1 = expectOk(aliasSlugFromString("café"));
  const slug2 = expectOk(aliasSlugFromString("CAFÉ"));

  assertEquals(slug1.equals(slug2), true, "café should equal CAFÉ");
  assertEquals(slug2.equals(slug1), true, "CAFÉ should equal café");
});

Deno.test("AliasSlug.equals returns true for diacritic-stripped variant", () => {
  const slug1 = expectOk(aliasSlugFromString("café"));
  const slug2 = expectOk(aliasSlugFromString("cafe"));

  assertEquals(slug1.equals(slug2), true, "café should equal cafe");
  assertEquals(slug2.equals(slug1), true, "cafe should equal café");
});

Deno.test("AliasSlug.equals returns true for uppercase and diacritic-stripped variant", () => {
  const slug1 = expectOk(aliasSlugFromString("café"));
  const slug2 = expectOk(aliasSlugFromString("CAFE"));

  assertEquals(slug1.equals(slug2), true, "café should equal CAFE");
  assertEquals(slug2.equals(slug1), true, "CAFE should equal café");
});

Deno.test("AliasSlug canonical key is normalized for case and diacritics", () => {
  const slug1 = expectOk(aliasSlugFromString("Tëst-Ítëm"));
  const slug2 = expectOk(aliasSlugFromString("test-item"));

  assertEquals(slug1.canonicalKey.toString(), "test-item");
  assertEquals(slug2.canonicalKey.toString(), "test-item");
  assertEquals(slug1.equals(slug2), true);
});

Deno.test("InMemoryAliasRepository finds alias using normalized lookup key", async () => {
  const repository = new InMemoryAliasRepository();

  // Create and save alias with diacritics
  const originalSlug = expectOk(aliasSlugFromString("café"));
  const itemId = expectOk(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108"));
  const createdAt = expectOk(parseDateTime("2024-03-15T12:34:56.000Z"));
  const alias = createAlias({ slug: originalSlug, itemId, createdAt });

  await repository.save(alias);

  // Lookup using uppercase + no diacritics
  const lookupSlug = expectOk(aliasSlugFromString("CAFE"));
  const result = await repository.load(lookupSlug);

  const foundAlias = expectOk(result);
  if (!foundAlias) {
    throw new Error("Alias should be found with normalized key lookup");
  }

  assertEquals(foundAlias.data.slug.raw, "café", "Original raw value should be preserved");
  assertEquals(foundAlias.data.itemId.toString(), itemId.toString());
});

Deno.test("InMemoryAliasRepository finds alias using lowercase lookup", async () => {
  const repository = new InMemoryAliasRepository();

  // Create and save alias with uppercase
  const originalSlug = expectOk(aliasSlugFromString("MyProject"));
  const itemId = expectOk(itemIdFromString("019965a7-2789-740a-b8c1-1415904fd108"));
  const createdAt = expectOk(parseDateTime("2024-03-15T12:34:56.000Z"));
  const alias = createAlias({ slug: originalSlug, itemId, createdAt });

  await repository.save(alias);

  // Lookup using lowercase
  const lookupSlug = expectOk(aliasSlugFromString("myproject"));
  const result = await repository.load(lookupSlug);

  const foundAlias = expectOk(result);
  if (!foundAlias) {
    throw new Error("Alias should be found with lowercase lookup");
  }

  assertEquals(foundAlias.data.slug.raw, "MyProject", "Original raw value should be preserved");
});
