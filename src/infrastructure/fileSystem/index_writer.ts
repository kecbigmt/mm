/**
 * Index Writer for mm doctor rebuild-index command
 *
 * Writes rebuilt index to disk atomically using temporary directories.
 */

import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { EdgeData } from "./index_rebuilder.ts";
import { AliasSnapshot } from "../../domain/models/alias.ts";

/**
 * Error during index writing
 */
export type WriteError = Readonly<{
  readonly kind: "write_error";
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}>;

/**
 * Statistics from writing operation
 */
export type WriteStats = Readonly<{
  readonly edgeFilesWritten: number;
  readonly aliasFilesWritten: number;
  readonly directoriesCreated: number;
}>;

/**
 * Write a single edge file
 */
const writeEdgeFile = async (
  filePath: string,
  edge: EdgeData,
  isParentEdge: boolean,
  parentId?: string,
): Promise<void> => {
  let content: string;
  if (isParentEdge && parentId) {
    // Parent edge format
    content = JSON.stringify(
      {
        schema: "mm.edge/1",
        from: parentId,
        to: edge.itemId.toString(),
        rank: edge.rank.toString(),
      },
      null,
      2,
    );
  } else {
    // Date edge format
    content = JSON.stringify(
      {
        schema: "mm.edge/1",
        to: edge.itemId.toString(),
        rank: edge.rank.toString(),
      },
      null,
      2,
    );
  }
  await Deno.writeTextFile(filePath, content);
};

/**
 * Write a single alias file
 */
const writeAliasFile = async (
  filePath: string,
  snapshot: AliasSnapshot,
): Promise<void> => {
  const content = JSON.stringify(
    {
      schema: "mm.alias/2",
      raw: snapshot.raw,
      canonicalKey: snapshot.canonicalKey,
      itemId: snapshot.itemId,
      createdAt: snapshot.createdAt,
    },
    null,
    2,
  );
  await Deno.writeTextFile(filePath, content);
};

/**
 * Ensure directory exists
 */
const ensureDir = async (dirPath: string): Promise<void> => {
  await Deno.mkdir(dirPath, { recursive: true });
};

/**
 * Remove directory recursively if it exists
 */
const removeDir = async (dirPath: string): Promise<void> => {
  try {
    await Deno.remove(dirPath, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
};

/**
 * Write graph index to temporary location
 */
export const writeGraphIndex = async (
  workspaceRoot: string,
  edges: Map<string, ReadonlyArray<EdgeData>>,
  options: { temp?: boolean } = {},
): Promise<Result<WriteStats, WriteError>> => {
  const targetDir = options.temp
    ? join(workspaceRoot, ".index", ".tmp-graph")
    : join(workspaceRoot, ".index", "graph");

  let edgeFilesWritten = 0;
  let directoriesCreated = 0;

  try {
    // Remove existing temp directory if it exists
    if (options.temp) {
      await removeDir(targetDir);
    }

    // Write edges by directory
    for (const [dirPath, edgeList] of edges) {
      const fullDirPath = join(targetDir, dirPath);
      await ensureDir(fullDirPath);
      directoriesCreated++;

      // Determine if this is a parent edge directory
      const isParentEdge = dirPath.startsWith("parents/");
      let parentId: string | undefined;
      if (isParentEdge) {
        // Extract parent ID from path: parents/<parent-uuid>/...
        const parts = dirPath.split("/");
        parentId = parts[1];
      }

      // Write each edge file
      for (const edge of edgeList) {
        const fileName = `${edge.itemId.toString()}.edge.json`;
        const filePath = join(fullDirPath, fileName);
        await writeEdgeFile(filePath, edge, isParentEdge, parentId);
        edgeFilesWritten++;
      }
    }

    return Result.ok({
      edgeFilesWritten,
      aliasFilesWritten: 0,
      directoriesCreated,
    });
  } catch (error) {
    return Result.error({
      kind: "write_error",
      message: "failed to write graph index",
      path: targetDir,
      cause: error,
    });
  }
};

/**
 * Write alias index to temporary location
 */
export const writeAliasIndex = async (
  workspaceRoot: string,
  aliases: Map<string, AliasSnapshot>,
  options: { temp?: boolean } = {},
): Promise<Result<WriteStats, WriteError>> => {
  const targetDir = options.temp
    ? join(workspaceRoot, ".index", ".tmp-aliases")
    : join(workspaceRoot, ".index", "aliases");

  let aliasFilesWritten = 0;
  let directoriesCreated = 0;
  const createdDirs = new Set<string>();

  try {
    // Remove existing temp directory if it exists
    if (options.temp) {
      await removeDir(targetDir);
    }

    // Write each alias file
    for (const [aliasPath, snapshot] of aliases) {
      // aliasPath format: "ab/abcd1234..."
      const parts = aliasPath.split("/");
      const hashPrefix = parts[0];
      const hash = parts[1];

      const dirPath = join(targetDir, hashPrefix);
      if (!createdDirs.has(dirPath)) {
        await ensureDir(dirPath);
        createdDirs.add(dirPath);
        directoriesCreated++;
      }

      const filePath = join(dirPath, `${hash}.alias.json`);
      await writeAliasFile(filePath, snapshot);
      aliasFilesWritten++;
    }

    return Result.ok({
      edgeFilesWritten: 0,
      aliasFilesWritten,
      directoriesCreated,
    });
  } catch (error) {
    return Result.error({
      kind: "write_error",
      message: "failed to write alias index",
      path: targetDir,
      cause: error,
    });
  }
};

/**
 * Replace existing index with temporary index (atomic operation)
 */
export const replaceIndex = async (
  workspaceRoot: string,
): Promise<Result<void, WriteError>> => {
  const indexDir = join(workspaceRoot, ".index");
  const graphDir = join(indexDir, "graph");
  const aliasesDir = join(indexDir, "aliases");
  const tmpGraphDir = join(indexDir, ".tmp-graph");
  const tmpAliasesDir = join(indexDir, ".tmp-aliases");

  try {
    // Remove existing directories
    await removeDir(graphDir);
    await removeDir(aliasesDir);

    // Rename temporary directories to final locations
    try {
      await Deno.rename(tmpGraphDir, graphDir);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
      // If tmp-graph doesn't exist, create empty graph directory
      await ensureDir(graphDir);
    }

    try {
      await Deno.rename(tmpAliasesDir, aliasesDir);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
      // If tmp-aliases doesn't exist, create empty aliases directory
      await ensureDir(aliasesDir);
    }

    return Result.ok(undefined);
  } catch (error) {
    return Result.error({
      kind: "write_error",
      message: "failed to replace index directories",
      path: indexDir,
      cause: error,
    });
  }
};

/**
 * Index writer interface
 */
export type IndexWriter = Readonly<{
  writeGraphIndex(
    workspaceRoot: string,
    edges: Map<string, ReadonlyArray<EdgeData>>,
    options?: { temp?: boolean },
  ): Promise<Result<WriteStats, WriteError>>;

  writeAliasIndex(
    workspaceRoot: string,
    aliases: Map<string, AliasSnapshot>,
    options?: { temp?: boolean },
  ): Promise<Result<WriteStats, WriteError>>;

  replaceIndex(workspaceRoot: string): Promise<Result<void, WriteError>>;
}>;

/**
 * Create an index writer
 */
export const createIndexWriter = (): IndexWriter => {
  return Object.freeze({
    writeGraphIndex,
    writeAliasIndex,
    replaceIndex,
  });
};
