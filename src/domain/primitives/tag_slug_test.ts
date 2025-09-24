import { assertEquals } from "@std/assert";
import { parseTagSlug, tagSlugFromString } from "./tag_slug.ts";

const expectOk = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseTagSlug accepts valid identifiers", () => {
  const context = expectOk(parseTagSlug("Deep-Work"));
  assertEquals(context.raw, "Deep-Work");
  assertEquals(context.canonicalKey.toString(), "deep-work");
});

Deno.test("parseTagSlug rejects reserved shapes", () => {
  const result = parseTagSlug("2025-01-02");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].code, "reserved");
});

Deno.test("tagSlugFromString rejects whitespace", () => {
  const result = tagSlugFromString("deep work");
  if (result.type !== "error") {
    throw new Error("expected whitespace error");
  }
  assertEquals(result.error.issues[0].code, "whitespace");
});
