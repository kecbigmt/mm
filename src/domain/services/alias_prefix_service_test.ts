import { assertEquals } from "@std/assert";
import { normalizeAlias, resolvePrefix, shortestUniquePrefix } from "./alias_prefix_service.ts";

// --- Alias Normalization ---

Deno.test("normalizeAlias removes hyphens and lowercases", () => {
  assertEquals(normalizeAlias("bace-x7q"), "bacex7q");
});

Deno.test("normalizeAlias handles uppercase", () => {
  assertEquals(normalizeAlias("BACE-X7Q"), "bacex7q");
});

Deno.test("normalizeAlias handles no-hyphen input", () => {
  assertEquals(normalizeAlias("bace"), "bace");
});

// --- Shortest Unique Prefix ---

Deno.test("shortestUniquePrefix single alias returns length 1", () => {
  assertEquals(shortestUniquePrefix("bacex7q", ["bacex7q"]), "b");
});

Deno.test("shortestUniquePrefix no common prefix with neighbors", () => {
  const sorted = ["bacex7q", "bacey2m", "kunop3r", "mizep2r"];
  assertEquals(shortestUniquePrefix("kunop3r", sorted), "k");
});

Deno.test("shortestUniquePrefix first item shares prefix with next", () => {
  const sorted = ["bacex7q", "bacey2m", "kunop3r", "mizep2r"];
  assertEquals(shortestUniquePrefix("bacex7q", sorted), "bacex");
});

Deno.test("shortestUniquePrefix middle item shares prefix with prev", () => {
  const sorted = ["bacex7q", "bacey2m", "kunop3r", "mizep2r"];
  assertEquals(shortestUniquePrefix("bacey2m", sorted), "bacey");
});

Deno.test("shortestUniquePrefix empty set returns minimum prefix", () => {
  assertEquals(shortestUniquePrefix("bacex7q", []), "b");
});

// --- Prefix Resolution ---

Deno.test("resolvePrefix finds match in priority set", () => {
  const prioritySet = ["bacex7q", "kunop3r"];
  const allItems = ["bacex7q", "bacey2m", "kunop3r", "mizep2r"];
  const result = resolvePrefix("k", prioritySet, allItems);
  assertEquals(result, { kind: "single", alias: "kunop3r" });
});

Deno.test("resolvePrefix falls back to all items when not in priority set", () => {
  const prioritySet = ["bacex7q", "kunop3r"];
  const allItems = ["bacex7q", "bacey2m", "kunop3r", "mizep2r"];
  const result = resolvePrefix("m", prioritySet, allItems);
  assertEquals(result, { kind: "single", alias: "mizep2r" });
});

Deno.test("resolvePrefix returns ambiguous when multiple matches in priority set", () => {
  const prioritySet = ["bacex7q", "bacey2m"];
  const allItems = ["bacex7q", "bacey2m", "kunop3r"];
  const result = resolvePrefix("bace", prioritySet, allItems);
  assertEquals(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assertEquals(result.candidates, ["bacex7q", "bacey2m"]);
  }
});

Deno.test("resolvePrefix returns ambiguous from all items", () => {
  const prioritySet = ["kunop3r"];
  const allItems = ["bacex7q", "bacey2m", "kunop3r"];
  const result = resolvePrefix("bace", prioritySet, allItems);
  assertEquals(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assertEquals(result.candidates, ["bacex7q", "bacey2m"]);
  }
});

Deno.test("resolvePrefix returns no match", () => {
  const prioritySet = ["bacex7q"];
  const allItems = ["bacex7q", "kunop3r"];
  const result = resolvePrefix("xyz", prioritySet, allItems);
  assertEquals(result, { kind: "none" });
});

Deno.test("resolvePrefix exact full alias match", () => {
  const prioritySet = ["bacex7q", "bacey2m"];
  const allItems = ["bacex7q", "bacey2m"];
  const result = resolvePrefix("bacex7q", prioritySet, allItems);
  assertEquals(result, { kind: "single", alias: "bacex7q" });
});

Deno.test("resolvePrefix empty input returns no match", () => {
  const prioritySet = ["bacex7q"];
  const allItems = ["bacex7q"];
  const result = resolvePrefix("", prioritySet, allItems);
  assertEquals(result, { kind: "none" });
});

// --- Hyphenated alias handling ---

Deno.test("resolvePrefix matches hyphenated aliases with unhyphenated input", () => {
  const prioritySet = ["bace-x7q", "kuno-p3r"];
  const allItems = ["bace-x7q", "bace-y2m", "kuno-p3r", "mize-p2r"];
  const result = resolvePrefix("k", prioritySet, allItems);
  assertEquals(result, { kind: "single", alias: "kuno-p3r" });
});

Deno.test("resolvePrefix returns raw alias with hyphens in result", () => {
  const prioritySet = ["bace-x7q", "kuno-p3r"];
  const allItems = ["bace-x7q", "kuno-p3r"];
  const result = resolvePrefix("bacex", prioritySet, allItems);
  assertEquals(result, { kind: "single", alias: "bace-x7q" });
});

Deno.test("resolvePrefix handles hyphenated input against hyphenated aliases", () => {
  const prioritySet = ["bace-x7q", "kuno-p3r"];
  const allItems = ["bace-x7q", "kuno-p3r"];
  const result = resolvePrefix("bace-x", prioritySet, allItems);
  assertEquals(result, { kind: "single", alias: "bace-x7q" });
});

Deno.test("resolvePrefix ambiguous with hyphenated aliases", () => {
  const prioritySet = ["bace-x7q", "bace-y2m"];
  const allItems = ["bace-x7q", "bace-y2m"];
  const result = resolvePrefix("bace", prioritySet, allItems);
  assertEquals(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assertEquals(result.candidates, ["bace-x7q", "bace-y2m"]);
  }
});

// --- Normalized collision handling ---

Deno.test("resolvePrefix returns ambiguous when aliases differ only by hyphen placement", () => {
  const prioritySet = ["a-bc", "ab-c"];
  const allItems = ["a-bc", "ab-c"];
  const result = resolvePrefix("abc", prioritySet, allItems);
  assertEquals(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assertEquals(result.candidates, ["a-bc", "ab-c"]);
  }
});
