import { assertEquals } from "@std/assert";
import { createPrefixLengthResolver } from "./alias_prefix_resolver.ts";

Deno.test("createPrefixLengthResolver - returns undefined when no aliases exist", () => {
  const resolve = createPrefixLengthResolver([]);
  assertEquals(resolve("anything"), undefined);
});

Deno.test("createPrefixLengthResolver - computes shortest unique prefix lengths", () => {
  const sorted = ["alpha", "apex", "bravo"];
  const resolve = createPrefixLengthResolver(sorted);
  // "alpha" vs "apex": common prefix "a" + "l" vs "p" => prefix length 2
  assertEquals(resolve("alpha"), 2);
  assertEquals(resolve("apex"), 2);
  // "bravo" is unique after "b"
  assertEquals(resolve("bravo"), 1);
});

Deno.test("createPrefixLengthResolver - caches results across calls", () => {
  const sorted = ["alpha", "apex"];
  const resolve = createPrefixLengthResolver(sorted);
  const first = resolve("alpha");
  const second = resolve("alpha");
  assertEquals(first, second);
  assertEquals(first, 2);
});
