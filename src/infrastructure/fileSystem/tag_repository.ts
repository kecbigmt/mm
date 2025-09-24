import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { TagRepository } from "../../domain/repositories/tag_repository.ts";
import { parseTag, Tag, TagSnapshot } from "../../domain/models/tag.ts";
import { TagSlug } from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { HashingService } from "../../domain/services/hashing_service.ts";

export type FileSystemTagRepositoryDependencies = Readonly<{
  readonly root: string;
  readonly hashingService: HashingService;
}>;

type LoadResult = Result<Tag | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type ListResult = Result<ReadonlyArray<Tag>, RepositoryError>;

type Operation = "load" | "save" | "delete" | "list";

const tagDirectory = (root: string): string => join(root, "tags");
const tagFilePath = (root: string, hash: string): string =>
  join(tagDirectory(root), `${hash}.tag.json`);

const readTagSnapshot = async (
  path: string,
  canonicalAlias: string,
): Promise<Result<TagSnapshot, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as TagSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.error(
        createRepositoryError("tag", "load", "tag was not found", {
          identifier: canonicalAlias,
          cause: error,
        }),
      );
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("tag", "load", "tag file contains invalid JSON", {
          identifier: canonicalAlias,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("tag", "load", "failed to read tag", {
        identifier: canonicalAlias,
        cause: error,
      }),
    );
  }
};

const writeTagSnapshot = async (
  path: string,
  snapshot: TagSnapshot,
  canonicalAlias: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
    const payload = JSON.stringify({ schema: "mm.tag/1", ...snapshot }, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("tag", "save", "failed to persist tag", {
        identifier: canonicalAlias,
        cause: error,
      }),
    );
  }
};

const deleteTagFile = async (
  path: string,
  canonicalAlias: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.remove(path);
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("tag", "delete", "failed to delete tag", {
        identifier: canonicalAlias,
        cause: error,
      }),
    );
  }
};

const listTagFiles = async (
  root: string,
): Promise<Result<TagSnapshot[], RepositoryError>> => {
  const directory = tagDirectory(root);
  const snapshots: TagSnapshot[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(".tag.json")) {
        continue;
      }
      const filePath = join(directory, entry.name);
      const snapshotResult = await readTagSnapshot(filePath, entry.name);
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
      createRepositoryError("tag", "list", "failed to list tags", { cause: error }),
    );
  }
};

const hashCanonicalAlias = async (
  hashingService: HashingService,
  canonicalAlias: string,
  operation: Operation,
): Promise<Result<string, RepositoryError>> => {
  const hashResult = await hashingService.hash(canonicalAlias);
  if (hashResult.type === "error") {
    return Result.error(
      createRepositoryError("tag", operation, "failed to hash canonical alias", {
        identifier: canonicalAlias,
        cause: hashResult.error,
      }),
    );
  }
  return Result.ok(hashResult.value);
};

export const createFileSystemTagRepository = (
  dependencies: FileSystemTagRepositoryDependencies,
): TagRepository => {
  const load = async (alias: TagSlug): Promise<LoadResult> => {
    const canonicalAlias = alias.canonicalKey.toString();
    const hashResult = await hashCanonicalAlias(
      dependencies.hashingService,
      canonicalAlias,
      "load",
    );
    if (hashResult.type === "error") {
      return Result.error(hashResult.error);
    }

    const filePath = tagFilePath(dependencies.root, hashResult.value);
    const snapshotResult = await readTagSnapshot(filePath, canonicalAlias);
    if (snapshotResult.type === "error") {
      if (snapshotResult.error.cause instanceof Deno.errors.NotFound) {
        return Result.ok(undefined);
      }
      return Result.error(snapshotResult.error);
    }

    const parsed = parseTag(snapshotResult.value);
    if (parsed.type === "error") {
      return Result.error(
        createRepositoryError("tag", "load", "tag data is invalid", {
          identifier: canonicalAlias,
          cause: parsed.error,
        }),
      );
    }
    return Result.ok(parsed.value);
  };

  const save = async (tag: Tag): Promise<SaveResult> => {
    const canonicalAlias = tag.data.alias.canonicalKey.toString();
    const hashResult = await hashCanonicalAlias(
      dependencies.hashingService,
      canonicalAlias,
      "save",
    );
    if (hashResult.type === "error") {
      return Result.error(hashResult.error);
    }

    const snapshot = tag.toJSON();
    const filePath = tagFilePath(dependencies.root, hashResult.value);
    const writeResult = await writeTagSnapshot(filePath, snapshot, canonicalAlias);
    if (writeResult.type === "error") {
      return writeResult;
    }
    return Result.ok(undefined);
  };

  const remove = async (alias: TagSlug): Promise<DeleteResult> => {
    const canonicalAlias = alias.canonicalKey.toString();
    const hashResult = await hashCanonicalAlias(
      dependencies.hashingService,
      canonicalAlias,
      "delete",
    );
    if (hashResult.type === "error") {
      return Result.error(hashResult.error);
    }

    const filePath = tagFilePath(dependencies.root, hashResult.value);
    return await deleteTagFile(filePath, canonicalAlias);
  };

  const list = async (): Promise<ListResult> => {
    const snapshotResult = await listTagFiles(dependencies.root);
    if (snapshotResult.type === "error") {
      return snapshotResult;
    }

    const tags: Tag[] = [];
    for (const snapshot of snapshotResult.value) {
      const parsed = parseTag(snapshot);
      if (parsed.type === "error") {
        return Result.error(
          createRepositoryError("tag", "list", "tag data is invalid", {
            cause: parsed.error,
          }),
        );
      }
      tags.push(parsed.value);
    }

    tags.sort((a, b) =>
      a.data.alias.canonicalKey.toString().localeCompare(b.data.alias.canonicalKey.toString())
    );
    return Result.ok(Object.freeze(tags.slice()));
  };

  return {
    load,
    save,
    delete: remove,
    list,
  };
};
