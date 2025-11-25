import { assertEquals } from "@std/assert";
import { canonicalKeyFromString, createCanonicalKey } from "./canonical_key.ts";

Deno.test("createCanonicalKey lowercases ASCII", () => {
  const key = createCanonicalKey("Focus-Project");
  assertEquals(key.toString(), "focus-project");
});

Deno.test("createCanonicalKey normalizes compatibility characters", () => {
  const key = createCanonicalKey(`Office\u{FB01}`);
  assertEquals(key.toString(), "officefi");
});

Deno.test("createCanonicalKey strips diacritics", () => {
  const withDiacritics = createCanonicalKey("tëst-item");
  const ascii = createCanonicalKey("test-item");
  assertEquals(withDiacritics.toString(), ascii.toString());
});

Deno.test("canonicalKeyFromString collapses equivalent sequences", () => {
  const composed = canonicalKeyFromString("Ångström");
  const decomposed = canonicalKeyFromString(`A\u{030A}ngstro\u{0308}m`);
  assertEquals(composed.toString(), decomposed.toString());
});
