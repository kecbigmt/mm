/**
 * Item Updater for doctor rebalance-rank command
 *
 * Handles batch updates of item ranks, including:
 * - Updating frontmatter in item files
 * - Updating edge files
 * - Atomic file writes
 */

import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { DateTime, ItemId, parsePlacement } from "../../domain/primitives/mod.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { ItemRankUpdate } from "./rank_rebalancer.ts";

/**
 * Result of updating a single item
 */
export type UpdateResult = Readonly<{
  itemId: ItemId;
  updated: boolean;
}>;

/**
 * Error types for update operations
 */
export type UpdateError = Readonly<{
  kind: "io_error" | "parse_error";
  message: string;
  itemId: string;
  cause?: unknown;
}>;

type ItemFrontmatter = {
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
  alias?: string;
  context?: string;
  tags?: string[];
  schema?: string;
};

/**
 * Derive file path from UUID v7 item ID
 */
const deriveFilePathFromId = (
  workspaceRoot: string,
  id: string,
  timezone: string,
): string | undefined => {
  const normalized = id.replace(/-/g, "").toLowerCase();
  if (normalized.length !== 32) {
    return undefined;
  }
  // UUID version is stored in the 13th character (index 12) per RFC 4122.
  // This check ensures the ID is a UUID v7, which encodes timestamp in first 48 bits.
  if (normalized[12] !== "7") {
    return undefined;
  }
  const millisecondsHex = normalized.slice(0, 12);
  const timestamp = Number.parseInt(millisecondsHex, 16);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  // Format date parts in workspace timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year") ?? date.getUTCFullYear().toString().padStart(4, "0");
  const month = lookup.get("month") ?? (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = lookup.get("day") ?? date.getUTCDate().toString().padStart(2, "0");

  return join(workspaceRoot, "items", year, month, day, `${id}.md`);
};

/**
 * Update a single item's rank in both frontmatter and edge file
 */
const updateItemRank = async (
  workspaceRoot: string,
  timezone: string,
  update: ItemRankUpdate,
  updatedAt: DateTime,
): Promise<Result<UpdateResult, UpdateError>> => {
  const itemIdStr = update.itemId.toString();

  // Find item file path
  const filePath = deriveFilePathFromId(workspaceRoot, itemIdStr, timezone);
  if (!filePath) {
    return Result.error({
      kind: "io_error",
      message: "could not derive file path from item ID",
      itemId: itemIdStr,
    });
  }

  // Read existing file
  let content: string;
  try {
    content = await Deno.readTextFile(filePath);
  } catch (error) {
    return Result.error({
      kind: "io_error",
      message: "failed to read item file",
      itemId: itemIdStr,
      cause: error,
    });
  }

  // Parse frontmatter
  const parseResult = parseFrontmatter<ItemFrontmatter>(content);
  if (parseResult.type === "error") {
    return Result.error({
      kind: "parse_error",
      message: "failed to parse frontmatter",
      itemId: itemIdStr,
      cause: parseResult.error,
    });
  }

  const { frontmatter, body } = parseResult.value;

  // Update rank and updated_at
  const updatedFrontmatter: ItemFrontmatter = {
    ...frontmatter,
    rank: update.newRank.toString(),
    updated_at: updatedAt.toString(),
  };

  // Serialize and write atomically
  const newContent = serializeFrontmatter(updatedFrontmatter, body);
  const tempPath = `${filePath}.tmp`;

  try {
    await Deno.writeTextFile(tempPath, newContent);
    await Deno.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file
    try {
      await Deno.remove(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    return Result.error({
      kind: "io_error",
      message: "failed to write item file",
      itemId: itemIdStr,
      cause: error,
    });
  }

  // Update edge file based on placement
  const placementResult = parsePlacement(frontmatter.placement);
  if (placementResult.type === "ok") {
    const placement = placementResult.value;
    let edgeFilePath: string;

    if (placement.head.kind === "date") {
      // Date placement: .index/graph/dates/YYYY-MM-DD/<itemId>.edge.json
      const dateStr = placement.head.date.toString();
      const sectionPath = placement.section.length > 0 ? placement.section.join("/") : "";

      if (sectionPath) {
        edgeFilePath = join(
          workspaceRoot,
          ".index",
          "graph",
          "dates",
          dateStr,
          sectionPath,
          `${itemIdStr}.edge.json`,
        );
      } else {
        edgeFilePath = join(
          workspaceRoot,
          ".index",
          "graph",
          "dates",
          dateStr,
          `${itemIdStr}.edge.json`,
        );
      }
    } else if (placement.head.kind === "item") {
      // Item placement: .index/graph/parents/<parentId>/<section>/<itemId>.edge.json
      const parentIdStr = placement.head.id.toString();
      const sectionPath = placement.section.length > 0 ? placement.section.join("/") : "";

      if (sectionPath) {
        edgeFilePath = join(
          workspaceRoot,
          ".index",
          "graph",
          "parents",
          parentIdStr,
          sectionPath,
          `${itemIdStr}.edge.json`,
        );
      } else {
        edgeFilePath = join(
          workspaceRoot,
          ".index",
          "graph",
          "parents",
          parentIdStr,
          `${itemIdStr}.edge.json`,
        );
      }
    } else {
      // Permanent placement: .index/graph/permanent/<section>/<itemId>.edge.json
      const sectionPath = placement.section.length > 0 ? placement.section.join("/") : "";

      if (sectionPath) {
        edgeFilePath = join(
          workspaceRoot,
          ".index",
          "graph",
          "permanent",
          sectionPath,
          `${itemIdStr}.edge.json`,
        );
      } else {
        edgeFilePath = join(
          workspaceRoot,
          ".index",
          "graph",
          "permanent",
          `${itemIdStr}.edge.json`,
        );
      }
    }

    // Update edge file with new rank
    try {
      const edgeContent = await Deno.readTextFile(edgeFilePath);
      const edgeData = JSON.parse(edgeContent);
      edgeData.rank = update.newRank.toString();

      const edgeTempPath = `${edgeFilePath}.tmp`;
      await Deno.writeTextFile(edgeTempPath, JSON.stringify(edgeData, null, 2) + "\n");
      await Deno.rename(edgeTempPath, edgeFilePath);
    } catch (error) {
      // Edge file might not exist (e.g., if index is out of sync)
      // Log warning but don't fail the operation
      if (!(error instanceof Deno.errors.NotFound)) {
        // For non-NotFound errors (e.g., permission denied, disk full, JSON parse error),
        // warn the user so they can address the issue. The item file has been updated,
        // so we continue but surface this partial failure.
        console.warn(
          `Warning: Failed to update edge file for item ${itemIdStr}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return Result.ok({
    itemId: update.itemId,
    updated: true,
  });
};

/**
 * Batch update item ranks
 *
 * Updates both item frontmatter and corresponding edge files.
 * Uses atomic writes for safety.
 */
export async function* updateRanks(
  workspaceRoot: string,
  timezone: string,
  updates: ReadonlyArray<ItemRankUpdate>,
  updatedAt: DateTime,
): AsyncIterableIterator<Result<UpdateResult, UpdateError>> {
  for (const update of updates) {
    const result = await updateItemRank(workspaceRoot, timezone, update, updatedAt);
    yield result;
  }
}

/**
 * Batch update all ranks and collect results
 */
export const updateAllRanks = async (
  workspaceRoot: string,
  timezone: string,
  updates: ReadonlyArray<ItemRankUpdate>,
  updatedAt: DateTime,
): Promise<Result<ReadonlyArray<UpdateResult>, UpdateError>> => {
  const results: UpdateResult[] = [];

  for await (const result of updateRanks(workspaceRoot, timezone, updates, updatedAt)) {
    if (result.type === "error") {
      return result;
    }
    results.push(result.value);
  }

  return Result.ok(results);
};
