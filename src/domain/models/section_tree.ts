import { SectionPath } from "../primitives/section_path.ts";
import { ItemEdge } from "./edge.ts";

export type SectionNode = Readonly<{
  readonly section: SectionPath;
  readonly sections: ReadonlyArray<SectionNode>;
  readonly edges: ReadonlyArray<ItemEdge>;
  withSection(section: SectionNode): SectionNode;
  withEdge(edge: ItemEdge): SectionNode;
}>;

const instantiate = (
  section: SectionPath,
  sections: ReadonlyArray<SectionNode> = [],
  edges: ReadonlyArray<ItemEdge> = [],
): SectionNode =>
  Object.freeze({
    section,
    sections: Object.freeze([...sections]),
    edges: Object.freeze([...edges]),
    withSection(sectionNode: SectionNode) {
      return instantiate(section, [...sections, sectionNode], edges);
    },
    withEdge(edge: ItemEdge) {
      return instantiate(section, sections, [...edges, edge]);
    },
  });

export const createSectionNode = (
  section: SectionPath,
  sections: ReadonlyArray<SectionNode> = [],
  edges: ReadonlyArray<ItemEdge> = [],
): SectionNode => instantiate(section, sections, edges);

export type SectionTree = Readonly<{
  readonly root: SectionNode;
  withRoot(node: SectionNode): SectionTree;
}>;

export const createSectionTree = (root: SectionNode): SectionTree =>
  Object.freeze({
    root,
    withRoot(node: SectionNode) {
      return createSectionTree(node);
    },
  });
