import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError, RepositoryError } from "../../domain/repositories/mod.ts";
import type { PlacementRange } from "../../domain/primitives/placement_range.ts";
import type { ItemId } from "../../domain/primitives/item_id.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { parseItemRank } from "../../domain/primitives/item_rank.ts";
import type { ItemRank } from "../../domain/primitives/item_rank.ts";

const EDGE_FILE_SUFFIX = ".edge.json";

/**
 * Edge file reference with item ID and rank for sorting
 */
export type EdgeReference = Readonly<{
  readonly itemId: ItemId;
  readonly rank: ItemRank;
}>;

/**
 * Read placement edge file (date-based placement)
 */
const readPlacementEdge = async (
  workspaceRoot: string,
  dateStr: string,
  fileName: string,
): Promise<Result<EdgeReference, RepositoryError>> => {
  const filePath = join(workspaceRoot, ".index", "graph", "dates", dateStr, fileName);

  try {
    const text = await Deno.readTextFile(filePath);
    const data = JSON.parse(text) as { schema?: string; rank: string };

    // Extract item ID from filename (<itemId>.edge.json)
    const itemIdStr = fileName.replace(EDGE_FILE_SUFFIX, "");
    const itemIdResult = parseItemId(itemIdStr);
    if (itemIdResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "list", "invalid item ID in edge filename", {
          identifier: fileName,
          cause: itemIdResult.error,
        }),
      );
    }

    const rankResult = parseItemRank(data.rank);
    if (rankResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "list", "invalid rank in placement edge", {
          identifier: itemIdStr,
          cause: rankResult.error,
        }),
      );
    }

    return Result.ok({
      itemId: itemIdResult.value,
      rank: rankResult.value,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("item", "list", "placement edge file is invalid JSON", {
          identifier: fileName,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to read placement edge file", {
        identifier: fileName,
        cause: error,
      }),
    );
  }
};

/**
 * Read parent edge file (item-based placement)
 */
const readParentEdge = async (
  edgeFilePath: string,
  fileName: string,
): Promise<Result<EdgeReference, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(edgeFilePath);
    const data = JSON.parse(text) as { schema?: string; from: string; to: string; rank: string };

    const itemIdResult = parseItemId(data.to);
    if (itemIdResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "list", "invalid item ID in parent edge", {
          identifier: fileName,
          cause: itemIdResult.error,
        }),
      );
    }

    const rankResult = parseItemRank(data.rank);
    if (rankResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "list", "invalid rank in parent edge", {
          identifier: data.to,
          cause: rankResult.error,
        }),
      );
    }

    return Result.ok({
      itemId: itemIdResult.value,
      rank: rankResult.value,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("item", "list", "parent edge file is invalid JSON", {
          identifier: fileName,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to read parent edge file", {
        identifier: fileName,
        cause: error,
      }),
    );
  }
};

/**
 * List edge references for items under a specific date
 */
const listDateEdges = async (
  workspaceRoot: string,
  dateStr: string,
): Promise<Result<ReadonlyArray<EdgeReference>, RepositoryError>> => {
  const directory = join(workspaceRoot, ".index", "graph", "dates", dateStr);

  try {
    const edges: EdgeReference[] = [];

    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(EDGE_FILE_SUFFIX)) {
        continue;
      }

      const edgeResult = await readPlacementEdge(workspaceRoot, dateStr, entry.name);
      if (edgeResult.type === "error") {
        return edgeResult;
      }

      edges.push(edgeResult.value);
    }

    return Result.ok(edges);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // No edge directory means no items at this placement
      return Result.ok([]);
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to read date edge directory", {
        identifier: dateStr,
        cause: error,
      }),
    );
  }
};

/**
 * List edge references for items under a specific parent and section path
 */
const listParentEdges = async (
  workspaceRoot: string,
  parentId: ItemId,
  sectionPath: string,
): Promise<Result<ReadonlyArray<EdgeReference>, RepositoryError>> => {
  const directory = sectionPath
    ? join(workspaceRoot, ".index", "graph", "parents", parentId.toString(), sectionPath)
    : join(workspaceRoot, ".index", "graph", "parents", parentId.toString());

  try {
    const edges: EdgeReference[] = [];

    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(EDGE_FILE_SUFFIX)) {
        continue;
      }

      const edgeFilePath = join(directory, entry.name);
      const edgeResult = await readParentEdge(edgeFilePath, entry.name);
      if (edgeResult.type === "error") {
        return edgeResult;
      }

      edges.push(edgeResult.value);
    }

    return Result.ok(edges);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // No edge directory means no items at this placement
      return Result.ok([]);
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to read parent edge directory", {
        identifier: `${parentId.toString()}/${sectionPath}`,
        cause: error,
      }),
    );
  }
};

/**
 * List edge references for items under permanent placement
 */
const listPermanentEdges = async (
  workspaceRoot: string,
  sectionPath: string,
): Promise<Result<ReadonlyArray<EdgeReference>, RepositoryError>> => {
  const directory = sectionPath
    ? join(workspaceRoot, ".index", "graph", "permanent", sectionPath)
    : join(workspaceRoot, ".index", "graph", "permanent");

  try {
    const edges: EdgeReference[] = [];

    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(EDGE_FILE_SUFFIX)) {
        continue;
      }

      const edgeFilePath = join(directory, entry.name);
      const edgeResult = await readPermanentEdge(edgeFilePath, entry.name);
      if (edgeResult.type === "error") {
        return edgeResult;
      }

      edges.push(edgeResult.value);
    }

    return Result.ok(edges);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // No edge directory means no items at this placement
      return Result.ok([]);
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to read permanent edge directory", {
        identifier: sectionPath || "permanent",
        cause: error,
      }),
    );
  }
};

/**
 * Read permanent edge file
 */
const readPermanentEdge = async (
  edgeFilePath: string,
  fileName: string,
): Promise<Result<EdgeReference, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(edgeFilePath);
    const data = JSON.parse(text) as { schema?: string; rank: string };

    // Extract item ID from filename (<itemId>.edge.json)
    const itemIdStr = fileName.replace(EDGE_FILE_SUFFIX, "");
    const itemIdResult = parseItemId(itemIdStr);
    if (itemIdResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "list", "invalid item ID in permanent edge filename", {
          identifier: fileName,
          cause: itemIdResult.error,
        }),
      );
    }

    const rankResult = parseItemRank(data.rank);
    if (rankResult.type === "error") {
      return Result.error(
        createRepositoryError("item", "list", "invalid rank in permanent edge", {
          identifier: itemIdStr,
          cause: rankResult.error,
        }),
      );
    }

    return Result.ok({
      itemId: itemIdResult.value,
      rank: rankResult.value,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("item", "list", "permanent edge file is invalid JSON", {
          identifier: fileName,
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("item", "list", "failed to read permanent edge file", {
        identifier: fileName,
        cause: error,
      }),
    );
  }
};

/**
 * Query edge references for items matching a placement range
 *
 * This function reads edge files from the .index/graph directory instead of
 * scanning all item files. The edge files contain item IDs and ranks, which
 * allows us to:
 * 1. Quickly find which items match the placement range
 * 2. Get their ranks for sorting
 * 3. Return only the item IDs that need to be loaded
 *
 * The caller (ItemRepository) is responsible for loading the actual item files.
 */
export const queryEdgeReferences = async (
  workspaceRoot: string,
  range: PlacementRange,
): Promise<Result<ReadonlyArray<EdgeReference>, RepositoryError>> => {
  switch (range.kind) {
    case "single": {
      // Single placement: query exact location
      if (range.at.head.kind === "date") {
        const dateStr = range.at.head.date.toString();
        const sectionPath = range.at.section.join("/");

        if (sectionPath === "") {
          // Direct under date (e.g., "2025-11-15")
          return await listDateEdges(workspaceRoot, dateStr);
        } else {
          // Under date section (e.g., "2025-11-15/1/3")
          // Date sections are stored as parent edges with the date as parent
          // This is not currently implemented in the edge writing logic
          // For now, fall back to empty result
          return Result.ok([]);
        }
      } else if (range.at.head.kind === "item") {
        // Under item parent
        const parentId = range.at.head.id;
        const sectionPath = range.at.section.join("/");
        return await listParentEdges(workspaceRoot, parentId, sectionPath);
      } else {
        // Permanent placement
        const sectionPath = range.at.section.join("/");
        return await listPermanentEdges(workspaceRoot, sectionPath);
      }
    }

    case "dateRange": {
      // Date range: query multiple dates and merge results
      const allEdges: EdgeReference[] = [];
      const fromStr = range.from.toString();
      const toStr = range.to.toString();

      // Generate all dates in range (YYYY-MM-DD format sorts lexicographically)
      const current = new Date(fromStr);
      const end = new Date(toStr);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        const edgesResult = await listDateEdges(workspaceRoot, dateStr);
        if (edgesResult.type === "error") {
          return edgesResult;
        }
        allEdges.push(...edgesResult.value);

        // Move to next day
        current.setDate(current.getDate() + 1);
      }

      return Result.ok(allEdges);
    }

    case "numericRange": {
      // Numeric range: query parent and filter by section number
      const allEdges: EdgeReference[] = [];

      if (range.parent.head.kind === "item") {
        const parentId = range.parent.head.id;

        // Build base section path from parent placement
        const baseSectionPath = range.parent.section.join("/");

        // Query each numeric section in range
        for (let num = range.from; num <= range.to; num++) {
          const sectionPath = baseSectionPath ? `${baseSectionPath}/${num}` : num.toString();

          const edgesResult = await listParentEdges(workspaceRoot, parentId, sectionPath);
          if (edgesResult.type === "error") {
            return edgesResult;
          }

          allEdges.push(...edgesResult.value);
        }
      } else {
        // Numeric range under date not currently supported in edge writing
        // Fall back to empty result
        return Result.ok([]);
      }

      return Result.ok(allEdges);
    }
  }
};
