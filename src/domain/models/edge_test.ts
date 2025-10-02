import {
  parseContainerEdge,
  parseEdge,
  parseItemEdge,
  parseSectionEdge,
  sectionEdgeFromLegacy,
} from "./edge.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseContainerEdge parses valid snapshot", () => {
  const result = parseContainerEdge({
    kind: "ContainerEdge",
    to: "projects/focus",
    index: 1,
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }

  const edge = result.value;
  assertEquals(edge.kind, "ContainerEdge");
  assertEquals(edge.data.to.toString(), "projects/focus");
  assertEquals(edge.data.index.value(), 1);

  const snapshot = edge.toJSON();
  assertEquals(snapshot.kind, "ContainerEdge");
  assertEquals(snapshot.to, "projects/focus");
  assertEquals(snapshot.index, 1);
});

Deno.test("parseItemEdge parses valid snapshot", () => {
  const result = parseItemEdge({
    kind: "ItemEdge",
    to: "019965a7-2789-740a-b8c1-1415904fd108",
    rank: "a1",
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }

  const edge = result.value;
  assertEquals(edge.kind, "ItemEdge");
  assertEquals(edge.data.to.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(edge.data.rank.toString(), "a1");

  const snapshot = edge.toJSON();
  assertEquals(snapshot.kind, "ItemEdge");
  assertEquals(snapshot.to, "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(snapshot.rank, "a1");
});

Deno.test("parseSectionEdge parses legacy snapshot", () => {
  const result = parseSectionEdge({
    kind: "SectionEdge",
    to: "019965a7-2789-740a-b8c1-1415904fd108",
    rank: "a1",
    container: "projects/focus",
    placement: { kind: "legacy", container: "projects/focus" },
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }

  const edge = result.value;
  assertEquals(edge.kind, "SectionEdge");
  assertEquals(edge.data.to.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
  const container = edge.data.placement.section.kind === "legacy"
    ? edge.data.placement.section.container.toString()
    : undefined;
  assertEquals(container, "projects/focus");
  assertEquals(edge.data.placement.rank.toString(), "a1");

  const snapshot = edge.toJSON();
  assertEquals(snapshot.kind, "SectionEdge");
  assertEquals(snapshot.to, "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(snapshot.rank, "a1");
  assertEquals(snapshot.container, "projects/focus");
  assert(snapshot.placement !== undefined, "placement snapshot should be persisted");
});

Deno.test("parseItemEdge rejects missing rank", () => {
  const result = parseItemEdge({
    kind: "ItemEdge",
    to: "019965a7-2789-740a-b8c1-1415904fd108",
  } as unknown);

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].path[0], "rank");
  assertEquals(result.error.issues[0].code, "required");
});

Deno.test("parseEdge dispatches based on kind", () => {
  const result = parseEdge({
    kind: "ItemEdge",
    to: "019965a7-2789-740a-b8c1-1415904fd108",
    rank: "a1",
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.kind, "ItemEdge");
});

Deno.test("parseEdge handles section edge without explicit kind", () => {
  const result = parseEdge({
    to: "019965a7-2789-740a-b8c1-1415904fd108",
    rank: "a1",
    container: "projects/focus",
  });

  if (result.type !== "ok") {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }

  assertEquals(result.value.kind, "SectionEdge");
});

Deno.test("sectionEdgeFromLegacy composes placement", () => {
  const itemEdge = unwrapOk(parseItemEdge({
    kind: "ItemEdge",
    to: "019965a7-2789-740a-b8c1-1415904fd108",
    rank: "a1",
  }), "parse item edge");
  const containerResult = parseContainerEdge({
    kind: "ContainerEdge",
    to: "projects/focus",
    index: 1,
  });
  const containerPath = unwrapOk(containerResult, "parse container").data.to;
  const sectionEdge = sectionEdgeFromLegacy(containerPath, itemEdge);
  assertEquals(sectionEdge.kind, "SectionEdge");
  const container = sectionEdge.data.placement.section.kind === "legacy"
    ? sectionEdge.data.placement.section.container.toString()
    : undefined;
  assertEquals(container, "projects/focus");
  assertEquals(sectionEdge.data.placement.rank.toString(), "a1");
});

Deno.test("parseEdge rejects unknown payload", () => {
  const result = parseEdge({ kind: "UnknownEdge" } as unknown);

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].code, "unknown_variant");
});
