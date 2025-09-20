import { parseContainerNode } from "./container_node.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const assertStringIncludes = (actual: string, expected: string, message?: string): void => {
  if (!actual.includes(expected)) {
    throw new Error(message ?? `expected "${actual}" to include "${expected}"`);
  }
};

Deno.test("parses workspace root container", () => {
  const result = parseContainerNode("/");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const node = result.value;
  if (node.kind !== "WorkspaceRoot") {
    throw new Error(`expected WorkspaceRoot, got ${node.kind}`);
  }
  assertEquals(node.path.isRoot(), true);
});

Deno.test("parses calendar year container", () => {
  const result = parseContainerNode("2024");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const node = result.value;
  if (node.kind !== "CalendarYear") {
    throw new Error(`expected CalendarYear, got ${node.kind}`);
  }
  assertEquals(node.year.value(), 2024);
});

Deno.test("parses calendar month container", () => {
  const result = parseContainerNode("2024/09");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const node = result.value;
  if (node.kind !== "CalendarMonth") {
    throw new Error(`expected CalendarMonth, got ${node.kind}`);
  }
  assertEquals(node.year.value(), 2024);
  assertEquals(node.month.month(), 9);
});

Deno.test("parses calendar day container", () => {
  const result = parseContainerNode("2024/09/20");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const node = result.value;
  if (node.kind !== "CalendarDay") {
    throw new Error(`expected CalendarDay, got ${node.kind}`);
  }
  assertEquals(node.year.value(), 2024);
  assertEquals(node.month.month(), 9);
  assertEquals(node.day.toString(), "2024-09-20");
});

Deno.test("parses item root container", () => {
  const result = parseContainerNode("019965a7-2789-740a-b8c1-1415904fd108");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const node = result.value;
  if (node.kind !== "ItemRoot") {
    throw new Error(`expected ItemRoot, got ${node.kind}`);
  }
  assertEquals(node.ownerId.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
});

Deno.test("parses item numbering container", () => {
  const result = parseContainerNode("019965a7-2789-740a-b8c1-1415904fd108/0001/0002");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const node = result.value;
  if (node.kind !== "ItemNumbering") {
    throw new Error(`expected ItemNumbering, got ${node.kind}`);
  }
  assertEquals(node.indexes.length, 2);
  assertEquals(node.indexes[0].value(), 1);
  assertEquals(node.indexes[1].value(), 2);
});

Deno.test("rejects invalid numbering segment", () => {
  const result = parseContainerNode("019965a7-2789-740a-b8c1-1415904fd108/1");
  if (result.type !== "error") {
    throw new Error("expected error result");
  }
  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].code, "format");
  assertEquals(result.error.issues[0].path[0], "segments");
  assertEquals(result.error.issues[0].path[1], 1);
});

Deno.test("rejects invalid calendar date", () => {
  const result = parseContainerNode("2024/02/30");
  if (result.type !== "error") {
    throw new Error("expected error result");
  }
  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].path[0], "segments");
  assertEquals(result.error.issues[0].path[1], 2);
  assertStringIncludes(result.error.issues[0].message, "invalid");
});
