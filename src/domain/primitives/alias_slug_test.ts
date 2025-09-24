import { assertEquals } from "@std/assert";
import { aliasSlugFromString, parseAliasSlug } from "./alias_slug.ts";

const expectOk = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseAliasSlug accepts mixed-case ASCII and canonicalizes", () => {
  const alias = expectOk(parseAliasSlug("Focus-Project"));
  assertEquals(alias.raw, "Focus-Project");
  assertEquals(alias.toString(), "Focus-Project");
  assertEquals(alias.canonicalKey.toString(), "focus-project");
});

Deno.test("parseAliasSlug accepts Unicode aliases", () => {
  const alias = expectOk(parseAliasSlug("設計メモ"));
  assertEquals(alias.raw, "設計メモ");
  assertEquals(alias.canonicalKey.toString(), "設計メモ");
});

Deno.test("parseAliasSlug rejects reserved locator shapes", () => {
  const result = parseAliasSlug("2025-01-02");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].code, "reserved");
});

Deno.test("aliasSlugFromString rejects whitespace and control characters", () => {
  const spaceResult = aliasSlugFromString(" focus ");
  if (spaceResult.type !== "error") {
    throw new Error("expected whitespace error");
  }
  assertEquals(spaceResult.error.issues[0].code, "whitespace");

  const controlResult = aliasSlugFromString("focus\u0000work");
  if (controlResult.type !== "error") {
    throw new Error("expected control error");
  }
  assertEquals(controlResult.error.issues[0].code, "control");
});
