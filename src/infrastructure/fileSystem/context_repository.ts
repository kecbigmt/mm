import { dirname, join } from "jsr:@std/path";
import { Result } from "../../shared/result.ts";
import { ContextRepository } from "../../domain/repositories/context_repository.ts";
import { Context, ContextSnapshot, parseContext } from "../../domain/models/context.ts";
import { ContextTag } from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";

export type FileSystemContextRepositoryDependencies = Readonly<{
  readonly root: string;
}>;

type LoadResult = Result<Context | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type ListResult = Result<ReadonlyArray<Context>, RepositoryError>;

const contextDirectory = (root: string): string => join(root, "contexts");
const contextFilePath = (root: string, tag: string): string =>
  join(contextDirectory(root), `${tag}.context.json`);

const readContextSnapshot = async (
  path: string,
  tag: string,
): Promise<Result<ContextSnapshot, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as ContextSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.error(
        createRepositoryError("context", "load", "context was not found", {
          identifier: tag,
          cause: error,
        }),
      );
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("context", "load", "context file contains invalid JSON", {
          identifier: tag,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("context", "load", "failed to read context", {
        identifier: tag,
        cause: error,
      }),
    );
  }
};

const writeContextSnapshot = async (
  path: string,
  snapshot: ContextSnapshot,
  tag: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
    const payload = JSON.stringify({ schema: "mm.context/1", ...snapshot }, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("context", "save", "failed to persist context", {
        identifier: tag,
        cause: error,
      }),
    );
  }
};

const deleteContextFile = async (
  path: string,
  tag: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.remove(path);
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("context", "delete", "failed to delete context", {
        identifier: tag,
        cause: error,
      }),
    );
  }
};

const listContextFiles = async (
  root: string,
): Promise<Result<ContextSnapshot[], RepositoryError>> => {
  const directory = contextDirectory(root);
  const snapshots: ContextSnapshot[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(".context.json")) {
        continue;
      }
      const tag = entry.name.replace(/\.context\.json$/, "");
      const filePath = join(directory, entry.name);
      const snapshotResult = await readContextSnapshot(filePath, tag);
      if (snapshotResult.type === "error") {
        return snapshotResult;
      }
      snapshots.push(snapshotResult.value);
    }
    return Result.ok(snapshots);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok([]);
    }
    return Result.error(
      createRepositoryError("context", "list", "failed to list contexts", { cause: error }),
    );
  }
};

export const createFileSystemContextRepository = (
  dependencies: FileSystemContextRepositoryDependencies,
): ContextRepository => {
  const load = async (tag: ContextTag): Promise<LoadResult> => {
    const filePath = contextFilePath(dependencies.root, tag.toString());
    const snapshotResult = await readContextSnapshot(filePath, tag.toString());
    if (snapshotResult.type === "error") {
      if (snapshotResult.error.cause instanceof Deno.errors.NotFound) {
        return Result.ok(undefined);
      }
      return Result.error(snapshotResult.error);
    }

    const parsed = parseContext(snapshotResult.value);
    if (parsed.type === "error") {
      return Result.error(
        createRepositoryError("context", "load", "context data is invalid", {
          identifier: tag.toString(),
          cause: parsed.error,
        }),
      );
    }
    return Result.ok(parsed.value);
  };

  const save = async (context: Context): Promise<SaveResult> => {
    const snapshot = context.toJSON();
    const filePath = contextFilePath(dependencies.root, snapshot.tag);
    const writeResult = await writeContextSnapshot(filePath, snapshot, snapshot.tag);
    if (writeResult.type === "error") {
      return writeResult;
    }
    return Result.ok(undefined);
  };

  const remove = async (tag: ContextTag): Promise<DeleteResult> => {
    const filePath = contextFilePath(dependencies.root, tag.toString());
    return await deleteContextFile(filePath, tag.toString());
  };

  const list = async (): Promise<ListResult> => {
    const snapshotResult = await listContextFiles(dependencies.root);
    if (snapshotResult.type === "error") {
      return snapshotResult;
    }

    const contexts: Context[] = [];
    for (const snapshot of snapshotResult.value) {
      const parsed = parseContext(snapshot);
      if (parsed.type === "error") {
        return Result.error(
          createRepositoryError("context", "list", "context data is invalid", {
            cause: parsed.error,
          }),
        );
      }
      contexts.push(parsed.value);
    }

    contexts.sort((a, b) => a.data.tag.toString().localeCompare(b.data.tag.toString()));
    return Result.ok(Object.freeze(contexts.slice()));
  };

  return {
    load,
    save,
    delete: remove,
    list,
  };
};
