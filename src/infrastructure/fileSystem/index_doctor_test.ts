import { assertEquals } from "@std/assert";
import { checkIndexIntegrity, EdgeReferenceWithPath } from "./index_doctor.ts";
import { Item, parseItem } from "../../domain/models/item.ts";
import { Alias } from "../../domain/models/alias.ts";
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      id2,
      "b",
      ".index/graph/dates/2025-01-15/019a8603-1234-7890-abcd-1234567890ab.edge.json",
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      orphanId,
      "b",
      ".index/graph/dates/2025-01-15/019a8610-1234-7890-abcd-badc0ffee000.edge.json",
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      id1,
      "a",
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.copy.edge.json",
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      idB,
      "b",
      `.index/graph/parents/${idA}/019a8603-1234-7890-abcd-1234567890ab.edge.json`,
    ),
    createTestEdge(
      idC,
      "c",
      `.index/graph/parents/${idB}/019a8610-5678-7890-abcd-0987654321ab.edge.json`,
    ),
  ];

  const aliases: Alias[] = [];

  const issues = checkIndexIntegrity(items, edges, aliases);

  // Should only have missing edge issues since we didn't match all edges
  const cycleIssue = issues.find((i) => i.kind === "CycleDetected");
  assertEquals(cycleIssue, undefined);
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
    ),
    createTestEdge(
      id2,
      "b",
      ".index/graph/dates/2025-01-15/019a8603-1234-7890-abcd-1234567890ab.edge.json",
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
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
      ".index/graph/dates/2025-01-15/019a85fc-67c4-7a54-be8e-305bae009f9e.edge.json",
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
