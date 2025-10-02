import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { Edge, EdgeSnapshot } from "../../domain/models/edge.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";

export type EdgeStoreOptions = Readonly<{
  readonly directory: string;
  readonly scope: "item" | "container";
  readonly identifier?: string;
}>;

const EDGE_SCHEMA = "mm.edge/1";

const sanitizeFileComponent = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, "_");

const edgeFileName = (edge: Edge): string => {
  if (edge.kind === "ItemEdge" || edge.kind === "SectionEdge") {
    return `${edge.data.to.toString()}.edge.json`;
  }
  const index = edge.data.index.value().toString().padStart(4, "0");
  const target = sanitizeFileComponent(edge.data.to.toString());
  return `container-${index}-${target}.edge.json`;
};

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
  const withKey = edges.map((edge) => {
    let key: string;
    if (edge.kind === "ItemEdge") {
      key = `item:${edge.data.to.toString()}:${edge.data.rank.toString()}`;
    } else if (edge.kind === "SectionEdge") {
      key = `section:${edge.data.to.toString()}:${edge.data.placement.rank.toString()}`;
    } else {
      key = `container:${
        edge.data.index.value().toString().padStart(4, "0")
      }:${edge.data.to.toString()}`;
    }
    return { key, edge };
  });
  withKey.sort((a, b) => a.key.localeCompare(b.key));
  return withKey.map((entry) => entry.edge);
};

const edgeSnapshotKey = (snapshot: EdgeSnapshot): string => {
  if ("rank" in snapshot && "container" in snapshot) {
    const rank = snapshot.rank ?? "";
    return `section:${snapshot.to}:${rank}`;
  }
  if ("rank" in snapshot) {
    const rank = snapshot.rank ?? "";
    return `item:${snapshot.to}:${rank}`;
  }
  if ("index" in snapshot) {
    const index = String(snapshot.index).padStart(4, "0");
    return `container:${index}:${snapshot.to}`;
  }
  return JSON.stringify(snapshot);
};

export const writeEdges = async (
  edges: ReadonlyArray<Edge>,
  options: EdgeStoreOptions,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.remove(options.directory, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      return Result.error(
        createRepositoryError(
          options.scope,
          "save",
          "failed to reset edges directory",
          { identifier: options.identifier, cause: error },
        ),
      );
    }
  }

  if (edges.length === 0) {
    return Result.ok(undefined);
  }

  try {
    await Deno.mkdir(options.directory, { recursive: true });
  } catch (error) {
    return Result.error(
      createRepositoryError(
        options.scope,
        "save",
        "failed to prepare edges directory",
        { identifier: options.identifier, cause: error },
      ),
    );
  }

  try {
    const ordered = sortEdges(edges);
    for (const edge of ordered) {
      await writeEdgeFile(options.directory, edge);
    }
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError(
        options.scope,
        "save",
        "failed to write edges",
        { identifier: options.identifier, cause: error },
      ),
    );
  }
};

export const readEdgeSnapshots = async (
  options: EdgeStoreOptions,
): Promise<Result<ReadonlyArray<EdgeSnapshot>, RepositoryError>> => {
  try {
    const entries: EdgeSnapshot[] = [];
    for await (const entry of Deno.readDir(options.directory)) {
      if (entry.isFile && entry.name.endsWith(".edge.json")) {
        const snapshot = await readEdgeFile(options.directory, entry.name);
        if (snapshot.schema === EDGE_SCHEMA) {
          const { schema: _schema, ...rest } = snapshot;
          entries.push(rest as EdgeSnapshot);
        } else {
          entries.push(snapshot as EdgeSnapshot);
        }
      }
    }
    entries.sort((a, b) => edgeSnapshotKey(a).localeCompare(edgeSnapshotKey(b)));
    return Result.ok(entries);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok([]);
    }
    return Result.error(
      createRepositoryError(
        options.scope,
        "load",
        "failed to read edges",
        { identifier: options.identifier, cause: error },
      ),
    );
  }
};
