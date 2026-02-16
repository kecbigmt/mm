/**
 * Index Rebuilder for mm doctor rebuild-index command
 *
 * Rebuilds .index/graph and .index/aliases from Item frontmatter.
 * Frontmatter is the single source of truth; indexes are derived caches.
 */

import { Result } from "../../shared/result.ts";
import { Item } from "../../domain/models/item.ts";
import { AliasSnapshot } from "../../domain/models/alias.ts";
import { ItemId } from "../../domain/primitives/item_id.ts";
import { ItemRank } from "../../domain/primitives/item_rank.ts";
import { DateTime } from "../../domain/primitives/date_time.ts";

/**
 * Edge data for index rebuilding.
 * Includes created_at for stable sorting when ranks are equal.
 */
export type EdgeData = Readonly<{
  readonly itemId: ItemId;
  readonly rank: ItemRank;
  readonly createdAt: DateTime;
}>;

/**
 * Result of rebuilding the index
 */
export type RebuildResult = Readonly<{
  /** Map from directory path to edges (e.g., "dates/2025-01-15" -> edges) */
  readonly graphEdges: Map<string, ReadonlyArray<EdgeData>>;
  /** Map from alias file path to alias snapshot (e.g., "ab/abcd1234..." -> snapshot) */
  readonly aliases: Map<string, AliasSnapshot>;
  /** Number of items processed */
  readonly itemsProcessed: number;
  /** Number of edges created */
  readonly edgesCreated: number;
  /** Number of aliases created */
  readonly aliasesCreated: number;
}>;

/**
 * Error during index rebuild
 */
export type RebuildError = Readonly<{
  readonly kind: "rebuild_error";
  readonly message: string;
  readonly itemId?: string;
  readonly cause?: unknown;
}>;

/**
 * Compute SHA-256 hash for alias canonical key
 * Must match the hash algorithm used by alias_repository.ts
 */
const computeAliasHash = async (canonicalKey: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalKey);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Get the directory path for an edge based on item directory
 */
const getEdgeDirectoryPath = (item: Item): string => {
  const dir = item.data.directory;
  const head = dir.head;

  if (head.kind === "date") {
    // Date directory: dates/YYYY-MM-DD or dates/YYYY-MM-DD/1/3
    const dateStr = head.date.toString();
    if (dir.section.length === 0) {
      return `dates/${dateStr}`;
    } else {
      const sectionPath = dir.section.join("/");
      return `dates/${dateStr}/${sectionPath}`;
    }
  } else if (head.kind === "item") {
    // Item directory: parents/<parent-uuid> or parents/<parent-uuid>/1/3
    const parentId = head.id.toString();
    if (dir.section.length === 0) {
      return `parents/${parentId}`;
    } else {
      const sectionPath = dir.section.join("/");
      return `parents/${parentId}/${sectionPath}`;
    }
  } else {
    // Permanent directory: permanent or permanent/1/3
    if (dir.section.length === 0) {
      return `permanent`;
    } else {
      const sectionPath = dir.section.join("/");
      return `permanent/${sectionPath}`;
    }
  }
};

/**
 * Rebuild index from items
 *
 * Process:
 * 1. Parse each Item's directory field
 * 2. Extract parent (date or UUID) and section path
 * 3. Group Items by (parent, section)
 * 4. Sort by rank (with created_at tiebreak)
 * 5. Create Edge objects
 * 6. Build alias map
 */
export const rebuildFromItems = async (
  items: ReadonlyArray<Item>,
): Promise<Result<RebuildResult, RebuildError>> => {
  // Map from directory path to edges
  const edgesByDirectory = new Map<string, EdgeData[]>();

  // Map from alias file path to alias snapshot
  const aliases = new Map<string, AliasSnapshot>();

  let itemsProcessed = 0;
  let edgesCreated = 0;
  let aliasesCreated = 0;

  for (const item of items) {
    itemsProcessed++;

    // Build edge data
    const edgeData: EdgeData = {
      itemId: item.data.id,
      rank: item.data.rank,
      createdAt: item.data.createdAt,
    };

    // Get directory path for this item's directory
    const dirPath = getEdgeDirectoryPath(item);

    // Add to edges map
    const existingEdges = edgesByDirectory.get(dirPath);
    if (existingEdges) {
      existingEdges.push(edgeData);
    } else {
      edgesByDirectory.set(dirPath, [edgeData]);
    }
    edgesCreated++;

    // Build alias if present
    if (item.data.alias) {
      const slug = item.data.alias;
      const canonicalKey = slug.canonicalKey.toString();
      const hash = await computeAliasHash(canonicalKey);
      const aliasPath = `${hash.slice(0, 2)}/${hash}`;

      const aliasSnapshot: AliasSnapshot = {
        raw: slug.raw,
        canonicalKey: canonicalKey,
        itemId: item.data.id.toString(),
        createdAt: item.data.createdAt.toString(),
      };

      aliases.set(aliasPath, aliasSnapshot);
      aliasesCreated++;
    }
  }

  // Sort edges within each directory by rank, with created_at tiebreaker
  const sortedEdgesByDirectory = new Map<string, ReadonlyArray<EdgeData>>();
  for (const [dirPath, edges] of edgesByDirectory) {
    const sorted = [...edges].sort((a, b) => {
      const rankCmp = a.rank.compare(b.rank);
      if (rankCmp !== 0) return rankCmp;
      return a.createdAt.data.epochMilliseconds - b.createdAt.data.epochMilliseconds;
    });
    sortedEdgesByDirectory.set(dirPath, Object.freeze(sorted));
  }

  return Result.ok({
    graphEdges: sortedEdgesByDirectory,
    aliases,
    itemsProcessed,
    edgesCreated,
    aliasesCreated,
  });
};

/**
 * Index rebuilder interface
 */
export type IndexRebuilder = Readonly<{
  rebuildFromItems(items: ReadonlyArray<Item>): Promise<Result<RebuildResult, RebuildError>>;
}>;

/**
 * Create an index rebuilder
 */
export const createIndexRebuilder = (): IndexRebuilder => {
  return Object.freeze({
    rebuildFromItems,
  });
};
