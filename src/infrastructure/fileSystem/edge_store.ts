import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import type { Edge, EdgeSnapshot } from "../../domain/models/edge.ts";
import type {
  SectionNode,
  SectionNodeSnapshot,
  SectionTree,
  SectionTreeSnapshot,
} from "../../domain/models/section_tree.ts";
import { parseSectionPath, type SectionPath } from "../../domain/primitives/section_path.ts";
import type { SectionSegment } from "../../domain/primitives/section_segment.ts";

export type EdgeStoreOptions = Readonly<{
  readonly directory: string;
  readonly identifier?: string;
}>;

const EDGE_SCHEMA = "mm.edge/1";
const EDGE_FILE_SUFFIX = ".edge.json";
const DATE_DIRECTORY_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const NUMERIC_DIRECTORY_REGEX = /^\d+$/u;

type DirectoryListing = Readonly<{
  files: ReadonlyArray<string>;
  directories: ReadonlyArray<string>;
}>;

type PlacementTreeSnapshot = Readonly<{
  readonly edges: ReadonlyArray<EdgeSnapshot>;
  readonly sections?: SectionTreeSnapshot;
}>;

const sanitizeFileComponent = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, "_");

const edgeFileName = (edge: Edge): string =>
  `${sanitizeFileComponent(edge.data.to.toString())}${EDGE_FILE_SUFFIX}`;

const writeEdgeFile = async (
  directory: string,
  edge: Edge,
): Promise<void> => {
  const payload = JSON.stringify({ schema: EDGE_SCHEMA, ...edge.toJSON() }, null, 2);
  await Deno.writeTextFile(join(directory, edgeFileName(edge)), `${payload}\n`);
};

const readEdgeFile = async (
  directory: string,
  fileName: string,
): Promise<Record<string, unknown>> => {
  const text = await Deno.readTextFile(join(directory, fileName));
  return JSON.parse(text) as Record<string, unknown>;
};

const sortEdges = (edges: ReadonlyArray<Edge>): ReadonlyArray<Edge> => {
  const withKey = edges.map((edge) => ({
    key: `${edge.data.to.toString()}:${edge.data.rank.toString()}`,
    edge,
  }));
  withKey.sort((a, b) => a.key.localeCompare(b.key));
  return withKey.map((entry) => entry.edge);
};

const edgeSnapshotKey = (snapshot: EdgeSnapshot): string => {
  const rank = snapshot.rank ?? "";
  return `${snapshot.to}:${rank}`;
};

const listDirectory = async (path: string): Promise<DirectoryListing> => {
  const files: string[] = [];
  const directories: string[] = [];
  for await (const entry of Deno.readDir(path)) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isFile) {
      files.push(entry.name);
      continue;
    }
    if (entry.isDirectory) {
      directories.push(entry.name);
    }
  }
  files.sort();
  directories.sort();
  return { files, directories };
};

const directoryNameForSegment = (segment: SectionSegment): string =>
  segment.kind === "numeric" ? segment.raw.padStart(4, "0") : segment.raw;

const relativeSegments = (
  section: SectionPath,
  parent: SectionPath | undefined,
): ReadonlyArray<string> => {
  const parentLength = parent ? parent.segments.length : 0;
  return section.segments.slice(parentLength).map(directoryNameForSegment);
};

const writeEdgeFiles = async (
  directory: string,
  edges: ReadonlyArray<Edge>,
): Promise<void> => {
  if (edges.length === 0) {
    return;
  }
  const ordered = sortEdges(edges);
  for (const edge of ordered) {
    await writeEdgeFile(directory, edge);
  }
};

const writeSectionNodes = async (
  baseDirectory: string,
  nodes: ReadonlyArray<SectionNode>,
  parentSection: SectionPath | undefined,
  identifier?: string,
): Promise<Result<void, RepositoryError>> => {
  if (nodes.length === 0) {
    return Result.ok(undefined);
  }

  for (const node of nodes) {
    const segments = relativeSegments(node.section, parentSection);
    const nodeDirectory = join(baseDirectory, ...segments);
    try {
      await Deno.mkdir(nodeDirectory, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        return Result.error(
          createRepositoryError("item", "save", "failed to prepare section directory", {
            identifier,
            cause: error,
          }),
        );
      }
    }

    try {
      await writeEdgeFiles(nodeDirectory, node.edges);
    } catch (error) {
      return Result.error(
        createRepositoryError("item", "save", "failed to write section edges", {
          identifier,
          cause: error,
        }),
      );
    }

    const childResult = await writeSectionNodes(
      nodeDirectory,
      node.sections,
      node.section,
      identifier,
    );
    if (childResult.type === "error") {
      return childResult;
    }
  }

  return Result.ok(undefined);
};

const segmentRawFromDirectory = (name: string): string | undefined => {
  if (NUMERIC_DIRECTORY_REGEX.test(name)) {
    const value = Number(name);
    if (!Number.isFinite(value) || value <= 0) {
      return undefined;
    }
    return `${value}`;
  }
  if (DATE_DIRECTORY_REGEX.test(name)) {
    return name;
  }
  return undefined;
};

const parseSectionPathFromDirectory = (
  name: string,
  parent: SectionPath | undefined,
  identifier?: string,
): Result<SectionPath, RepositoryError> => {
  const raw = segmentRawFromDirectory(name);
  if (!raw) {
    return Result.error(
      createRepositoryError("item", "load", `unexpected section directory: ${name}`, {
        identifier,
      }),
    );
  }

  const composed = parent ? `${parent.toString()}-${raw}` : `:${raw}`;
  const parsed = parseSectionPath(composed);
  if (parsed.type === "error") {
    return Result.error(
      createRepositoryError("item", "load", "section directory is invalid", {
        identifier,
        cause: parsed.error,
      }),
    );
  }
  return Result.ok(parsed.value);
};

const readEdgeSnapshotsFromFiles = async (
  directory: string,
  fileNames: ReadonlyArray<string>,
  identifier?: string,
): Promise<Result<ReadonlyArray<EdgeSnapshot>, RepositoryError>> => {
  const edges: EdgeSnapshot[] = [];
  for (const fileName of fileNames) {
    if (!fileName.endsWith(EDGE_FILE_SUFFIX)) {
      return Result.error(
        createRepositoryError(
          "item",
          "load",
          `unexpected file in edges directory: ${fileName}`,
          { identifier },
        ),
      );
    }

    try {
      const snapshot = await readEdgeFile(directory, fileName);
      if (snapshot.schema === EDGE_SCHEMA) {
        const { schema: _schema, ...rest } = snapshot;
        edges.push(rest as EdgeSnapshot);
      } else {
        edges.push(snapshot as EdgeSnapshot);
      }
    } catch (error) {
      return Result.error(
        createRepositoryError("item", "load", "failed to read edges", {
          identifier,
          cause: error,
        }),
      );
    }
  }

  edges.sort((first, second) => edgeSnapshotKey(first).localeCompare(edgeSnapshotKey(second)));
  return Result.ok(edges);
};

const readSectionNodes = async (
  baseDirectory: string,
  directoryNames: ReadonlyArray<string>,
  parentSection: SectionPath | undefined,
  identifier?: string,
): Promise<Result<SectionTreeSnapshot, RepositoryError>> => {
  if (directoryNames.length === 0) {
    return Result.ok([]);
  }

  const sections: SectionNodeSnapshot[] = [];
  for (const name of directoryNames) {
    const nodeResult = await readSectionNode(
      baseDirectory,
      name,
      parentSection,
      identifier,
    );
    if (nodeResult.type === "error") {
      return nodeResult;
    }
    sections.push(nodeResult.value);
  }

  return Result.ok(sections);
};

const readSectionNode = async (
  parentDirectory: string,
  directoryName: string,
  parentSection: SectionPath | undefined,
  identifier?: string,
): Promise<Result<SectionNodeSnapshot, RepositoryError>> => {
  const sectionResult = parseSectionPathFromDirectory(directoryName, parentSection, identifier);
  if (sectionResult.type === "error") {
    return sectionResult;
  }
  const sectionPath = sectionResult.value;
  const nodeDirectory = join(parentDirectory, directoryName);

  let listing: DirectoryListing;
  try {
    listing = await listDirectory(nodeDirectory);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "load", "failed to read edges", {
        identifier,
        cause: error,
      }),
    );
  }

  const edgesResult = await readEdgeSnapshotsFromFiles(
    nodeDirectory,
    listing.files,
    identifier,
  );
  if (edgesResult.type === "error") {
    return edgesResult;
  }

  const sectionsResult = await readSectionNodes(
    nodeDirectory,
    listing.directories,
    sectionPath,
    identifier,
  );
  if (sectionsResult.type === "error") {
    return sectionsResult;
  }

  const snapshot: SectionNodeSnapshot = {
    section: sectionPath.toString(),
    ...(edgesResult.value.length > 0 ? { edges: edgesResult.value } : {}),
    ...(sectionsResult.value.length > 0 ? { sections: sectionsResult.value } : {}),
  };
  return Result.ok(snapshot);
};

export type { PlacementTreeSnapshot };

export const writePlacementTree = async (
  edges: ReadonlyArray<Edge>,
  sections: SectionTree,
  options: EdgeStoreOptions,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.remove(options.directory, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      return Result.error(
        createRepositoryError("item", "save", "failed to reset edges directory", {
          identifier: options.identifier,
          cause: error,
        }),
      );
    }
  }

  const hasSections = !sections.isEmpty();
  if (edges.length === 0 && !hasSections) {
    return Result.ok(undefined);
  }

  try {
    await Deno.mkdir(options.directory, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      return Result.error(
        createRepositoryError("item", "save", "failed to prepare edges directory", {
          identifier: options.identifier,
          cause: error,
        }),
      );
    }
  }

  try {
    await writeEdgeFiles(options.directory, edges);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "save", "failed to write edges", {
        identifier: options.identifier,
        cause: error,
      }),
    );
  }

  const sectionResult = await writeSectionNodes(
    options.directory,
    sections.sections,
    undefined,
    options.identifier,
  );
  if (sectionResult.type === "error") {
    return sectionResult;
  }

  return Result.ok(undefined);
};

export const readPlacementTree = async (
  options: EdgeStoreOptions,
): Promise<Result<PlacementTreeSnapshot, RepositoryError>> => {
  let listing: DirectoryListing;
  try {
    listing = await listDirectory(options.directory);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok({ edges: [] });
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read edges", {
        identifier: options.identifier,
        cause: error,
      }),
    );
  }

  const edgesResult = await readEdgeSnapshotsFromFiles(
    options.directory,
    listing.files,
    options.identifier,
  );
  if (edgesResult.type === "error") {
    return edgesResult;
  }

  const sectionsResult = await readSectionNodes(
    options.directory,
    listing.directories,
    undefined,
    options.identifier,
  );
  if (sectionsResult.type === "error") {
    return sectionsResult;
  }

  return Result.ok({
    edges: edgesResult.value,
    sections: sectionsResult.value.length > 0 ? sectionsResult.value : undefined,
  });
};
