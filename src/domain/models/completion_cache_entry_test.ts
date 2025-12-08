import { assertEquals } from "@std/assert";
import {
  createAliasEntry,
  createTagEntry,
} from "./completion_cache_entry.ts";

Deno.test("CompletionCacheEntry - createAliasEntry", () => {
  const timestamp = "2025-12-08T06:00:00Z";
  const entry = createAliasEntry({
    alias: "todo",
    targetId: "0193bb00-0000-7000-8000-000000000000",
    lastSeen: timestamp,
  });

  assertEquals(entry.type, "alias");
  assertEquals(entry.value, "todo");
  assertEquals(entry.canonical_key, "todo");
  assertEquals(entry.target, "0193bb00-0000-7000-8000-000000000000");
  assertEquals(entry.last_seen, timestamp);
});

Deno.test("CompletionCacheEntry - createTagEntry", () => {
  const timestamp = "2025-12-08T06:00:00Z";
  const entry = createTagEntry({
    tag: "work",
    lastSeen: timestamp,
  });

  assertEquals(entry.type, "tag");
  assertEquals(entry.value, "work");
  assertEquals(entry.canonical_key, "work");
  assertEquals(entry.target, undefined);
  assertEquals(entry.last_seen, timestamp);
});

Deno.test("CompletionCacheEntry - alias entry is frozen", () => {
  const entry = createAliasEntry({
    alias: "todo",
    targetId: "0193bb00-0000-7000-8000-000000000000",
    lastSeen: "2025-12-08T06:00:00Z",
  });

  assertEquals(Object.isFrozen(entry), true);
});

Deno.test("CompletionCacheEntry - tag entry is frozen", () => {
  const entry = createTagEntry({
    tag: "work",
    lastSeen: "2025-12-08T06:00:00Z",
  });

  assertEquals(Object.isFrozen(entry), true);
});
