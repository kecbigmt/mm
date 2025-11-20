import { assertEquals } from "@std/assert";
import { checkIndexIntegrity, EdgeReferenceWithPath } from "./index_doctor.ts";
import { Item, parseItem } from "../../domain/models/item.ts";
import { Alias, parseAlias } from "../../domain/models/alias.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";

/**
 * Helper to create a test item
 */
function createTestItem(
  id: string,
  placement: string,
  rank: string,
  options?: { alias?: string },
): Item {
  const snapshot = {
    id,
    title: "Test Item",
    icon: "note",
    status: "open",
    placement,
    rank,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-15T10:00:00Z",
    alias: options?.alias,
    body: undefined,
  };

  const result = parseItem(snapshot);
  if (result.type === "error") {
    throw new Error(`Failed to create test item: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/**
 * Helper to create a test edge reference
 */
function createTestEdge(itemId: string, rank: string, path: string): EdgeReferenceWithPath {
  const idResult = parseItemId(itemId);
  if (idResult.type === "error") {
    throw new Error(`Invalid item ID: ${itemId}`);
  }
  return {
    itemId: idResult.value,
    rank,
    path,
  };
}

/**
 * Helper to create a test alias
 */
function createTestAlias(raw: string, itemId: string): Alias {
  const canonicalKey = raw.normalize("NFKC").toLowerCase();
  const snapshot = {
    raw,
    canonicalKey,
    itemId,
    createdAt: "2025-01-15T10:00:00Z",
  };

  const result = parseAlias(snapshot);
  if (result.type === "error") {
    throw new Error(`Failed to create test alias: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

Deno.test("checkIndexIntegrity - returns empty array for valid workspace", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id2 = "019a8603-1234-7890-abcd-1234567890ab";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
    [id2, createTestItem(id2, "2025-01-15", "b")],
  ]);

  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      "/workspace/.index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      id2,
      "b",
      "/workspace/.index/graph/dates/2025-01-15/019a8603-1234-7890-abcd-1234567890ab.edge.json",
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);
  assertEquals(issues.length, 0);
});

Deno.test("checkIndexIntegrity - detects edge pointing to non-existent item", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const orphanId = "019a8610-1234-7890-abcd-badc0ffee000";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
  ]);

  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      "/workspace/.index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      orphanId,
      "b",
      "/workspace/.index/graph/dates/2025-01-15/019a8610-1234-7890-abcd-badc0ffee000.edge.json",
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  assertEquals(issues.length, 1);
  assertEquals(issues[0].kind, "EdgeTargetNotFound");
  assertEquals(issues[0].context?.itemId, orphanId);
});

Deno.test("checkIndexIntegrity - detects duplicate edges in same directory", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
  ]);

  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      "/workspace/.index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      id1,
      "a",
      "/workspace/.index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.copy.edge.json",
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const duplicateIssue = issues.find((i) => i.kind === "DuplicateEdge");
  assertEquals(duplicateIssue !== undefined, true);
  assertEquals(duplicateIssue?.context?.itemId, id1);
});

Deno.test("checkIndexIntegrity - detects simple cycle (A -> B -> A)", () => {
  const idA = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const idB = "019a8603-1234-7890-abcd-1234567890ab";

  // A's placement is under B, B's placement is under A = cycle
  const items = new Map<string, Item>([
    [idA, createTestItem(idA, idB, "a")],
    [idB, createTestItem(idB, idA, "b")],
  ]);

  const edges: EdgeReferenceWithPath[] = [];
  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const cycleIssue = issues.find((i) => i.kind === "CycleDetected");
  assertEquals(cycleIssue !== undefined, true);
});

Deno.test("checkIndexIntegrity - detects self-loop (A -> A)", () => {
  const idA = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // A's placement is under itself = self-loop cycle
  const items = new Map<string, Item>([
    [idA, createTestItem(idA, idA, "a")],
  ]);

  const edges: EdgeReferenceWithPath[] = [];
  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const cycleIssue = issues.find((i) => i.kind === "CycleDetected");
  assertEquals(cycleIssue !== undefined, true);
});

Deno.test("checkIndexIntegrity - no cycle for valid parent-child chain", () => {
  const idA = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const idB = "019a8603-1234-7890-abcd-1234567890ab";
  const idC = "019a8610-5678-7890-abcd-0987654321ab";

  // A under date, B under A, C under B = valid chain
  const items = new Map<string, Item>([
    [idA, createTestItem(idA, "2025-01-15", "a")],
    [idB, createTestItem(idB, idA, "b")],
    [idC, createTestItem(idC, idB, "c")],
  ]);

  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      idA,
      "a",
      `/workspace/.index/graph/dates/2025-01-15/${idA}.edge.json`,
    ),
    createTestEdge(
      idB,
      "b",
      `/workspace/.index/graph/parents/${idA}/${idB}.edge.json`,
    ),
    createTestEdge(
      idC,
      "c",
      `/workspace/.index/graph/parents/${idB}/${idC}.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  // No issues expected for valid chain with correct edge locations
  const cycleIssue = issues.find((i) => i.kind === "CycleDetected");
  assertEquals(cycleIssue, undefined);
  assertEquals(issues.length, 0);
});

Deno.test("checkIndexIntegrity - detects alias conflict (duplicate canonical_key)", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id2 = "019a8603-1234-7890-abcd-1234567890ab";

  // Both items have aliases that normalize to same canonical_key
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a", { alias: "Book" })],
    [id2, createTestItem(id2, "2025-01-15", "b", { alias: "book" })],
  ]);

  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      `/workspace/.index/graph/dates/2025-01-15/${id1}.edge.json`,
    ),
    createTestEdge(
      id2,
      "b",
      `/workspace/.index/graph/dates/2025-01-15/${id2}.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const aliasIssue = issues.find((i) => i.kind === "AliasConflict");
  assertEquals(aliasIssue !== undefined, true);
  assertEquals(aliasIssue?.context?.canonicalKey, "book");
});

Deno.test("checkIndexIntegrity - detects missing edge file for item", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id2 = "019a8603-1234-7890-abcd-1234567890ab";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
    [id2, createTestItem(id2, "2025-01-15", "b")],
  ]);

  // Only edge for id1, missing edge for id2
  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      `/workspace/.index/graph/dates/2025-01-15/${id1}.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const missingIssue = issues.find((i) => i.kind === "MissingEdge");
  assertEquals(missingIssue !== undefined, true);
  assertEquals(missingIssue?.context?.itemId, id2);
});

Deno.test("checkIndexIntegrity - detects rank mismatch between edge and item", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
  ]);

  // Edge has different rank than item
  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "z",
      `/workspace/.index/graph/dates/2025-01-15/${id1}.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const mismatchIssue = issues.find((i) => i.kind === "EdgeItemMismatch");
  assertEquals(mismatchIssue !== undefined, true);
  assertEquals(mismatchIssue?.context?.edgeRank, "z");
  assertEquals(mismatchIssue?.context?.itemRank, "a");
});

Deno.test("checkIndexIntegrity - handles empty workspace", () => {
  const items = new Map<string, Item>();
  const edges: EdgeReferenceWithPath[] = [];
  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);
  assertEquals(issues.length, 0);
});

Deno.test("checkIndexIntegrity - complex cycle detection (B -> D -> C -> B)", () => {
  const idA = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const idB = "019a8603-1234-7890-abcd-1234567890ab";
  const idC = "019a8610-5678-7890-abcd-0987654321ab";
  const idD = "019a8620-1234-7890-abcd-badc0ffee000";

  // A under date, B under D, C under B, D under C -> creates B->D->C->B cycle
  const items = new Map<string, Item>([
    [idA, createTestItem(idA, "2025-01-15", "a")],
    [idB, createTestItem(idB, idD, "b")], // B under D
    [idC, createTestItem(idC, idB, "c")], // C under B
    [idD, createTestItem(idD, idC, "d")], // D under C -> creates B->D->C->B cycle
  ]);

  const edges: EdgeReferenceWithPath[] = [];
  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const cycleIssue = issues.find((i) => i.kind === "CycleDetected");
  assertEquals(cycleIssue !== undefined, true);
});

Deno.test("checkIndexIntegrity - detects edge in wrong location (stale edge)", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item was moved from 2025-01-10 to 2025-01-15, but edge file is still at old location
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")], // Current placement
  ]);

  // Edge is at old location (2025-01-10) instead of new location (2025-01-15)
  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      `/workspace/.index/graph/dates/2025-01-10/${id1}.edge.json`, // Wrong location
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const locationIssue = issues.find((i) => i.kind === "EdgeLocationMismatch");
  assertEquals(locationIssue !== undefined, true);
  assertEquals(locationIssue?.context?.expectedDirectory, "dates/2025-01-15");
  assertEquals(locationIssue?.context?.actualDirectory, "dates/2025-01-10");
});

Deno.test("checkIndexIntegrity - detects edge in wrong location (parent to date)", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const parentId = "019a8603-1234-7890-abcd-1234567890ab";

  // Item was moved from under parent to date placement
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")], // Current placement under date
    [parentId, createTestItem(parentId, "2025-01-15", "b")],
  ]);

  // Edge is still at old parent location
  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      `/workspace/.index/graph/parents/${parentId}/${id1}.edge.json`, // Wrong location
    ),
    createTestEdge(
      parentId,
      "b",
      `/workspace/.index/graph/dates/2025-01-15/${parentId}.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const locationIssue = issues.find((i) => i.kind === "EdgeLocationMismatch");
  assertEquals(locationIssue !== undefined, true);
  assertEquals(locationIssue?.context?.expectedDirectory, "dates/2025-01-15");
  assertEquals(locationIssue?.context?.actualDirectory, `parents/${parentId}`);
});

Deno.test("checkIndexIntegrity - validates edge location with numeric sections", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item is in section 1/2 under date
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15/1/2", "a")],
  ]);

  // Edge is at correct location with sections
  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      `/workspace/.index/graph/dates/2025-01-15/1/2/${id1}.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  // No location mismatch expected
  const locationIssue = issues.find((i) => i.kind === "EdgeLocationMismatch");
  assertEquals(locationIssue, undefined);
  assertEquals(issues.length, 0);
});

Deno.test("checkIndexIntegrity - detects edge in wrong section", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item is in section 1/2 under date
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15/1/2", "a")],
  ]);

  // Edge is in wrong section (1/3 instead of 1/2)
  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(
      id1,
      "a",
      `/workspace/.index/graph/dates/2025-01-15/1/3/${id1}.edge.json`, // Wrong section
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const locationIssue = issues.find((i) => i.kind === "EdgeLocationMismatch");
  assertEquals(locationIssue !== undefined, true);
  assertEquals(locationIssue?.context?.expectedDirectory, "dates/2025-01-15/1/2");
  assertEquals(locationIssue?.context?.actualDirectory, "dates/2025-01-15/1/3");
});

Deno.test("checkIndexIntegrity - detects duplicate canonical_key in alias index", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id2 = "019a8603-1234-7890-abcd-1234567890ab";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a", { alias: "test-alias" })],
    [id2, createTestItem(id2, "2025-01-15", "b", { alias: "Test-Alias" })],
  ]);

  const edges: EdgeReferenceWithPath[] = [];

  // Two alias index entries with same canonical_key but different items
  const aliases: Alias[] = [
    createTestAlias("test-alias", id1),
    createTestAlias("Test-Alias", id2), // Same canonical_key, different item
  ];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const conflictIssue = issues.find((i) => i.kind === "AliasConflict");
  assertEquals(conflictIssue !== undefined, true);
  assertEquals(conflictIssue?.context?.canonicalKey, "test-alias");
});

Deno.test("checkIndexIntegrity - detects orphaned alias index (non-existent item)", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const orphanId = "019a8610-1234-7890-abcd-badc0ffee000";

  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
  ]);

  const edges: EdgeReferenceWithPath[] = [];

  // Alias index points to non-existent item
  const aliases: Alias[] = [
    createTestAlias("orphan-alias", orphanId),
  ];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const orphanIssue = issues.find((i) => i.kind === "OrphanedAliasIndex");
  assertEquals(orphanIssue !== undefined, true);
  assertEquals(orphanIssue?.message.includes(orphanId), true);
});

Deno.test("checkIndexIntegrity - detects orphaned alias index (item has no alias)", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item has no alias in frontmatter
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a")],
  ]);

  const edges: EdgeReferenceWithPath[] = [];

  // But alias index file exists
  const aliases: Alias[] = [
    createTestAlias("stale-alias", id1),
  ];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const orphanIssue = issues.find((i) => i.kind === "OrphanedAliasIndex");
  assertEquals(orphanIssue !== undefined, true);
  assertEquals(orphanIssue?.message.includes("has no alias in frontmatter"), true);
});

Deno.test("checkIndexIntegrity - detects alias index canonical_key mismatch", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item has alias "current-alias"
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a", { alias: "current-alias" })],
  ]);

  const edges: EdgeReferenceWithPath[] = [];

  // But alias index file has different canonical_key
  const aliases: Alias[] = [
    createTestAlias("old-alias", id1),
  ];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const orphanIssue = issues.find((i) => i.kind === "OrphanedAliasIndex");
  assertEquals(orphanIssue !== undefined, true);
  assertEquals(orphanIssue?.message.includes("doesn't match"), true);
});

Deno.test("checkIndexIntegrity - detects missing alias index", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item has alias in frontmatter
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a", { alias: "test-alias" })],
  ]);

  const edges: EdgeReferenceWithPath[] = [];

  // But no alias index file
  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  const missingIssue = issues.find((i) => i.kind === "MissingAliasIndex");
  assertEquals(missingIssue !== undefined, true);
  assertEquals(missingIssue?.context?.itemId, id1);
  assertEquals(missingIssue?.context?.alias, "test-alias");
});

Deno.test("checkIndexIntegrity - valid alias index with matching frontmatter", () => {
  const id1 = "019a85fc-67c4-7a54-be8e-305bae009f9e";

  // Item has alias
  const items = new Map<string, Item>([
    [id1, createTestItem(id1, "2025-01-15", "a", { alias: "test-alias" })],
  ]);

  const edges: EdgeReferenceWithPath[] = [
    createTestEdge(id1, "a", `/workspace/.index/graph/dates/2025-01-15/${id1}.edge.json`),
  ];

  // Matching alias index file
  const aliases: Alias[] = [
    createTestAlias("test-alias", id1),
  ];

  const issues = checkIndexIntegrity(items, edges, aliases);

  // No alias-related issues
  const aliasIssues = issues.filter((i) =>
    i.kind === "AliasConflict" ||
    i.kind === "OrphanedAliasIndex" ||
    i.kind === "MissingAliasIndex"
  );
  assertEquals(aliasIssues.length, 0);
});
