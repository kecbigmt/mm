import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import type { Edge, EdgeSnapshot } from "../../domain/models/edge.ts";

const EDGE_SCHEMA = "mm.edge/1";
const EDGE_FILE_SUFFIX = ".edge.json";

export type EdgeStoreOptions = Readonly<{
  readonly directory: string;
  readonly identifier?: string;
}>;

export type EdgeCollectionSnapshot = Readonly<{
  readonly edges: ReadonlyArray<EdgeSnapshot>;
}>;

const edgeFileName = (edge: Edge): string => `${edge.data.to.toString()}${EDGE_FILE_SUFFIX}`;

const ensureDirectory = async (
  directory: string,
  identifier?: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(directory, { recursive: true });
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("item", "save", "failed to prepare edges directory", {
        identifier,
        cause: error,
      }),
    );
  }
};

const clearExistingEdgeFiles = async (
  directory: string,
  identifier?: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isFile && entry.name.endsWith(EDGE_FILE_SUFFIX)) {
        await Deno.remove(join(directory, entry.name));
      }
    }
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("item", "save", "failed to reset edges directory", {
        identifier,
        cause: error,
      }),
    );
  }
};

const writeEdgeFile = async (
  directory: string,
  edge: Edge,
  identifier?: string,
): Promise<Result<void, RepositoryError>> => {
  const snapshot = edge.toJSON();
  const payload = JSON.stringify({ schema: EDGE_SCHEMA, ...snapshot }, null, 2);
  try {
    await Deno.writeTextFile(join(directory, edgeFileName(edge)), `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "save", "failed to write edge file", {
        identifier,
        cause: error,
      }),
    );
  }
};

export const writeEdgeCollection = async (
  edges: ReadonlyArray<Edge>,
  options: EdgeStoreOptions,
): Promise<Result<void, RepositoryError>> => {
  const directory = options.directory;
  const prepareResult = await ensureDirectory(directory, options.identifier);
  if (prepareResult.type === "error") {
    return prepareResult;
  }

  const clearResult = await clearExistingEdgeFiles(directory, options.identifier);
  if (clearResult.type === "error") {
    return clearResult;
  }

  for (const edge of edges) {
    const writeResult = await writeEdgeFile(directory, edge, options.identifier);
    if (writeResult.type === "error") {
      return writeResult;
    }
  }

  return Result.ok(undefined);
};

const readEdgeFile = async (
  directory: string,
  fileName: string,
  identifier?: string,
): Promise<Result<EdgeSnapshot, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(join(directory, fileName));
    const raw = JSON.parse(text) as EdgeSnapshot & { schema?: string };
    if (raw.schema === EDGE_SCHEMA) {
      const { schema: _schema, ...snapshot } = raw;
      return Result.ok(snapshot);
    }
    return Result.ok(raw as EdgeSnapshot);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("item", "load", "edge file is invalid JSON", {
          identifier,
          cause: error,
        }),
      );
    }
    if (error instanceof Deno.errors.NotFound) {
      return Result.error(
        createRepositoryError("item", "load", "edge file is missing", {
          identifier,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read edge file", {
        identifier,
        cause: error,
      }),
    );
  }
};

export const readEdgeCollection = async (
  options: EdgeStoreOptions,
): Promise<Result<EdgeCollectionSnapshot, RepositoryError>> => {
  const directory = options.directory;
  try {
    const edges: EdgeSnapshot[] = [];
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(EDGE_FILE_SUFFIX)) {
        continue;
      }
      const snapshotResult = await readEdgeFile(directory, entry.name, options.identifier);
      if (snapshotResult.type === "error") {
        return snapshotResult;
      }
      edges.push(snapshotResult.value);
    }
    edges.sort((first, second) => first.to.localeCompare(second.to));
    return Result.ok({ edges });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok({ edges: [] });
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read edges directory", {
        identifier: options.identifier,
        cause: error,
      }),
    );
  }
};
