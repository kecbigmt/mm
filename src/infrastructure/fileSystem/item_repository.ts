import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { Item, ItemSnapshot, parseItem } from "../../domain/models/item.ts";
import { ItemId, ItemShortId, parseItemId } from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import {
  AmbiguousShortIdError,
  createAmbiguousShortIdError,
} from "../../domain/repositories/short_id_resolution_error.ts";
import { readEdgeSnapshots, writeEdges } from "./edge_store.ts";
import { EdgeSnapshot } from "../../domain/models/edge.ts";
import { PlacementBin } from "../../domain/models/placement.ts";

export type FileSystemItemRepositoryDependencies = Readonly<{
  readonly root: string;
}>;

type LoadResult = Result<Item | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type ListByPlacementBinResult = Result<ReadonlyArray<Item>, RepositoryError>;
type FindByShortIdResult = Result<Item | undefined, RepositoryError | AmbiguousShortIdError>;

type ItemMetaSnapshot = Omit<ItemSnapshot, "body" | "edges">;

type IndexEntry = Readonly<{ path: string }>;

const ITEM_SCHEMA = "mm.item/1";

const nodesDirectory = (root: string): string => join(root, "nodes");
const indexDirectory = (root: string): string => join(nodesDirectory(root), ".index");

const idString = (id: ItemId): string => id.toString();

const parseDateSegments = (iso: string): [string, string, string] => {
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-");
  return [year, month, day];
};

const itemDirectoryFromSnapshot = (root: string, snapshot: ItemSnapshot): string => {
  const [year, month, day] = parseDateSegments(snapshot.createdAt);
  return join(nodesDirectory(root), year, month, day, snapshot.id);
};

const itemDirectoryFromIndex = (
  root: string,
  indexPath: string,
  id: string,
): string => join(nodesDirectory(root), ...indexPath.split("/"), id);

const metaFilePath = (directory: string): string => join(directory, "meta.json");
const contentFilePath = (directory: string): string => join(directory, "content.md");
const edgesDirectory = (directory: string): string => join(directory, "edges");

const indexFilePath = (root: string, id: string): string =>
  join(indexDirectory(root), `${id}.json`);

const readIndexEntry = async (
  root: string,
  id: string,
): Promise<Result<IndexEntry | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(indexFilePath(root, id));
    const data = JSON.parse(text) as IndexEntry;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("item", "load", "index entry is invalid", {
          identifier: id,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read item index", {
        identifier: id,
        cause: error,
      }),
    );
  }
};

const readMetaSnapshot = async (
  directory: string,
  id: string,
): Promise<Result<ItemMetaSnapshot | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(metaFilePath(directory));
    const raw = JSON.parse(text) as ItemMetaSnapshot & { schema?: string };
    if (raw.schema === ITEM_SCHEMA) {
      const { schema: _schema, ...rest } = raw;
      return Result.ok(rest);
    }
    return Result.ok(raw);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("item", "load", "item meta is invalid", {
          identifier: id,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read item meta", {
        identifier: id,
        cause: error,
      }),
    );
  }
};

const readBody = async (
  directory: string,
  id: string,
): Promise<Result<string | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(contentFilePath(directory));
    const normalized = text.replace(/\r\n/g, "\n");
    const withoutTrailingNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
    const body = withoutTrailingNewline.trim() === "" ? undefined : withoutTrailingNewline;
    return Result.ok(body);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read item content", {
        identifier: id,
        cause: error,
      }),
    );
  }
};

const readEdgesSnapshots = async (
  directory: string,
  id: string,
): Promise<Result<ReadonlyArray<EdgeSnapshot>, RepositoryError>> =>
  await readEdgeSnapshots({ directory: edgesDirectory(directory), identifier: id });

const combineSnapshot = (
  meta: ItemMetaSnapshot,
  body: string | undefined,
  edges: ReadonlyArray<EdgeSnapshot>,
): ItemSnapshot => ({
  ...meta,
  body,
  edges: edges.length > 0 ? edges : undefined,
});

const parseSnapshot = (
  snapshot: ItemSnapshot,
): Result<Item, RepositoryError> => {
  const parsed = parseItem(snapshot);
  if (parsed.type === "error") {
    return Result.error(
      createRepositoryError("item", "load", "item data is invalid", {
        identifier: snapshot.id,
        cause: parsed.error,
      }),
    );
  }
  return Result.ok(parsed.value);
};

const writeMeta = async (
  directory: string,
  snapshot: ItemSnapshot,
): Promise<Result<void, RepositoryError>> => {
  const { body: _body, edges: _edges, ...meta } = snapshot;
  const payload = JSON.stringify({ schema: ITEM_SCHEMA, ...meta }, null, 2);
  try {
    await Deno.writeTextFile(metaFilePath(directory), `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "save", "failed to write item meta", {
        identifier: snapshot.id,
        cause: error,
      }),
    );
  }
};

const writeBody = async (
  directory: string,
  snapshot: ItemSnapshot,
): Promise<Result<void, RepositoryError>> => {
  const path = contentFilePath(directory);
  const body = snapshot.body;
  if (!body || body.trim() === "") {
    try {
      await Deno.remove(path);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        return Result.error(
          createRepositoryError("item", "save", "failed to remove item content", {
            identifier: snapshot.id,
            cause: error,
          }),
        );
      }
    }
    return Result.ok(undefined);
  }

  try {
    await Deno.writeTextFile(path, `${body}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "save", "failed to write item content", {
        identifier: snapshot.id,
        cause: error,
      }),
    );
  }
};

const writeIndexEntry = async (
  root: string,
  snapshot: ItemSnapshot,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(indexDirectory(root), { recursive: true });
    const [year, month, day] = parseDateSegments(snapshot.createdAt);
    const payload = JSON.stringify({ path: `${year}/${month}/${day}` }, null, 2);
    await Deno.writeTextFile(indexFilePath(root, snapshot.id), `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "save", "failed to write item index", {
        identifier: snapshot.id,
        cause: error,
      }),
    );
  }
};

const deleteIndexEntry = async (
  root: string,
  id: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.remove(indexFilePath(root, id));
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("item", "delete", "failed to update item index", {
        identifier: id,
        cause: error,
      }),
    );
  }
};

const findIdsByShortId = async (
  root: string,
  shortId: ItemShortId,
): Promise<Result<string[], RepositoryError>> => {
  const shortIdStr = shortId.toString();
  const matchingIds: string[] = [];

  try {
    const indexDir = indexDirectory(root);
    try {
      const entries = Deno.readDir(indexDir);
      for await (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const id = entry.name.slice(0, -5); // Remove .json extension
          if (id.endsWith(shortIdStr)) {
            matchingIds.push(id);
          }
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // Index directory doesn't exist, no items
        return Result.ok([]);
      }
      throw error;
    }

    return Result.ok(matchingIds);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "findByShortId", "failed to scan index directory", {
        identifier: shortIdStr,
        cause: error,
      }),
    );
  }
};

const listItemIds = async (
  root: string,
): Promise<Result<string[], RepositoryError>> => {
  const ids: string[] = [];

  try {
    const indexDir = indexDirectory(root);
    try {
      const entries = Deno.readDir(indexDir);
      for await (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          ids.push(entry.name.slice(0, -5));
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.ok([]);
      }
      throw error;
    }

    return Result.ok(ids);
  } catch (error) {
    return Result.error(
      createRepositoryError("item", "list", "failed to scan item index", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemItemRepository = (
  dependencies: FileSystemItemRepositoryDependencies,
): ItemRepository => {
  const load = async (id: ItemId): Promise<LoadResult> => {
    const idStr = idString(id);
    const indexResult = await readIndexEntry(dependencies.root, idStr);
    if (indexResult.type === "error") {
      return indexResult;
    }

    const entry = indexResult.value;
    if (!entry) {
      return Result.ok(undefined);
    }

    const directory = itemDirectoryFromIndex(dependencies.root, entry.path, idStr);

    const metaResult = await readMetaSnapshot(directory, idStr);
    if (metaResult.type === "error") {
      return metaResult;
    }
    if (!metaResult.value) {
      return Result.ok(undefined);
    }

    const bodyResult = await readBody(directory, idStr);
    if (bodyResult.type === "error") {
      return bodyResult;
    }

    const edgesResult = await readEdgesSnapshots(directory, idStr);
    if (edgesResult.type === "error") {
      return edgesResult;
    }

    const snapshot = combineSnapshot(metaResult.value, bodyResult.value, edgesResult.value);
    return parseSnapshot(snapshot);
  };

  const save = async (item: Item): Promise<SaveResult> => {
    const snapshot = item.toJSON();
    const directory = itemDirectoryFromSnapshot(dependencies.root, snapshot);

    try {
      await Deno.mkdir(directory, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        return Result.error(
          createRepositoryError("item", "save", "failed to prepare item directory", {
            identifier: snapshot.id,
            cause: error,
          }),
        );
      }
    }

    const metaResult = await writeMeta(directory, snapshot);
    if (metaResult.type === "error") {
      return metaResult;
    }

    const contentResult = await writeBody(directory, snapshot);
    if (contentResult.type === "error") {
      return contentResult;
    }

    const edgesResult = await writeEdges(item.edges, {
      directory: edgesDirectory(directory),
      identifier: snapshot.id,
    });
    if (edgesResult.type === "error") {
      return edgesResult;
    }

    const indexResult = await writeIndexEntry(dependencies.root, snapshot);
    if (indexResult.type === "error") {
      return indexResult;
    }

    return Result.ok(undefined);
  };

  const remove = async (id: ItemId): Promise<DeleteResult> => {
    const idStr = idString(id);
    const indexResult = await readIndexEntry(dependencies.root, idStr);
    if (indexResult.type === "error") {
      return indexResult;
    }

    const entry = indexResult.value;
    if (!entry) {
      return Result.ok(undefined);
    }

    const directory = itemDirectoryFromIndex(dependencies.root, entry.path, idStr);
    try {
      await Deno.remove(directory, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        return Result.error(
          createRepositoryError("item", "delete", "failed to remove item directory", {
            identifier: idStr,
            cause: error,
          }),
        );
      }
    }

    const indexDeleteResult = await deleteIndexEntry(dependencies.root, idStr);
    if (indexDeleteResult.type === "error") {
      return indexDeleteResult;
    }

    return Result.ok(undefined);
  };

  const listByPlacementBin = async (
    bin: PlacementBin,
  ): Promise<ListByPlacementBinResult> => {
    const idsResult = await listItemIds(dependencies.root);
    if (idsResult.type === "error") {
      return idsResult;
    }

    const items: Item[] = [];

    for (const idStr of idsResult.value) {
      const itemIdResult = parseItemId(idStr);
      if (itemIdResult.type === "error") {
        return Result.error(
          createRepositoryError("item", "list", "invalid item ID in index", {
            identifier: idStr,
            cause: itemIdResult.error,
          }),
        );
      }

      const itemResult = await load(itemIdResult.value);
      if (itemResult.type === "error") {
        return itemResult;
      }

      const item = itemResult.value;
      if (!item) {
        return Result.error(
          createRepositoryError("item", "list", "item index entry is stale", {
            identifier: idStr,
          }),
        );
      }

      if (item.data.placement.belongsTo(bin)) {
        items.push(item);
      }
    }

    items.sort((first, second) => first.data.placement.rank.compare(second.data.placement.rank));

    return Result.ok(items);
  };

  const findByShortId = async (shortId: ItemShortId): Promise<FindByShortIdResult> => {
    const idsResult = await findIdsByShortId(dependencies.root, shortId);
    if (idsResult.type === "error") {
      return idsResult;
    }

    const matchingIds = idsResult.value;

    if (matchingIds.length === 0) {
      return Result.ok(undefined);
    }

    if (matchingIds.length > 1) {
      return Result.error(createAmbiguousShortIdError(shortId.toString(), matchingIds.length));
    }

    // Exactly one match - load and return the item
    const itemIdResult = parseItemId(matchingIds[0]);
    if (itemIdResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "findByShortId", "invalid item ID in index", {
          identifier: matchingIds[0],
        }),
      );
    }

    return await load(itemIdResult.value);
  };

  return {
    load,
    save,
    delete: remove,
    listByPlacementBin,
    findByShortId,
  };
};
