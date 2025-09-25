import { createItemPlacement, createRootPlacement, parsePlacement } from "./placement.ts";
import { parseItemId, parseItemRank } from "../primitives/mod.ts";
import { parseSectionPath } from "../primitives/section_path.ts";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

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

const sampleParentId = unwrapOk(
  parseItemId("019965a7-2789-740a-b8c1-1415904fd108"),
  "parse parent id",
);
const sampleSection = unwrapOk(parseSectionPath(":2024-09-20"), "parse section path");
const sampleRank = unwrapOk(parseItemRank("a1"), "parse rank");

Deno.test("parsePlacement parses snapshot payload", () => {
  const snapshot = {
    kind: "item" as const,
    parentId: sampleParentId.toString(),
    section: sampleSection.toString(),
    rank: sampleRank.toString(),
  } as const;

  const result = parsePlacement(snapshot);
  const placement = unwrapOk(result, "parse placement");

  if (placement.kind() !== "item") {
    throw new Error("expected item placement");
  }

  assertEquals(placement.parentId()?.toString(), snapshot.parentId);
  assertEquals(placement.section()?.toString(), snapshot.section);
  assertEquals(placement.rank.toString(), snapshot.rank);

  const roundTrip = placement.toJSON();
  if (roundTrip.kind !== "item") {
    throw new Error("expected item snapshot");
  }
  assertEquals(roundTrip.parentId, snapshot.parentId);
  assertEquals(roundTrip.section, snapshot.section);
  assertEquals(roundTrip.rank, snapshot.rank);
});

Deno.test("createRootPlacement produces immutable placement", () => {
  const placement = createRootPlacement(sampleSection, sampleRank);
  assert(placement.kind() === "root", "expected root placement");
  assert(Object.isFrozen(placement), "placement should be frozen");
  const snapshot = placement.toJSON();
  assert(snapshot.kind === "root", "expected root snapshot");
  assert(Object.isFrozen(snapshot), "snapshot should be frozen");
});

Deno.test("createItemPlacement produces immutable placement", () => {
  const placement = createItemPlacement(sampleParentId, sampleSection, sampleRank);
  assert(placement.kind() === "item", "expected item placement");
  assert(Object.isFrozen(placement), "placement should be frozen");
  const snapshot = placement.toJSON();
  assert(snapshot.kind === "item", "expected item snapshot");
  assert(Object.isFrozen(snapshot), "snapshot should be frozen");
});
