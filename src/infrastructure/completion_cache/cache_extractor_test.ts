import { assertEquals } from "@std/assert";
import { extractFromArgs, extractFromItem, extractFromItems } from "./cache_extractor.ts";

const mockItem = (alias?: string, context?: string) => ({
  data: {
    alias: alias ? { toString: () => alias } : undefined,
    context: context ? { toString: () => context } : undefined,
  },
});

Deno.test("extractFromItem - extracts alias and context tag", () => {
  const item = mockItem("todo", "work");
  const result = extractFromItem(item);

  assertEquals(result.aliases, ["todo"]);
  assertEquals(result.contextTags, ["work"]);
});

Deno.test("extractFromItem - handles item with only alias", () => {
  const item = mockItem("todo", undefined);
  const result = extractFromItem(item);

  assertEquals(result.aliases, ["todo"]);
  assertEquals(result.contextTags, []);
});

Deno.test("extractFromItem - handles item with only context tag", () => {
  const item = mockItem(undefined, "work");
  const result = extractFromItem(item);

  assertEquals(result.aliases, []);
  assertEquals(result.contextTags, ["work"]);
});

Deno.test("extractFromItem - handles item with no alias or context", () => {
  const item = mockItem(undefined, undefined);
  const result = extractFromItem(item);

  assertEquals(result.aliases, []);
  assertEquals(result.contextTags, []);
});

Deno.test("extractFromItems - extracts from multiple items", () => {
  const items = [
    mockItem("todo", "work"),
    mockItem("notes", "personal"),
    mockItem(undefined, "urgent"),
  ];

  const result = extractFromItems(items);

  assertEquals(result.aliases, ["todo", "notes"]);
  assertEquals(result.contextTags, ["work", "personal", "urgent"]);
});

Deno.test("extractFromArgs - extracts context tag", () => {
  const result = extractFromArgs({ contextOption: "work" });

  assertEquals(result.aliases, []);
  assertEquals(result.contextTags, ["work"]);
});

Deno.test("extractFromArgs - handles empty string", () => {
  const result = extractFromArgs({ contextOption: "  " });

  assertEquals(result.aliases, []);
  assertEquals(result.contextTags, []);
});

Deno.test("extractFromArgs - handles undefined", () => {
  const result = extractFromArgs({});

  assertEquals(result.aliases, []);
  assertEquals(result.contextTags, []);
});
