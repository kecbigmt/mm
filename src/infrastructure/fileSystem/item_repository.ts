import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { Item, ItemSnapshot, parseItem } from "../../domain/models/item.ts";
import { ItemId, Path } from "../../domain/primitives/mod.ts";
import { TimezoneIdentifier } from "../../domain/primitives/timezone_identifier.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import {
  type EdgeCollectionSnapshot,
  readEdgeCollection,
  writeEdgeCollection,
} from "./edge_store.ts";

export type FileSystemItemRepositoryDependencies = Readonly<{
  readonly root: string;
  readonly timezone: TimezoneIdentifier;
}>;

type LoadResult = Result<Item | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type listByPathResult = Result<ReadonlyArray<Item>, RepositoryError>;
type ItemMetaSnapshot = Omit<ItemSnapshot, "body" | "edges">;

type ItemDirectoryRecord = Readonly<{
  readonly id: string;
  readonly directory: string;
}>;

const ITEM_SCHEMA = "mm.item/1";

const YEAR_DIRECTORY_REGEX = /^\d{4}$/u;
const MONTH_DAY_DIRECTORY_REGEX = /^\d{2}$/u;

const itemsDirectory = (root: string): string => join(root, "items");

const parseDateSegments = (iso: string): [string, string, string] => {
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-");
  return [year, month, day];
};

const formatSegmentsForTimezone = (
  date: Date,
  timezone: TimezoneIdentifier,
): [string, string, string] => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year");
  const month = lookup.get("month");
  const day = lookup.get("day");
  if (year && month && day) {
    return [year, month, day];
  }
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ];
};

const directorySegmentsFromIso = (
  iso: string,
  timezone: TimezoneIdentifier,
): [string, string, string] => {
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) {
    return formatSegmentsForTimezone(parsed, timezone);
  }
  return parseDateSegments(iso);
};

const itemDirectoryFromSnapshot = (
  dependencies: FileSystemItemRepositoryDependencies,
  snapshot: ItemSnapshot,
): string => {
  const derived = deriveDirectoryFromId(dependencies, snapshot.id);
  if (derived) {
    return derived;
  }
  const [year, month, day] = directorySegmentsFromIso(
    snapshot.createdAt,
    dependencies.timezone,
  );
  return join(itemsDirectory(dependencies.root), year, month, day, snapshot.id);
};

const edgesDirectory = (directory: string): string => join(directory, "edges");

const readMetaSnapshot = async (
  directory: string,
  id: string,
): Promise<Result<ItemMetaSnapshot | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(join(directory, "meta.json"));
    const raw = JSON.parse(text) as ItemMetaSnapshot & { schema?: string };
    if (raw.schema === ITEM_SCHEMA) {
      const { schema: _schema, ...rest } = raw;
      return Result.ok(rest);
    }
    return Result.ok(raw as ItemMetaSnapshot);
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

type ContentParts = Readonly<{
  title: string | undefined;
  body: string | undefined;
}>;

const extractTitleAndBody = (content: string): ContentParts => {
  const lines = content.split("\n");
  let titleLine: string | undefined;
  const bodyLines: string[] = [];
  let foundTitle = false;

  for (const line of lines) {
    if (!foundTitle && line.trim().startsWith("# ")) {
      titleLine = line.trim().slice(2).trim();
      foundTitle = true;
      continue;
    }
    if (foundTitle) {
      bodyLines.push(line);
    }
  }

  const bodyText = bodyLines.join("\n").trim();
  return {
    title: titleLine,
    body: bodyText === "" ? undefined : bodyText,
  };
};

const readContent = async (
  directory: string,
  id: string,
): Promise<Result<ContentParts, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(join(directory, "content.md"));
    const normalized = text.replace(/\r\n/g, "\n");
    const withoutTrailingNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
    
    if (withoutTrailingNewline.trim() === "") {
      return Result.ok({ title: undefined, body: undefined });
    }
    
    const parts = extractTitleAndBody(withoutTrailingNewline);
    return Result.ok(parts);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok({ title: undefined, body: undefined });
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read item content", {
        identifier: id,
        cause: error,
      }),
    );
  }
};

const combineSnapshot = (
  meta: ItemMetaSnapshot,
  contentParts: ContentParts,
  edges: EdgeCollectionSnapshot,
): ItemSnapshot => ({
  ...meta,
  title: contentParts.title || meta.title || "Untitled",
  body: contentParts.body,
  edges: edges.edges.length > 0 ? edges.edges : undefined,
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
  const {
    body: _body,
    edges: _edges,
    title: _title,
    ...meta
  } = snapshot;
  const payload = JSON.stringify({ schema: ITEM_SCHEMA, ...meta }, null, 2);
  try {
    await Deno.writeTextFile(join(directory, "meta.json"), `${payload}\n`);
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
  const path = join(directory, "content.md");
  
  const title = snapshot.title;
  const body = snapshot.body;
  
  const titleLine = `# ${title}`;
  const content = body && body.trim() !== "" 
    ? `${titleLine}\n\n${body}` 
    : titleLine;

  try {
    await Deno.writeTextFile(path, `${content}\n`);
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

const loadItemFromDirectory = async (
  directory: string,
  id: string,
): Promise<Result<Item | undefined, RepositoryError>> => {
  const metaResult = await readMetaSnapshot(directory, id);
  if (metaResult.type === "error") {
    return metaResult;
  }
  const meta = metaResult.value;
  if (!meta) {
    return Result.ok(undefined);
  }

  const contentResult = await readContent(directory, id);
  if (contentResult.type === "error") {
    return contentResult;
  }

  const edgesResult = await readEdgeCollection({
    directory: edgesDirectory(directory),
    identifier: id,
  });
  if (edgesResult.type === "error") {
    return edgesResult;
  }

  const snapshot = combineSnapshot(meta, contentResult.value, edgesResult.value);
  return parseSnapshot(snapshot);
};

const timestampFromUuidV7 = (id: string): number | undefined => {
  const normalized = id.replace(/-/g, "").toLowerCase();
  if (normalized.length !== 32) {
    return undefined;
  }
  if (normalized[12] !== "7") {
    return undefined;
  }
  const millisecondsHex = normalized.slice(0, 12);
  const value = Number.parseInt(millisecondsHex, 16);
  return Number.isNaN(value) ? undefined : value;
};

const deriveDirectoryFromId = (
  dependencies: FileSystemItemRepositoryDependencies,
  id: string,
): string | undefined => {
  const timestamp = timestampFromUuidV7(id);
  if (timestamp === undefined) {
    return undefined;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const [year, month, day] = formatSegmentsForTimezone(date, dependencies.timezone);
  return join(itemsDirectory(dependencies.root), year, month, day, id);
};

const findItemDirectory = async (
  dependencies: FileSystemItemRepositoryDependencies,
  id: string,
): Promise<Result<string | undefined, RepositoryError>> => {
  const derived = deriveDirectoryFromId(dependencies, id);
  if (derived) {
    try {
      const stat = await Deno.stat(derived);
      if (stat.isDirectory) {
        return Result.ok(derived);
      }
      return Result.error(
        createRepositoryError("item", "load", "item directory is invalid", {
          identifier: id,
        }),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.ok(undefined);
      }
      return Result.error(
        createRepositoryError("item", "load", "failed to inspect item directory", {
          identifier: id,
          cause: error,
        }),
      );
    }
  }

  return Result.ok(undefined);
};

const collectItemDirectories = async (
  root: string,
): Promise<Result<ReadonlyArray<ItemDirectoryRecord>, RepositoryError>> => {
  const base = itemsDirectory(root);
  const items: ItemDirectoryRecord[] = [];
  try {
    for await (const yearEntry of Deno.readDir(base)) {
      if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) {
        continue;
      }
      if (!YEAR_DIRECTORY_REGEX.test(yearEntry.name)) {
        return Result.error(
          createRepositoryError("item", "list", `unexpected year directory: ${yearEntry.name}`),
        );
      }
      const yearPath = join(base, yearEntry.name);
      for await (const monthEntry of Deno.readDir(yearPath)) {
        if (!monthEntry.isDirectory || monthEntry.name.startsWith(".")) {
          continue;
        }
        if (!MONTH_DAY_DIRECTORY_REGEX.test(monthEntry.name)) {
          return Result.error(
            createRepositoryError("item", "list", `unexpected month directory: ${monthEntry.name}`),
          );
        }
        const monthPath = join(yearPath, monthEntry.name);
        for await (const dayEntry of Deno.readDir(monthPath)) {
          if (!dayEntry.isDirectory || dayEntry.name.startsWith(".")) {
            continue;
          }
          if (dayEntry.name === "edges") {
            continue;
          }
          if (!MONTH_DAY_DIRECTORY_REGEX.test(dayEntry.name)) {
            return Result.error(
              createRepositoryError("item", "list", `unexpected day directory: ${dayEntry.name}`),
            );
          }
          const dayPath = join(monthPath, dayEntry.name);
          for await (const itemEntry of Deno.readDir(dayPath)) {
            if (!itemEntry.isDirectory || itemEntry.name.startsWith(".")) {
              continue;
            }
            if (itemEntry.name === "edges") {
              continue;
            }
            items.push({ id: itemEntry.name, directory: join(dayPath, itemEntry.name) });
          }
        }
      }
    }
    return Result.ok(items);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok([]);
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to scan items directory", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemItemRepository = (
  dependencies: FileSystemItemRepositoryDependencies,
): ItemRepository => {
  const load = async (id: ItemId): Promise<LoadResult> => {
    const idStr = id.toString();
    const directoryResult = await findItemDirectory(dependencies, idStr);
    if (directoryResult.type === "error") {
      return directoryResult;
    }

    const directory = directoryResult.value;
    if (!directory) {
      return Result.ok(undefined);
    }

    return await loadItemFromDirectory(directory, idStr);
  };

  const save = async (item: Item): Promise<SaveResult> => {
    const snapshot = item.toJSON();
    const directory = itemDirectoryFromSnapshot(dependencies, snapshot);

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

    const edgesResult = await writeEdgeCollection(item.edges, {
      directory: edgesDirectory(directory),
      identifier: snapshot.id,
    });
    if (edgesResult.type === "error") {
      return edgesResult;
    }

    return Result.ok(undefined);
  };

  const remove = async (id: ItemId): Promise<DeleteResult> => {
    const idStr = id.toString();
    const directoryResult = await findItemDirectory(dependencies, idStr);
    if (directoryResult.type === "error") {
      return directoryResult;
    }

    const directory = directoryResult.value;
    if (!directory) {
      return Result.ok(undefined);
    }

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

    return Result.ok(undefined);
  };

  const listByPath = async (
    path: Path,
  ): Promise<listByPathResult> => {
    const directoriesResult = await collectItemDirectories(dependencies.root);
    if (directoriesResult.type === "error") {
      return directoriesResult;
    }

    const items: Item[] = [];

    for (const record of directoriesResult.value) {
      const itemResult = await loadItemFromDirectory(record.directory, record.id);
      if (itemResult.type === "error") {
        return itemResult;
      }

      const item = itemResult.value;
      if (!item) {
        return Result.error(
          createRepositoryError("item", "list", "item metadata is missing", {
            identifier: record.id,
          }),
        );
      }

      if (item.data.path.equals(path)) {
        items.push(item);
      }
    }

    items.sort((first, second) => first.data.rank.compare(second.data.rank));

    return Result.ok(items);
  };

  return {
    load,
    save,
    delete: remove,
    listByPath,
  };
};
