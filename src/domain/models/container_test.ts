import { parseContainer } from "./container.ts";

const parsePath = (path: string) => parseContainer({ path, edges: [] });

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
  const result = parsePath("/");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const container = result.value;
  if (container.kind !== "WorkspaceRoot") {
    throw new Error(`expected WorkspaceRoot, got ${container.kind}`);
  }
  assertEquals(container.path.isRoot(), true);
  assertEquals(container.edges.length, 0);
});

Deno.test("parses calendar year container", () => {
  const result = parsePath("2024");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const container = result.value;
  if (container.kind !== "CalendarYear") {
    throw new Error(`expected CalendarYear, got ${container.kind}`);
  }
  assertEquals(container.year.value(), 2024);
  assertEquals(container.edges.length, 0);
});

Deno.test("parses calendar month container", () => {
  const result = parsePath("2024/09");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const container = result.value;
  if (container.kind !== "CalendarMonth") {
    throw new Error(`expected CalendarMonth, got ${container.kind}`);
  }
  assertEquals(container.year.value(), 2024);
  assertEquals(container.month.month(), 9);
  assertEquals(container.edges.length, 0);
});

Deno.test("parses calendar day container", () => {
  const result = parsePath("2024/09/20");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const container = result.value;
  if (container.kind !== "CalendarDay") {
    throw new Error(`expected CalendarDay, got ${container.kind}`);
  }
  assertEquals(container.year.value(), 2024);
  assertEquals(container.month.month(), 9);
  assertEquals(container.day.toString(), "2024-09-20");
  assertEquals(container.edges.length, 0);
});

Deno.test("parses item root container", () => {
  const result = parsePath("019965a7-2789-740a-b8c1-1415904fd108");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const container = result.value;
  if (container.kind !== "ItemRoot") {
    throw new Error(`expected ItemRoot, got ${container.kind}`);
  }
  assertEquals(container.ownerId.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(container.edges.length, 0);
});

Deno.test("parses container snapshot with edges", () => {
  const result = parseContainer({
    path: "019965a7-2789-740a-b8c1-1415904fd108/0001",
    edges: [
      {
        kind: "ItemEdge",
        to: "019965a7-2789-740a-b8c1-1415904fd109",
        rank: "a1",
      },
      {
        kind: "ContainerEdge",
        to: "projects/focus",
        index: 1,
      },
    ],
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }

  const container = result.value;
  if (container.kind !== "ItemNumbering") {
    throw new Error(`expected ItemNumbering, got ${container.kind}`);
  }
  assertEquals(container.edges.length, 2);
  assertEquals(container.edges[0].kind, "ItemEdge");
  assertEquals(container.edges[1].kind, "ContainerEdge");
});

Deno.test("parses item numbering container", () => {
  const result = parsePath("019965a7-2789-740a-b8c1-1415904fd108/0001/0002");
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }
  const container = result.value;
  if (container.kind !== "ItemNumbering") {
    throw new Error(`expected ItemNumbering, got ${container.kind}`);
  }
  assertEquals(container.indexes.length, 2);
  assertEquals(container.indexes[0].value(), 1);
  assertEquals(container.indexes[1].value(), 2);
  assertEquals(container.edges.length, 0);
});

Deno.test("rejects invalid numbering segment", () => {
  const result = parsePath("019965a7-2789-740a-b8c1-1415904fd108/1");
  if (result.type !== "error") {
    throw new Error("expected error result");
  }
  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].code, "format");
  assertEquals(result.error.issues[0].path[0], "segments");
  assertEquals(result.error.issues[0].path[1], 1);
});

Deno.test("rejects invalid calendar date", () => {
  const result = parsePath("2024/02/30");
  if (result.type !== "error") {
    throw new Error("expected error result");
  }
  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].path[0], "segments");
  assertEquals(result.error.issues[0].path[1], 2);
  assertStringIncludes(result.error.issues[0].message, "invalid");
});
