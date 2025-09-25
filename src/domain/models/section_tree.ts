import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { parseSectionPath, SectionPath } from "../primitives/section_path.ts";
import { EdgeSnapshot, ItemEdge, parseItemEdge } from "./edge.ts";

const SECTION_TREE_KIND = "SectionTree" as const;

export type SectionNodeSnapshot = Readonly<{
  readonly section: string;
  readonly sections?: ReadonlyArray<SectionNodeSnapshot>;
  readonly edges?: ReadonlyArray<EdgeSnapshot>;
}>;

export type SectionTreeSnapshot = ReadonlyArray<SectionNodeSnapshot>;

export type SectionTreeValidationError = ValidationError<typeof SECTION_TREE_KIND>;

export type SectionNode = Readonly<{
  readonly section: SectionPath;
  readonly sections: ReadonlyArray<SectionNode>;
  readonly edges: ReadonlyArray<ItemEdge>;
  withSection(section: SectionNode): SectionNode;
  withSections(sections: ReadonlyArray<SectionNode>): SectionNode;
  withEdge(edge: ItemEdge): SectionNode;
  replaceSection(section: SectionNode): SectionNode;
  findSection(target: SectionPath): SectionNode | undefined;
  toJSON(): SectionNodeSnapshot;
}>;

const instantiateNode = (
  section: SectionPath,
  sections: ReadonlyArray<SectionNode> = [],
  edges: ReadonlyArray<ItemEdge> = [],
): SectionNode => {
  const frozenSections = Object.freeze([...sections]);
  const frozenEdges = Object.freeze([...edges]);
  return Object.freeze({
    section,
    sections: frozenSections,
    edges: frozenEdges,
    withSection(sectionNode: SectionNode) {
      return instantiateNode(section, [...sections, sectionNode], frozenEdges);
    },
    withSections(nextSections: ReadonlyArray<SectionNode>) {
      return instantiateNode(section, nextSections, frozenEdges);
    },
    withEdge(edge: ItemEdge) {
      return instantiateNode(section, frozenSections, [...edges, edge]);
    },
    replaceSection(sectionNode: SectionNode) {
      const index = sections.findIndex((entry) =>
        entry.section.toString() === sectionNode.section.toString()
      );
      if (index === -1) {
        return instantiateNode(section, [...sections, sectionNode], frozenEdges);
      }
      const copy = sections.slice();
      copy[index] = sectionNode;
      return instantiateNode(section, copy, frozenEdges);
    },
    findSection(target: SectionPath): SectionNode | undefined {
      if (section.toString() === target.toString()) {
        return this;
      }
      for (const child of sections) {
        const result = child.findSection(target);
        if (result) {
          return result;
        }
      }
      return undefined;
    },
    toJSON() {
      const snapshot: {
        section: string;
        sections?: SectionTreeSnapshot;
        edges?: ReadonlyArray<EdgeSnapshot>;
      } = {
        section: section.toString(),
      };

      if (sections.length > 0) {
        snapshot.sections = sections.map((child) => child.toJSON());
      }

      if (edges.length > 0) {
        snapshot.edges = edges.map((edge) => edge.toJSON());
      }

      return Object.freeze(snapshot);
    },
  });
};

export const createSectionNode = (
  section: SectionPath,
  sections: ReadonlyArray<SectionNode> = [],
  edges: ReadonlyArray<ItemEdge> = [],
): SectionNode => instantiateNode(section, sections, edges);

export type SectionTree = Readonly<{
  readonly sections: ReadonlyArray<SectionNode>;
  isEmpty(): boolean;
  withSection(section: SectionNode): SectionTree;
  withSections(sections: ReadonlyArray<SectionNode>): SectionTree;
  findSection(target: SectionPath): SectionNode | undefined;
  toJSON(): SectionTreeSnapshot;
}>;

const instantiateTree = (
  sections: ReadonlyArray<SectionNode> = [],
): SectionTree => {
  const frozenSections = Object.freeze([...sections]);
  return Object.freeze({
    sections: frozenSections,
    isEmpty: () => frozenSections.length === 0,
    withSection(sectionNode: SectionNode) {
      return instantiateTree([...sections, sectionNode]);
    },
    withSections(nextSections: ReadonlyArray<SectionNode>) {
      return instantiateTree(nextSections);
    },
    findSection(target: SectionPath): SectionNode | undefined {
      for (const node of sections) {
        const directMatch = node.section.toString() === target.toString();
        if (directMatch) {
          return node;
        }
        const result = node.findSection(target);
        if (result) {
          return result;
        }
      }
      return undefined;
    },
    toJSON() {
      return Object.freeze(sections.map((node) => node.toJSON()));
    },
  });
};

export const createSectionTree = (
  sections: ReadonlyArray<SectionNode> = [],
): SectionTree => instantiateTree(sections);

type NodeParseOutcome = Readonly<{
  node?: SectionNode;
  issues: ValidationIssue[];
}>;

const ensureDescendant = (
  parent: SectionPath | undefined,
  child: SectionPath,
): ValidationIssue[] => {
  if (!parent) {
    return [];
  }

  const parentSegments = parent.segments.map((segment) => segment.raw);
  const childSegments = child.segments.map((segment) => segment.raw);

  if (childSegments.length <= parentSegments.length) {
    return [
      createValidationIssue("section path must extend parent section", {
        code: "hierarchy",
        path: ["section"],
      }),
    ];
  }

  for (let index = 0; index < parentSegments.length; index += 1) {
    if (parentSegments[index] !== childSegments[index]) {
      return [
        createValidationIssue("section path must extend parent section", {
          code: "hierarchy",
          path: ["section"],
        }),
      ];
    }
  }

  return [];
};

const parseSectionNodeSnapshot = (
  snapshot: unknown,
  parentSection: SectionPath | undefined,
  basePath: ReadonlyArray<string | number>,
): NodeParseOutcome => {
  const issues: ValidationIssue[] = [];

  if (typeof snapshot !== "object" || snapshot === null) {
    issues.push(createValidationIssue("section node must be an object", {
      code: "type",
      path: basePath,
    }));
    return { issues };
  }

  const candidate = snapshot as SectionNodeSnapshot & Partial<Record<string, unknown>>;

  if (typeof candidate.section !== "string") {
    issues.push(createValidationIssue("section is required", {
      code: "required",
      path: [...basePath, "section"],
    }));
    return { issues };
  }

  const sectionResult = parseSectionPath(candidate.section);
  if (sectionResult.type === "error") {
    issues.push(
      ...sectionResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: [...basePath, "section", ...issue.path],
        })
      ),
    );
    return { issues };
  }

  const section = sectionResult.value;
  const hierarchyIssues = ensureDescendant(parentSection, section);
  if (hierarchyIssues.length > 0) {
    issues.push(
      ...hierarchyIssues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: [...basePath, ...issue.path],
        })
      ),
    );
  }

  const edges: ItemEdge[] = [];
  if (candidate.edges !== undefined) {
    if (!Array.isArray(candidate.edges)) {
      issues.push(createValidationIssue("edges must be an array", {
        code: "type",
        path: [...basePath, "edges"],
      }));
    } else {
      candidate.edges.forEach((edgeSnapshot, index) => {
        const result = parseItemEdge(edgeSnapshot);
        if (result.type === "error") {
          issues.push(
            ...result.error.issues.map((issue) =>
              createValidationIssue(issue.message, {
                code: issue.code,
                path: [...basePath, "edges", index, ...issue.path],
              })
            ),
          );
          return;
        }
        edges.push(result.value);
      });
    }
  }

  const sections: SectionNode[] = [];
  if (candidate.sections !== undefined) {
    if (!Array.isArray(candidate.sections)) {
      issues.push(createValidationIssue("sections must be an array", {
        code: "type",
        path: [...basePath, "sections"],
      }));
    } else {
      candidate.sections.forEach((childSnapshot, index) => {
        const outcome = parseSectionNodeSnapshot(
          childSnapshot,
          section,
          [...basePath, "sections", index],
        );
        issues.push(...outcome.issues);
        if (outcome.node) {
          sections.push(outcome.node);
        }
      });
    }
  }

  if (issues.length > 0) {
    return { issues };
  }

  return { node: createSectionNode(section, sections, edges), issues: [] };
};

export const parseSectionTree = (
  snapshot: unknown,
): Result<SectionTree, SectionTreeValidationError> => {
  if (snapshot === undefined) {
    return Result.ok(createSectionTree());
  }

  if (!Array.isArray(snapshot)) {
    return Result.error(
      createValidationError(SECTION_TREE_KIND, [
        createValidationIssue("section tree must be an array", {
          code: "type",
          path: ["sections"],
        }),
      ]),
    );
  }

  const sections: SectionNode[] = [];
  const issues: ValidationIssue[] = [];

  snapshot.forEach((nodeSnapshot, index) => {
    const outcome = parseSectionNodeSnapshot(nodeSnapshot, undefined, ["sections", index]);
    issues.push(...outcome.issues);
    if (outcome.node) {
      sections.push(outcome.node);
    }
  });

  if (issues.length > 0) {
    return Result.error(createValidationError(SECTION_TREE_KIND, issues));
  }

  return Result.ok(createSectionTree(sections));
};
