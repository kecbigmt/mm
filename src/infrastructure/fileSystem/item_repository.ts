import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { Item, ItemSnapshot, parseItem } from "../../domain/models/item.ts";
import { ItemId, Path } from "../../domain/primitives/mod.ts";
import { TimezoneIdentifier } from "../../domain/primitives/timezone_identifier.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import {
  deletePlacementEdge,
  readEdgeCollection,
  savePlacementEdge,
  writeEdgeCollection,
} from "./edge_store.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";

export type FileSystemItemRepositoryDependencies = Readonly<{
  readonly root: string;
  readonly timezone: TimezoneIdentifier;
}>;

type LoadResult = Result<Item | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type listByPathResult = Result<ReadonlyArray<Item>, RepositoryError>;

type ItemFileRecord = Readonly<{
  readonly id: string;
  readonly filePath: string;
}>;

type ItemFrontmatter = Readonly<{
  id: string;
  icon: string;
  kind?: string;
  status: string;
  path: string;
  rank: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  start_at?: string;
  duration?: string;
  due_at?: string;
  alias?: string;
  context?: string;
  tags?: string[];
  schema?: string;
}>;

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

const itemFilePathFromSnapshot = (
  dependencies: FileSystemItemRepositoryDependencies,
  snapshot: ItemSnapshot,
): string => {
  const derived = deriveFilePathFromId(dependencies, snapshot.id);
  if (derived) {
    return derived;
  }
  const [year, month, day] = directorySegmentsFromIso(
    snapshot.createdAt,
    dependencies.timezone,
  );
  return join(itemsDirectory(dependencies.root), year, month, day, `${snapshot.id}.md`);
};

const edgesDirectory = (workspaceRoot: string, itemId: string): string =>
  join(workspaceRoot, ".index", "graph", "parents", itemId);

/**
 * Check if a path represents a top-level date section
 * A top-level date path has exactly one segment that is a date
 */
const isTopLevelDatePath = (path: Path): boolean => {
  if (path.segments.length !== 1) {
    return false;
  }
  const segment = path.segments[0];
  return segment.kind === "Date";
};

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

const writeItemFile = async (
  filePath: string,
  snapshot: ItemSnapshot,
): Promise<Result<void, RepositoryError>> => {
  // Build frontmatter from snapshot
  const frontmatter: ItemFrontmatter & { schema?: string } = {
    id: snapshot.id,
    icon: snapshot.icon,
    status: snapshot.status,
    path: snapshot.path,
    rank: snapshot.rank,
    created_at: snapshot.createdAt,
    updated_at: snapshot.updatedAt,
    closed_at: snapshot.closedAt,
    start_at: snapshot.startAt,
    duration: snapshot.duration,
    due_at: snapshot.dueAt,
    alias: snapshot.alias,
    context: snapshot.context,
    schema: "mm.item.frontmatter/1",
  };

  // Build body (title + content)
  const title = snapshot.title;
  const body = snapshot.body;
  const titleLine = `# ${title}`;
  const bodyContent = body && body.trim() !== "" ? `${titleLine}\n\n${body}` : titleLine;

  // Serialize to frontmatter format
  const content = serializeFrontmatter(frontmatter, bodyContent);

  // Atomic write: write to temp file, then rename
  const tempPath = `${filePath}.tmp`;
  try {
    await Deno.writeTextFile(tempPath, content);
    await Deno.rename(tempPath, filePath);
    return Result.ok(undefined);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await Deno.remove(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    return Result.error(
      createRepositoryError("item", "save", "failed to write item file", {
        identifier: snapshot.id,
        cause: error,
      }),
    );
  }
};

const extractTitleAndBody = (content: string): { title: string; body: string | undefined } => {
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
    title: titleLine || "Untitled",
    body: bodyText === "" ? undefined : bodyText,
  };
};

const loadItemFromFile = async (
  workspaceRoot: string,
  filePath: string,
  id: string,
): Promise<Result<Item | undefined, RepositoryError>> => {
  // Read full file content
  let fileContent: string;
  try {
    fileContent = await Deno.readTextFile(filePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("item", "load", "failed to read item file", {
        identifier: id,
        cause: error,
      }),
    );
  }

  // Parse frontmatter and body
  const parseResult = parseFrontmatter<ItemFrontmatter>(fileContent);
  if (parseResult.type === "error") {
    return Result.error(
      createRepositoryError("item", "load", "failed to parse item file", {
        identifier: id,
        cause: parseResult.error,
      }),
    );
  }

  const { frontmatter, body } = parseResult.value;

  // Extract title and body from content
  const { title, body: bodyContent } = extractTitleAndBody(body);

  // Read edge collection
  const edgesResult = await readEdgeCollection({
    directory: edgesDirectory(workspaceRoot, id),
    identifier: id,
  });
  if (edgesResult.type === "error") {
    return edgesResult;
  }

  // Combine into ItemSnapshot
  const snapshot: ItemSnapshot = {
    id: frontmatter.id,
    icon: frontmatter.icon,
    status: frontmatter.status,
    path: frontmatter.path,
    rank: frontmatter.rank,
    createdAt: frontmatter.created_at,
    updatedAt: frontmatter.updated_at,
    closedAt: frontmatter.closed_at,
    startAt: frontmatter.start_at,
    duration: frontmatter.duration,
    dueAt: frontmatter.due_at,
    alias: frontmatter.alias,
    context: frontmatter.context,
    title,
    body: bodyContent,
    edges: edgesResult.value.edges.length > 0 ? edgesResult.value.edges : undefined,
  };

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

const deriveFilePathFromId = (
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
  return join(itemsDirectory(dependencies.root), year, month, day, `${id}.md`);
};

const findItemFile = async (
  dependencies: FileSystemItemRepositoryDependencies,
  id: string,
): Promise<Result<string | undefined, RepositoryError>> => {
  const derived = deriveFilePathFromId(dependencies, id);
  if (derived) {
    try {
      const stat = await Deno.stat(derived);
      if (stat.isFile) {
        return Result.ok(derived);
      }
      return Result.error(
        createRepositoryError("item", "load", "item file is invalid", {
          identifier: id,
        }),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.ok(undefined);
      }
      return Result.error(
        createRepositoryError("item", "load", "failed to inspect item file", {
          identifier: id,
          cause: error,
        }),
      );
    }
  }

  return Result.ok(undefined);
};

const collectItemFiles = async (
  root: string,
): Promise<Result<ReadonlyArray<ItemFileRecord>, RepositoryError>> => {
  const base = itemsDirectory(root);
  const items: ItemFileRecord[] = [];
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
          if (!MONTH_DAY_DIRECTORY_REGEX.test(dayEntry.name)) {
            return Result.error(
              createRepositoryError("item", "list", `unexpected day directory: ${dayEntry.name}`),
            );
          }
          const dayPath = join(monthPath, dayEntry.name);
          for await (const fileEntry of Deno.readDir(dayPath)) {
            // Skip directories and hidden files
            if (fileEntry.isDirectory || fileEntry.name.startsWith(".")) {
              continue;
            }
            // Only process .md files
            if (!fileEntry.name.endsWith(".md")) {
              continue;
            }
            // Extract item ID from filename (remove .md extension)
            const id = fileEntry.name.slice(0, -3);
            const filePath = join(dayPath, fileEntry.name);
            items.push({ id, filePath });
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
    const fileResult = await findItemFile(dependencies, idStr);
    if (fileResult.type === "error") {
      return fileResult;
    }

    const filePath = fileResult.value;
    if (!filePath) {
      return Result.ok(undefined);
    }

    return await loadItemFromFile(dependencies.root, filePath, idStr);
  };

  const save = async (item: Item): Promise<SaveResult> => {
    const snapshot = item.toJSON();
    const filePath = itemFilePathFromSnapshot(dependencies, snapshot);

    // Load existing item to check if path changed (for edge file cleanup)
    const existingResult = await load(item.data.id);
    if (existingResult.type === "error") {
      // Propagate errors (IO, deserialization, etc.)
      // Note: load() returns Result.ok(undefined) for NotFound, so errors here are real failures
      return existingResult;
    }
    const existingItem = existingResult.value;

    // Ensure parent directory exists
    const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
    try {
      await Deno.mkdir(parentDir, { recursive: true });
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

    // Write item file (frontmatter + body)
    const writeResult = await writeItemFile(filePath, snapshot);
    if (writeResult.type === "error") {
      return writeResult;
    }

    // Save child edges (items under this item)
    const edgesResult = await writeEdgeCollection(item.edges, {
      directory: edgesDirectory(dependencies.root, snapshot.id),
      identifier: snapshot.id,
    });
    if (edgesResult.type === "error") {
      return edgesResult;
    }

    // Handle top-level edge file updates
    const newPathIsTopLevel = isTopLevelDatePath(item.data.path);
    const oldPathIsTopLevel = existingItem ? isTopLevelDatePath(existingItem.data.path) : false;

    // If path changed from top-level to non-top-level, delete old top-level edge
    if (existingItem && oldPathIsTopLevel && !newPathIsTopLevel) {
      const oldDateSegment = existingItem.data.path.segments[0];
      if (oldDateSegment.kind === "Date") {
        const oldDateStr = oldDateSegment.value.toString();
        const deleteResult = await deletePlacementEdge(
          dependencies.root,
          oldDateStr,
          item.data.id,
        );
        if (deleteResult.type === "error") {
          return deleteResult;
        }
      }
    }

    // If path changed between different top-level dates, delete old and create new
    if (existingItem && oldPathIsTopLevel && newPathIsTopLevel) {
      const oldDateSegment = existingItem.data.path.segments[0];
      const newDateSegment = item.data.path.segments[0];
      if (
        oldDateSegment.kind === "Date" &&
        newDateSegment.kind === "Date" &&
        oldDateSegment.value.toString() !== newDateSegment.value.toString()
      ) {
        const oldDateStr = oldDateSegment.value.toString();
        const deleteResult = await deletePlacementEdge(
          dependencies.root,
          oldDateStr,
          item.data.id,
        );
        if (deleteResult.type === "error") {
          return deleteResult;
        }
      }
    }

    // If path changed from non-top-level to top-level, delete old parent edge
    if (existingItem && !oldPathIsTopLevel && newPathIsTopLevel) {
      const oldPathSegments = existingItem.data.path.segments;
      if (oldPathSegments.length >= 2 && oldPathSegments[1].kind === "ItemId") {
        const oldParentId = oldPathSegments[1].value as ItemId;
        const oldSectionSegments = oldPathSegments.slice(2);
        const oldSectionPath = oldSectionSegments
          .filter((seg) => seg.kind !== "range")
          .map((seg) => seg.toString())
          .join("/");

        const oldEdgeDir = oldSectionPath
          ? join(
            dependencies.root,
            ".index",
            "graph",
            "parents",
            oldParentId.toString(),
            oldSectionPath,
          )
          : join(dependencies.root, ".index", "graph", "parents", oldParentId.toString());
        const oldEdgeFilePath = join(oldEdgeDir, `${item.data.id.toString()}.edge.json`);

        // Delete old edge file
        try {
          await Deno.remove(oldEdgeFilePath);
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) {
            return Result.error(
              createRepositoryError("item", "save", "failed to delete old parent edge file", {
                identifier: snapshot.id,
                cause: error,
              }),
            );
          }
        }
      }
    }

    // Save top-level placement edge if this item is placed under a date section
    if (newPathIsTopLevel) {
      const dateSegment = item.data.path.segments[0];
      if (dateSegment.kind === "Date") {
        const dateStr = dateSegment.value.toString(); // YYYY-MM-DD format
        const topLevelResult = await savePlacementEdge(
          dependencies.root,
          dateStr,
          item.data.id,
          item.data.rank,
        );
        if (topLevelResult.type === "error") {
          return topLevelResult;
        }
      }
    } else {
      // If not top-level, save edge file in parent item's edges directory
      // Path format: /date/parent-id/section1/section2/.../this-item
      // We need to save edge in parent-id's edges/section1/section2/... directory
      const pathSegments = item.data.path.segments;

      // Delete old parent edge if path changed from non-top-level parent
      if (existingItem && !oldPathIsTopLevel) {
        const oldPathSegments = existingItem.data.path.segments;
        if (oldPathSegments.length >= 2 && oldPathSegments[1].kind === "ItemId") {
          const oldParentId = oldPathSegments[1].value as ItemId;
          const oldSectionSegments = oldPathSegments.slice(2);
          const oldSectionPath = oldSectionSegments
            .filter((seg) => seg.kind !== "range")
            .map((seg) => seg.toString())
            .join("/");

          // Check if parent or section changed
          const newParentId = pathSegments.length >= 2 && pathSegments[1].kind === "ItemId"
            ? pathSegments[1].value as ItemId
            : null;
          const newSectionSegments = pathSegments.slice(2);
          const newSectionPath = newSectionSegments
            .filter((seg) => seg.kind !== "range")
            .map((seg) => seg.toString())
            .join("/");

          const parentChanged = !newParentId || oldParentId.toString() !== newParentId.toString();
          const sectionChanged = oldSectionPath !== newSectionPath;

          if (parentChanged || sectionChanged) {
            const oldEdgeDir = oldSectionPath
              ? join(
                dependencies.root,
                ".index",
                "graph",
                "parents",
                oldParentId.toString(),
                oldSectionPath,
              )
              : join(dependencies.root, ".index", "graph", "parents", oldParentId.toString());
            const oldEdgeFilePath = join(oldEdgeDir, `${item.data.id.toString()}.edge.json`);

            // Delete old edge file
            try {
              await Deno.remove(oldEdgeFilePath);
            } catch (error) {
              if (!(error instanceof Deno.errors.NotFound)) {
                return Result.error(
                  createRepositoryError("item", "save", "failed to delete old parent edge file", {
                    identifier: snapshot.id,
                    cause: error,
                  }),
                );
              }
            }
          }
        }
      }

      // Save new parent edge file
      if (pathSegments.length >= 2) {
        // First segment is date, second is parent ID
        const parentSegment = pathSegments[1];
        if (parentSegment.kind === "ItemId") {
          const parentId = parentSegment.value;

          // Build section path from remaining segments
          const sectionSegments = pathSegments.slice(2); // Skip date and parent
          const sectionPath = sectionSegments
            .filter((seg) => seg.kind !== "range")
            .map((seg) => seg.toString())
            .join("/");

          // Edge directory: .index/graph/parents/<parentId>/section1/section2/...
          const edgeDir = sectionPath
            ? join(
              dependencies.root,
              ".index",
              "graph",
              "parents",
              parentId.toString(),
              sectionPath,
            )
            : join(dependencies.root, ".index", "graph", "parents", parentId.toString());

          // Create edge file for this item in parent's edge directory
          const edgeFilePath = join(edgeDir, `${item.data.id.toString()}.edge.json`);

          // Ensure edge directory exists
          try {
            await Deno.mkdir(edgeDir, { recursive: true });
          } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
              return Result.error(
                createRepositoryError("item", "save", "failed to create edge directory", {
                  identifier: snapshot.id,
                  cause: error,
                }),
              );
            }
          }

          // Write edge file
          const edgeSnapshot = {
            schema: "mm.edge/1",
            from: parentId.toString(),
            to: item.data.id.toString(),
            rank: item.data.rank.toString(),
          };
          const edgePayload = JSON.stringify(edgeSnapshot, null, 2);

          try {
            await Deno.writeTextFile(edgeFilePath, `${edgePayload}\n`);
          } catch (error) {
            return Result.error(
              createRepositoryError("item", "save", "failed to write parent edge file", {
                identifier: snapshot.id,
                cause: error,
              }),
            );
          }
        }
      }
    }

    return Result.ok(undefined);
  };

  const remove = async (id: ItemId): Promise<DeleteResult> => {
    const idStr = id.toString();
    const fileResult = await findItemFile(dependencies, idStr);
    if (fileResult.type === "error") {
      return fileResult;
    }

    const filePath = fileResult.value;
    if (!filePath) {
      return Result.ok(undefined);
    }

    // Load item to get its path for top-level edge cleanup
    const itemResult = await loadItemFromFile(dependencies.root, filePath, idStr);
    if (itemResult.type === "error") {
      return itemResult;
    }

    const item = itemResult.value;

    if (item) {
      const pathIsTopLevel = isTopLevelDatePath(item.data.path);

      // Delete top-level edge if item was placed under a date section
      if (pathIsTopLevel) {
        const dateSegment = item.data.path.segments[0];
        if (dateSegment.kind === "Date") {
          const dateStr = dateSegment.value.toString();
          const topLevelResult = await deletePlacementEdge(
            dependencies.root,
            dateStr,
            id,
          );
          if (topLevelResult.type === "error") {
            return topLevelResult;
          }
        }
      } else {
        // Delete parent edge if item was placed under a parent
        const pathSegments = item.data.path.segments;
        if (pathSegments.length >= 2 && pathSegments[1].kind === "ItemId") {
          const parentId = pathSegments[1].value as ItemId;
          const sectionSegments = pathSegments.slice(2);
          const sectionPath = sectionSegments
            .filter((seg) => seg.kind !== "range")
            .map((seg) => seg.toString())
            .join("/");

          const edgeDir = sectionPath
            ? join(
              dependencies.root,
              ".index",
              "graph",
              "parents",
              parentId.toString(),
              sectionPath,
            )
            : join(dependencies.root, ".index", "graph", "parents", parentId.toString());
          const edgeFilePath = join(edgeDir, `${id.toString()}.edge.json`);

          // Delete parent edge file
          try {
            await Deno.remove(edgeFilePath);
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
              return Result.error(
                createRepositoryError("item", "delete", "failed to delete parent edge file", {
                  identifier: idStr,
                  cause: error,
                }),
              );
            }
          }
        }
      }
    }

    try {
      await Deno.remove(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        return Result.error(
          createRepositoryError("item", "delete", "failed to remove item file", {
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
    // Note: Path normalization should be done in the workflow layer before calling this method
    // This method expects a normalized path (aliases already resolved)
    const filesResult = await collectItemFiles(dependencies.root);
    if (filesResult.type === "error") {
      return filesResult;
    }

    const items: Item[] = [];

    for (const record of filesResult.value) {
      const itemResult = await loadItemFromFile(
        dependencies.root,
        record.filePath,
        record.id,
      );
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
