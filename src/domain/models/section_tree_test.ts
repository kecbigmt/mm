import { assert, assertEquals } from "@std/assert";
import { createSectionNode, parseSectionTree } from "./section_tree.ts";
import type { SectionTreeSnapshot } from "./section_tree.ts";
import { parseSectionPath } from "../primitives/section_path.ts";
import { createItemEdge } from "./edge.ts";
import { parseItemId } from "../primitives/item_id.ts";
import { parseItemRank } from "../primitives/item_rank.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("section nodes remain immutable when adding children and edges", () => {
  const section = unwrapOk(parseSectionPath(":1"), "parse :1");
  const child = createSectionNode(section);

  const node = createSectionNode(section);
  const withChild = node.withSection(child);
  const id = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd108"), "parse item id");
  const rank = unwrapOk(parseItemRank("a"), "parse rank");
  const edge = createItemEdge(id, rank);
  const withEdge = node.withEdge(edge);

  assert(Object.isFrozen(withChild));
  assert(withChild.sections.length === 1);
  assert(Object.isFrozen(withEdge.edges));
  assertEquals(withEdge.edges.length, 1);
});

Deno.test("section tree can locate nested sections", () => {
  const snapshot = [
    {
      section: ":1",
      sections: [{ section: ":1-2" }],
    },
    {
      section: ":3",
    },
  ];

  const tree = unwrapOk(parseSectionTree(snapshot), "parse section tree");
  const childPath = unwrapOk(parseSectionPath(":1-2"), "parse :1-2");
  const rootPath = unwrapOk(parseSectionPath(":3"), "parse :3");

  const childNode = tree.findSection(childPath);
  assert(childNode);
  assertEquals(childNode?.section.toString(), ":1-2");

  const rootNode = tree.findSection(rootPath);
  assert(rootNode);
  assertEquals(rootNode?.section.toString(), ":3");
});

Deno.test("section tree snapshots round-trip with edges", () => {
  const snapshot: SectionTreeSnapshot = [
    {
      section: ":2",
      edges: [{
        kind: "ItemEdge",
        to: "019965a7-2789-740a-b8c1-1415904fd200",
        rank: "b",
      }],
      sections: [{
        section: ":2-1",
        edges: [{
          kind: "ItemEdge",
          to: "019965a7-2789-740a-b8c1-1415904fd201",
          rank: "c",
        }],
      }],
    },
  ];

  const tree = unwrapOk(parseSectionTree(snapshot), "parse tree with edges");
  const json = tree.toJSON();

  assertEquals(json, snapshot);
});

Deno.test("parseSectionTree rejects invalid hierarchy", () => {
  const snapshot = [
    {
      section: ":1",
      sections: [{
        section: ":2",
      }],
    },
  ];

  const result = parseSectionTree(snapshot);
  if (result.type !== "error") {
    throw new Error("expected hierarchy validation error");
  }

  assert(
    result.error.issues.some((issue) => issue.path.join("/") === "sections/0/sections/0/section"),
  );
});
