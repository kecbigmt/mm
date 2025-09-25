import { parseEdge, parseItemEdge } from "./edge.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

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

Deno.test("parseEdge rejects unknown payload", () => {
  const result = parseEdge({ kind: "UnknownEdge" } as unknown);

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  assertEquals(result.error.issues.length, 1);
  assertEquals(result.error.issues[0].code, "unknown_variant");
});
