import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { Alias, AliasSnapshot, parseAlias } from "../../domain/models/alias.ts";
import { AliasSlug } from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { HashingService } from "../../domain/services/hashing_service.ts";

export type FileSystemAliasRepositoryDependencies = Readonly<{
  readonly root: string;
  readonly hashingService: HashingService;
}>;

type LoadResult = Result<Alias | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type ListResult = Result<ReadonlyArray<Alias>, RepositoryError>;

type Operation = "load" | "save" | "delete" | "list";

const aliasDirectory = (root: string): string => join(root, ".index", "aliases");
const aliasFilePath = (root: string, hash: string): string =>
  join(aliasDirectory(root), hash.slice(0, 2), `${hash}.alias.json`);

const readAliasSnapshot = async (
  path: string,
  canonicalKey: string,
): Promise<Result<AliasSnapshot, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as AliasSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.error(
        createRepositoryError("alias", "load", "alias was not found", {
          identifier: canonicalKey,
          cause: error,
        }),
      );
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("alias", "load", "alias file contains invalid JSON", {
          identifier: canonicalKey,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("alias", "load", "failed to read alias", {
        identifier: canonicalKey,
        cause: error,
      }),
    );
  }
};

const writeAliasSnapshot = async (
  path: string,
  snapshot: AliasSnapshot,
  canonicalKey: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
    const payload = JSON.stringify({ schema: "mm.alias/2", ...snapshot }, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("alias", "save", "failed to persist alias", {
        identifier: canonicalKey,
        cause: error,
      }),
    );
  }
};

const deleteAliasFile = async (
  path: string,
  canonicalKey: string,
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
        identifier: canonicalKey,
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
    for await (const shardEntry of Deno.readDir(directory)) {
      if (!shardEntry.isDirectory) {
        continue;
      }
      const shardPath = join(directory, shardEntry.name);
      for await (const fileEntry of Deno.readDir(shardPath)) {
        if (!fileEntry.isFile || !fileEntry.name.endsWith(".alias.json")) {
          continue;
        }
        const filePath = join(shardPath, fileEntry.name);
        const snapshotResult = await readAliasSnapshot(filePath, fileEntry.name);
        if (snapshotResult.type === "error") {
          return snapshotResult;
        }
        snapshots.push(snapshotResult.value);
      }
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

const hashCanonicalKey = async (
  hashingService: HashingService,
  canonicalKey: string,
  operation: Operation,
): Promise<Result<string, RepositoryError>> => {
  const hashResult = await hashingService.hash(canonicalKey);
  if (hashResult.type === "error") {
    return Result.error(
      createRepositoryError("alias", operation, "failed to hash canonical key", {
        identifier: canonicalKey,
        cause: hashResult.error,
      }),
    );
  }
  return Result.ok(hashResult.value);
};

export const createFileSystemAliasRepository = (
  dependencies: FileSystemAliasRepositoryDependencies,
): AliasRepository => {
  const load = async (slug: AliasSlug): Promise<LoadResult> => {
    const canonicalKey = slug.canonicalKey.toString();
    const hashResult = await hashCanonicalKey(dependencies.hashingService, canonicalKey, "load");
    if (hashResult.type === "error") {
      return Result.error(hashResult.error);
    }

    const filePath = aliasFilePath(dependencies.root, hashResult.value);
    const snapshotResult = await readAliasSnapshot(filePath, canonicalKey);
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
          identifier: canonicalKey,
          cause: parsed.error,
        }),
      );
    }
    return Result.ok(parsed.value);
  };

  const save = async (alias: Alias): Promise<SaveResult> => {
    const canonicalKey = alias.data.slug.canonicalKey.toString();
    const hashResult = await hashCanonicalKey(dependencies.hashingService, canonicalKey, "save");
    if (hashResult.type === "error") {
      return Result.error(hashResult.error);
    }

    const snapshot = alias.toJSON();
    const filePath = aliasFilePath(dependencies.root, hashResult.value);
    const writeResult = await writeAliasSnapshot(filePath, snapshot, canonicalKey);
    if (writeResult.type === "error") {
      if (writeResult.error.cause instanceof Deno.errors.NotFound) {
        return Result.error(
          createRepositoryError("alias", "save", "alias directory is unavailable", {
            identifier: canonicalKey,
            cause: writeResult.error.cause,
          }),
        );
      }
      return writeResult;
    }
    return Result.ok(undefined);
  };

  const remove = async (slug: AliasSlug): Promise<DeleteResult> => {
    const canonicalKey = slug.canonicalKey.toString();
    const hashResult = await hashCanonicalKey(dependencies.hashingService, canonicalKey, "delete");
    if (hashResult.type === "error") {
      return Result.error(hashResult.error);
    }

    const filePath = aliasFilePath(dependencies.root, hashResult.value);
    return await deleteAliasFile(filePath, canonicalKey);
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

    aliases.sort((a, b) =>
      a.data.slug.canonicalKey.toString().localeCompare(b.data.slug.canonicalKey.toString())
    );
    return Result.ok(Object.freeze(aliases.slice()));
  };

  return {
    load,
    save,
    delete: remove,
    list,
  };
};
