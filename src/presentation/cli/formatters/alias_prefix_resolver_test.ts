import { assertEquals } from "@std/assert";
import { type AliasPrefixData, createPrefixLengthResolver } from "./alias_prefix_resolver.ts";

Deno.test("createPrefixLengthResolver - returns undefined when no aliases exist", () => {
  const data: AliasPrefixData = {
    sortedPrioritySet: [],
    sortedAllAliases: [],
    prioritySetLookup: new Set(),
  };
  const resolve = createPrefixLengthResolver(data);
  assertEquals(resolve("anything"), undefined);
});

Deno.test("createPrefixLengthResolver - computes prefix length against priority set", () => {
  const aliases = ["alpha", "apex", "bravo"];
  const data: AliasPrefixData = {
    sortedPrioritySet: [...aliases].sort(),
    sortedAllAliases: [...aliases].sort(),
    prioritySetLookup: new Set(aliases),
  };
  const resolve = createPrefixLengthResolver(data);
  // "alpha" vs "apex": common prefix "a" + "l" vs "p" => prefix length 2
  assertEquals(resolve("alpha"), 2);
  assertEquals(resolve("apex"), 2);
  // "bravo" is unique after "b"
  assertEquals(resolve("bravo"), 1);
});

Deno.test("createPrefixLengthResolver - falls back to all aliases for non-priority items", () => {
  const priorityAliases = ["alpha"];
  const allAliases = ["alpha", "apex", "bravo"];
  const data: AliasPrefixData = {
    sortedPrioritySet: [...priorityAliases].sort(),
    sortedAllAliases: [...allAliases].sort(),
    prioritySetLookup: new Set(priorityAliases),
  };
  const resolve = createPrefixLengthResolver(data);
  // "alpha" is in priority set, compared against priority set only (1 alias => prefix 1)
  assertEquals(resolve("alpha"), 1);
  // "apex" is NOT in priority set, compared against all aliases
  // "apex" vs "alpha": common "a" => need "ap" (length 2)
  assertEquals(resolve("apex"), 2);
});

Deno.test("createPrefixLengthResolver - caches results across calls", () => {
  const aliases = ["alpha", "apex"];
  const data: AliasPrefixData = {
    sortedPrioritySet: [...aliases].sort(),
    sortedAllAliases: [...aliases].sort(),
    prioritySetLookup: new Set(aliases),
  };
  const resolve = createPrefixLengthResolver(data);
  const first = resolve("alpha");
  const second = resolve("alpha");
  assertEquals(first, second);
  assertEquals(first, 2);
});
