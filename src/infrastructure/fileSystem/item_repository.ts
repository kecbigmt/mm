import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { Item, ItemSnapshot, parseItem } from "../../domain/models/item.ts";
import { ItemId, Placement, PlacementRange } from "../../domain/primitives/mod.ts";
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
import { queryEdgeReferences } from "./graph_index.ts";

export type FileSystemItemRepositoryDependencies = Readonly<{
  readonly root: string;
  readonly timezone: TimezoneIdentifier;
}>;

type LoadResult = Result<Item | undefined, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;
type DeleteResult = Result<void, RepositoryError>;
type ListByPlacementResult = Result<ReadonlyArray<Item>, RepositoryError>;

type ItemFrontmatter = Readonly<{
  id: string;
  icon: string;
  kind?: string;
  status: string;
  placement: string;
  rank: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  start_at?: string;
  duration?: string;
  due_at?: string;
  snooze_until?: string;
  alias?: string;
  context?: string;
  tags?: string[];
  schema?: string;
}>;

const itemsDirectory = (root: string): string => join(root, "items");

const parseDateSegments = (iso: string): [string, string, string] => {
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-");
  return [year, month, day];
};

// Cache DateTimeFormat instances per timezone to avoid repeated initialization (~30ms each)
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

// Timezones that are equivalent to UTC (no DST, zero offset)
const UTC_EQUIVALENT_TIMEZONES = new Set([
  "UTC",
  "GMT",
  "Etc/UTC",
  "Etc/GMT",
  "Etc/GMT+0",
  "Etc/GMT-0",
  "Etc/Universal",
  "Universal",
]);

const formatUtcSegments = (date: Date): [string, string, string] => [
  date.getUTCFullYear().toString().padStart(4, "0"),
  (date.getUTCMonth() + 1).toString().padStart(2, "0"),
  date.getUTCDate().toString().padStart(2, "0"),
];

const getDateFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = dateFormatCache.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  dateFormatCache.set(timezone, formatter);
  return formatter;
};

export const formatSegmentsForTimezone = (
  date: Date,
  timezone: TimezoneIdentifier,
): [string, string, string] => {
  const tz = timezone.toString();

  // Fast path for UTC-equivalent timezones (no Intl.DateTimeFormat needed)
  if (UTC_EQUIVALENT_TIMEZONES.has(tz)) {
    return formatUtcSegments(date);
  }

  const formatter = getDateFormatter(tz);
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year");
  const month = lookup.get("month");
  const day = lookup.get("day");
  if (year && month && day) {
    return [year, month, day];
  }
  return formatUtcSegments(date);
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
 * Check if a placement is directly under a date (no sections, no parent item)
 */
const isDirectlyUnderDate = (placement: Placement): boolean => {
  return placement.head.kind === "date" && placement.section.length === 0;
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
    placement: snapshot.placement,
    rank: snapshot.rank,
    created_at: snapshot.createdAt,
    updated_at: snapshot.updatedAt,
    closed_at: snapshot.closedAt,
    start_at: snapshot.startAt,
    duration: snapshot.duration,
    due_at: snapshot.dueAt,
    snooze_until: snapshot.snoozeUntil,
    alias: snapshot.alias,
    context: snapshot.context,
    schema: "mm.item.frontmatter/2",
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
    placement: frontmatter.placement,
    rank: frontmatter.rank,
    createdAt: frontmatter.created_at,
    updatedAt: frontmatter.updated_at,
    closedAt: frontmatter.closed_at,
    startAt: frontmatter.start_at,
    duration: frontmatter.duration,
    dueAt: frontmatter.due_at,
    snoozeUntil: frontmatter.snooze_until,
    alias: frontmatter.alias,
    context: frontmatter.context,
    title,
    body: bodyContent,
    edges: edgesResult.value.edges.length > 0 ? edgesResult.value.edges : undefined,
  };

  return parseSnapshot(snapshot);
};

export const timestampFromUuidV7 = (id: string): number | undefined => {
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

export const deriveFilePathFromId = (
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
    const parentDir = dirname(filePath);
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

    // Handle top-level edge file updates (items directly under date)
    const newIsDirectUnderDate = isDirectlyUnderDate(item.data.placement);
    const oldIsDirectUnderDate = existingItem
      ? isDirectlyUnderDate(existingItem.data.placement)
      : false;

    // If placement changed from direct-under-date to something else, delete old top-level edge
    if (existingItem && oldIsDirectUnderDate && !newIsDirectUnderDate) {
      if (existingItem.data.placement.head.kind === "date") {
        const oldDateStr = existingItem.data.placement.head.date.toString();
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

    // If placement changed between different dates (both direct-under-date), delete old and create new
    if (existingItem && oldIsDirectUnderDate && newIsDirectUnderDate) {
      if (
        existingItem.data.placement.head.kind === "date" &&
        item.data.placement.head.kind === "date" &&
        existingItem.data.placement.head.date.toString() !==
          item.data.placement.head.date.toString()
      ) {
        const oldDateStr = existingItem.data.placement.head.date.toString();
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

    // If placement changed from item-parent to date-parent, delete old parent edge
    if (
      existingItem &&
      existingItem.data.placement.head.kind === "item" &&
      item.data.placement.head.kind === "date"
    ) {
      const oldParentId = existingItem.data.placement.head.id;
      const oldSectionPath = existingItem.data.placement.section.join("/");

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

    // If placement changed from permanent to date or item, delete old permanent edge
    if (
      existingItem &&
      existingItem.data.placement.head.kind === "permanent" &&
      item.data.placement.head.kind !== "permanent"
    ) {
      const oldSectionPath = existingItem.data.placement.section.join("/");
      const oldEdgeDir = oldSectionPath
        ? join(dependencies.root, ".index", "graph", "permanent", oldSectionPath)
        : join(dependencies.root, ".index", "graph", "permanent");
      const oldEdgeFilePath = join(oldEdgeDir, `${item.data.id.toString()}.edge.json`);

      try {
        await Deno.remove(oldEdgeFilePath);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          return Result.error(
            createRepositoryError("item", "save", "failed to delete old permanent edge file", {
              identifier: snapshot.id,
              cause: error,
            }),
          );
        }
      }
    }

    // If placement changed from date/item to permanent, delete old edge
    // (Date edges are already handled above by oldIsDirectUnderDate check)
    // Handle item-to-permanent transition
    if (
      existingItem &&
      existingItem.data.placement.head.kind === "item" &&
      item.data.placement.head.kind === "permanent"
    ) {
      const oldParentId = existingItem.data.placement.head.id;
      const oldSectionPath = existingItem.data.placement.section.join("/");
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

    // Save top-level placement edge if this item is directly under a date
    if (newIsDirectUnderDate) {
      if (item.data.placement.head.kind === "date") {
        const dateStr = item.data.placement.head.date.toString(); // YYYY-MM-DD format
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
    } else if (item.data.placement.head.kind === "item") {
      // If not directly under date, save edge file in parent item's edges directory
      const parentId = item.data.placement.head.id;

      // Delete old parent edge if parent or section changed
      if (existingItem && existingItem.data.placement.head.kind === "item") {
        const oldParentId = existingItem.data.placement.head.id;
        const oldSectionPath = existingItem.data.placement.section.join("/");

        const parentChanged = oldParentId.toString() !== parentId.toString();
        const newSectionPath = item.data.placement.section.join("/");
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

      // Save new parent edge file
      const sectionPath = item.data.placement.section.join("/");

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
    } else if (item.data.placement.head.kind === "permanent") {
      // Permanent placement - save edge file in .index/graph/permanent/
      const sectionPath = item.data.placement.section.join("/");

      // Delete old permanent edge if section changed
      if (existingItem && existingItem.data.placement.head.kind === "permanent") {
        const oldSectionPath = existingItem.data.placement.section.join("/");
        const newSectionPath = item.data.placement.section.join("/");

        if (oldSectionPath !== newSectionPath) {
          const oldEdgeDir = oldSectionPath
            ? join(dependencies.root, ".index", "graph", "permanent", oldSectionPath)
            : join(dependencies.root, ".index", "graph", "permanent");
          const oldEdgeFilePath = join(oldEdgeDir, `${item.data.id.toString()}.edge.json`);

          try {
            await Deno.remove(oldEdgeFilePath);
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
              return Result.error(
                createRepositoryError("item", "save", "failed to delete old permanent edge file", {
                  identifier: snapshot.id,
                  cause: error,
                }),
              );
            }
          }
        }
      }

      // Save new permanent edge file
      const edgeDir = sectionPath
        ? join(dependencies.root, ".index", "graph", "permanent", sectionPath)
        : join(dependencies.root, ".index", "graph", "permanent");

      const edgeFilePath = join(edgeDir, `${item.data.id.toString()}.edge.json`);

      try {
        await Deno.mkdir(edgeDir, { recursive: true });
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) {
          return Result.error(
            createRepositoryError("item", "save", "failed to create permanent edge directory", {
              identifier: snapshot.id,
              cause: error,
            }),
          );
        }
      }

      const edgeSnapshot = {
        schema: "mm.edge/1",
        rank: item.data.rank.toString(),
      };
      const edgePayload = JSON.stringify(edgeSnapshot, null, 2);

      try {
        await Deno.writeTextFile(edgeFilePath, `${edgePayload}\n`);
      } catch (error) {
        return Result.error(
          createRepositoryError("item", "save", "failed to write permanent edge file", {
            identifier: snapshot.id,
            cause: error,
          }),
        );
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
      // Delete edge based on placement
      if (isDirectlyUnderDate(item.data.placement)) {
        // Delete top-level edge if item was directly under a date
        if (item.data.placement.head.kind === "date") {
          const dateStr = item.data.placement.head.date.toString();
          const topLevelResult = await deletePlacementEdge(
            dependencies.root,
            dateStr,
            id,
          );
          if (topLevelResult.type === "error") {
            return topLevelResult;
          }
        }
      } else if (item.data.placement.head.kind === "item") {
        // Delete parent edge if item was under a parent item
        const parentId = item.data.placement.head.id;
        const sectionPath = item.data.placement.section.join("/");

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
      } else if (item.data.placement.head.kind === "permanent") {
        // Delete permanent edge if item was under permanent placement
        const sectionPath = item.data.placement.section.join("/");

        const edgeDir = sectionPath
          ? join(dependencies.root, ".index", "graph", "permanent", sectionPath)
          : join(dependencies.root, ".index", "graph", "permanent");
        const edgeFilePath = join(edgeDir, `${id.toString()}.edge.json`);

        try {
          await Deno.remove(edgeFilePath);
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) {
            return Result.error(
              createRepositoryError("item", "delete", "failed to delete permanent edge file", {
                identifier: idStr,
                cause: error,
              }),
            );
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

  const listByPlacement = async (
    range: PlacementRange,
  ): Promise<ListByPlacementResult> => {
    // Query edge references from index instead of scanning all files
    const edgeRefsResult = await queryEdgeReferences(dependencies.root, range);
    if (edgeRefsResult.type === "error") {
      return edgeRefsResult;
    }

    const items: Item[] = [];

    // Load only the items that match the placement range
    for (const edgeRef of edgeRefsResult.value) {
      const itemIdStr = edgeRef.itemId.toString();

      // Find item file path
      const filePathResult = await findItemFile(dependencies, itemIdStr);
      if (filePathResult.type === "error") {
        return filePathResult;
      }

      const filePath = filePathResult.value;
      if (!filePath) {
        return Result.error(
          createRepositoryError("item", "list", "item file not found", {
            identifier: itemIdStr,
          }),
        );
      }

      // Load item from file
      const itemResult = await loadItemFromFile(
        dependencies.root,
        filePath,
        itemIdStr,
      );
      if (itemResult.type === "error") {
        return itemResult;
      }

      const item = itemResult.value;
      if (!item) {
        return Result.error(
          createRepositoryError("item", "list", "item metadata is missing", {
            identifier: itemIdStr,
          }),
        );
      }

      items.push(item);
    }

    // Sort by rank (items are already mostly sorted from edge files, but ensure correctness)
    items.sort((first, second) => first.data.rank.compare(second.data.rank));

    return Result.ok(items);
  };

  return {
    load,
    save,
    delete: remove,
    listByPlacement,
  };
};
