import { createSectionNode, createSectionTree } from "./section_tree.ts";
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

Deno.test("section tree preserves immutability", () => {
  const section = unwrapOk(parseSectionPath(":1"), "parse section");
  const child = createSectionNode(section);
  const root = createSectionNode(section);
  const tree = createSectionTree(root);

  const nextRoot = tree.root.withSection(child);
  const nextTree = tree.withRoot(nextRoot);

  if (!Object.isFrozen(nextTree.root)) {
    throw new Error("expected section nodes to be frozen");
  }
  if (nextTree.root.sections.length !== 1) {
    throw new Error("expected child section to be appended");
  }
});

Deno.test("section node appends edges", () => {
  const section = unwrapOk(parseSectionPath(":1"), "parse section");
  const id = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd108"), "parse item id");
  const rank = unwrapOk(parseItemRank("a"), "parse rank");
  const edge = createItemEdge(id, rank);

  const node = createSectionNode(section);
  const next = node.withEdge(edge);

  if (next.edges.length !== 1) {
    throw new Error("expected edge to be appended");
  }
  if (!Object.isFrozen(next.edges)) {
    throw new Error("expected edges collection to be frozen");
  }
});
