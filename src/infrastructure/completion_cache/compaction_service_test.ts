import { assertEquals } from "@std/assert";
import { createAliasEntry, createTagEntry } from "../../domain/models/completion_cache_entry.ts";
import { CompactionService } from "./compaction_service.ts";

Deno.test("CompactionService - removes duplicates by (type, canonical_key)", () => {
  const entries = [
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T07:00:00Z", // Newer
    }),
    createTagEntry({
      tag: "work",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
  ];

  const service = new CompactionService({ maxEntries: 1000 });
  const compacted = service.compact(entries);

  assertEquals(compacted.length, 2);
  assertEquals(compacted[0].type, "alias");
  assertEquals(compacted[0].value, "todo");
  assertEquals(compacted[0].last_seen, "2025-12-08T07:00:00Z"); // Kept newer
  assertEquals(compacted[1].type, "tag");
  assertEquals(compacted[1].value, "work");
});

Deno.test("CompactionService - updates alias target when changed", () => {
  const entries = [
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
    createAliasEntry({
      alias: "todo",
      targetId: "0193bb00-0000-7000-8000-000000000001", // Different target
      lastSeen: "2025-12-08T07:00:00Z",
    }),
  ];

  const service = new CompactionService({ maxEntries: 1000 });
  const compacted = service.compact(entries);

  assertEquals(compacted.length, 1);
  assertEquals(compacted[0].type, "alias");
  assertEquals(compacted[0].target, "0193bb00-0000-7000-8000-000000000001"); // Updated target
  assertEquals(compacted[0].last_seen, "2025-12-08T07:00:00Z");
});

Deno.test("CompactionService - sorts by last_seen (newest first)", () => {
  const entries = [
    createAliasEntry({
      alias: "old",
      targetId: "0193bb00-0000-7000-8000-000000000000",
      lastSeen: "2025-12-08T06:00:00Z",
    }),
    createTagEntry({
      tag: "newest",
      lastSeen: "2025-12-08T09:00:00Z",
    }),
    createAliasEntry({
      alias: "middle",
      targetId: "0193bb00-0000-7000-8000-000000000001",
      lastSeen: "2025-12-08T07:00:00Z",
    }),
  ];

  const service = new CompactionService({ maxEntries: 1000 });
  const compacted = service.compact(entries);

  assertEquals(compacted.length, 3);
  assertEquals(compacted[0].value, "newest");
  assertEquals(compacted[1].value, "middle");
  assertEquals(compacted[2].value, "old");
});

Deno.test("CompactionService - truncates to maxEntries", () => {
  const entries = [];
  for (let i = 0; i < 15; i++) {
    entries.push(
      createAliasEntry({
        alias: `item${i}`,
        targetId: `0193bb00-0000-7000-8000-00000000000${i}`,
        lastSeen: `2025-12-08T06:${String(i).padStart(2, "0")}:00Z`,
      }),
    );
  }

  const service = new CompactionService({ maxEntries: 10 });
  const compacted = service.compact(entries);

  assertEquals(compacted.length, 10);
  // Should keep the 10 most recent (item5-item14)
  assertEquals(compacted[0].value, "item14");
  assertEquals(compacted[9].value, "item5");
});

Deno.test("CompactionService - handles empty input", () => {
  const service = new CompactionService({ maxEntries: 1000 });
  const compacted = service.compact([]);

  assertEquals(compacted, []);
});
