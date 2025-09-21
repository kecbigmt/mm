import { Result } from "../../shared/result.ts";
import { aliasSlugFromString } from "../primitives/alias_slug.ts";
import { itemIdFromString } from "../primitives/item_id.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { createAlias, parseAlias } from "./alias.ts";

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
    slug: "daily-focus",
    itemId: "019965a7-2789-740a-b8c1-1415904fd108",
    createdAt: "2024-03-15T12:34:56.000Z",
  });

  const alias = expectOk(result);
  assertEquals(alias.kind, "Alias");
  assertEquals(alias.data.slug.toString(), "daily-focus");
  assertEquals(alias.data.itemId.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(alias.data.createdAt.toString(), "2024-03-15T12:34:56.000Z");

  const snapshot = alias.toJSON();
  assertEquals(snapshot.slug, "daily-focus");
  assertEquals(snapshot.itemId, "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(snapshot.createdAt, "2024-03-15T12:34:56.000Z");
});

Deno.test("parseAlias reports field issues", () => {
  const result = parseAlias({
    slug: "a",
    itemId: "not-a-uuid",
    createdAt: "invalid",
  });

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  assertEquals(result.error.issues.length, 3);
  assertEquals(result.error.issues[0].path[0], "slug");
  assertEquals(result.error.issues[1].path[0], "itemId");
  assertEquals(result.error.issues[2].path[0], "createdAt");
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
