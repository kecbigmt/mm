import { dirname, join } from "jsr:@std/path";
import { Result } from "../../shared/result.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { Alias, AliasSnapshot, parseAlias } from "../../domain/models/alias.ts";
import { AliasSlug } from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";

export type FileSystemAliasRepositoryDependencies = Readonly<{
  readonly root: string;
}>;

type LoadResult = Result<Alias | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type ListResult = Result<ReadonlyArray<Alias>, RepositoryError>;

const aliasDirectory = (root: string): string => join(root, "aliases");
const aliasFilePath = (root: string, slug: string): string =>
  join(aliasDirectory(root), `${slug}.alias.json`);

const readAliasSnapshot = async (
  path: string,
  slug: string,
): Promise<Result<AliasSnapshot, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as AliasSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.error(
        createRepositoryError("alias", "load", "alias was not found", {
          identifier: slug,
          cause: error,
        }),
      );
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("alias", "load", "alias file contains invalid JSON", {
          identifier: slug,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("alias", "load", "failed to read alias", {
        identifier: slug,
        cause: error,
      }),
    );
  }
};

const writeAliasSnapshot = async (
  path: string,
  snapshot: AliasSnapshot,
  slug: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
    const payload = JSON.stringify({ schema: "mm.alias/1", ...snapshot }, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("alias", "save", "failed to persist alias", {
        identifier: slug,
        cause: error,
      }),
    );
  }
};

const deleteAliasFile = async (
  path: string,
  slug: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.remove(path);
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("alias", "delete", "failed to delete alias", {
        identifier: slug,
        cause: error,
      }),
    );
  }
};

const listAliasFiles = async (
  root: string,
): Promise<Result<AliasSnapshot[], RepositoryError>> => {
  const directory = aliasDirectory(root);
  const snapshots: AliasSnapshot[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(".alias.json")) {
        continue;
      }
      const slug = entry.name.replace(/\.alias\.json$/, "");
      const filePath = join(directory, entry.name);
      const snapshotResult = await readAliasSnapshot(filePath, slug);
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
      createRepositoryError("alias", "list", "failed to list aliases", { cause: error }),
    );
  }
};

export const createFileSystemAliasRepository = (
  dependencies: FileSystemAliasRepositoryDependencies,
): AliasRepository => {
  const load = async (slug: AliasSlug): Promise<LoadResult> => {
    const filePath = aliasFilePath(dependencies.root, slug.toString());
    const snapshotResult = await readAliasSnapshot(filePath, slug.toString());
    if (snapshotResult.type === "error") {
      if (snapshotResult.error.cause instanceof Deno.errors.NotFound) {
        return Result.ok(undefined);
      }
      return Result.error(snapshotResult.error);
    }

    const parsed = parseAlias(snapshotResult.value);
    if (parsed.type === "error") {
      return Result.error(
        createRepositoryError("alias", "load", "alias data is invalid", {
          identifier: slug.toString(),
          cause: parsed.error,
        }),
      );
    }
    return Result.ok(parsed.value);
  };

  const save = async (alias: Alias): Promise<SaveResult> => {
    const snapshot = alias.toJSON();
    const filePath = aliasFilePath(dependencies.root, snapshot.slug);
    const writeResult = await writeAliasSnapshot(filePath, snapshot, snapshot.slug);
    if (writeResult.type === "error") {
      if (writeResult.error.cause instanceof Deno.errors.NotFound) {
        return Result.error(
          createRepositoryError("alias", "save", "alias directory is unavailable", {
            identifier: snapshot.slug,
            cause: writeResult.error.cause,
          }),
        );
      }
      return writeResult;
    }
    return Result.ok(undefined);
  };

  const remove = async (slug: AliasSlug): Promise<DeleteResult> => {
    const filePath = aliasFilePath(dependencies.root, slug.toString());
    return await deleteAliasFile(filePath, slug.toString());
  };

  const list = async (): Promise<ListResult> => {
    const snapshotResult = await listAliasFiles(dependencies.root);
    if (snapshotResult.type === "error") {
      return snapshotResult;
    }

    const aliases: Alias[] = [];
    for (const snapshot of snapshotResult.value) {
      const parsed = parseAlias(snapshot);
      if (parsed.type === "error") {
        return Result.error(
          createRepositoryError("alias", "list", "alias data is invalid", {
            cause: parsed.error,
          }),
        );
      }
      aliases.push(parsed.value);
    }

    aliases.sort((a, b) => a.data.slug.toString().localeCompare(b.data.slug.toString()));
    return Result.ok(Object.freeze(aliases.slice()));
  };

  return {
    load,
    save,
    delete: remove,
    list,
  };
};
