import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { Item, parseItem } from "../../domain/models/item.ts";
import { Alias, AliasSnapshot, parseAlias } from "../../domain/models/alias.ts";
import { parseItemId } from "../../domain/primitives/item_id.ts";
import { parseItemRank } from "../../domain/primitives/item_rank.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { walkFiles } from "./file_walker.ts";
import { EdgeReference } from "./graph_index.ts";
import { EdgeReferenceWithPath } from "./index_doctor.ts";

/**
 * Error type for workspace scanning operations
 */
export type ScanError = Readonly<{
  kind: "io_error" | "parse_error";
  message: string;
  path: string;
  cause?: unknown;
}>;

/**
 * Workspace scanner for doctor commands
 *
 * Provides streaming iteration over all items, edges, and aliases in a workspace.
 * Uses AsyncIterableIterator for memory efficiency with large workspaces.
 */
export type WorkspaceScanner = Readonly<{
  scanAllItems(): AsyncIterableIterator<Result<Item, ScanError>>;
  scanAllEdges(): AsyncIterableIterator<Result<EdgeReference, ScanError>>;
  scanAllEdgesWithPath(): AsyncIterableIterator<Result<EdgeReferenceWithPath, ScanError>>;
  scanAllAliases(): AsyncIterableIterator<Result<Alias, ScanError>>;
}>;

type ItemFrontmatter = Readonly<{
  id: string;
  icon: string;
  kind?: string;
  status: string;
  directory: string;
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

/**
 * Extract title and body from markdown content
 */
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

/**
 * Create a workspace scanner for the given workspace root
 */
export const createWorkspaceScanner = (workspaceRoot: string): WorkspaceScanner => {
  const scanAllItems = async function* (): AsyncIterableIterator<Result<Item, ScanError>> {
    const itemsDir = join(workspaceRoot, "items");

    for await (const filePath of walkFiles(itemsDir, ".md")) {
      // Read file content
      let content: string;
      try {
        content = await Deno.readTextFile(filePath);
      } catch (error) {
        yield Result.error({
          kind: "io_error",
          message: "failed to read item file",
          path: filePath,
          cause: error,
        });
        continue;
      }

      // Parse frontmatter
      const fmResult = parseFrontmatter<ItemFrontmatter>(content);
      if (fmResult.type === "error") {
        yield Result.error({
          kind: "parse_error",
          message: "failed to parse frontmatter",
          path: filePath,
          cause: fmResult.error,
        });
        continue;
      }

      const { frontmatter, body } = fmResult.value;
      const { title, body: bodyContent } = extractTitleAndBody(body);

      // Build snapshot and parse item
      const snapshot = {
        id: frontmatter.id,
        title,
        icon: frontmatter.icon,
        status: frontmatter.status,
        directory: frontmatter.directory,
        rank: frontmatter.rank,
        createdAt: frontmatter.created_at,
        updatedAt: frontmatter.updated_at,
        closedAt: frontmatter.closed_at,
        startAt: frontmatter.start_at,
        duration: frontmatter.duration,
        dueAt: frontmatter.due_at,
        alias: frontmatter.alias,
        context: frontmatter.context,
        body: bodyContent,
      };

      const itemResult = parseItem(snapshot);
      if (itemResult.type === "error") {
        yield Result.error({
          kind: "parse_error",
          message: "invalid item data",
          path: filePath,
          cause: itemResult.error,
        });
        continue;
      }

      yield Result.ok(itemResult.value);
    }
  };

  const scanAllEdges = async function* (): AsyncIterableIterator<Result<EdgeReference, ScanError>> {
    // Scan date edges
    const datesDir = join(workspaceRoot, ".index", "graph", "dates");
    for await (const filePath of walkFiles(datesDir, ".edge.json")) {
      const result = await parseEdgeFile(filePath);
      yield result;
    }

    // Scan parent edges
    const parentsDir = join(workspaceRoot, ".index", "graph", "parents");
    for await (const filePath of walkFiles(parentsDir, ".edge.json")) {
      const result = await parseEdgeFile(filePath);
      yield result;
    }
  };

  const scanAllEdgesWithPath = async function* (): AsyncIterableIterator<
    Result<EdgeReferenceWithPath, ScanError>
  > {
    // Scan date edges
    const datesDir = join(workspaceRoot, ".index", "graph", "dates");
    for await (const filePath of walkFiles(datesDir, ".edge.json")) {
      const result = await parseEdgeFileWithPath(filePath);
      yield result;
    }

    // Scan parent edges
    const parentsDir = join(workspaceRoot, ".index", "graph", "parents");
    for await (const filePath of walkFiles(parentsDir, ".edge.json")) {
      const result = await parseEdgeFileWithPath(filePath);
      yield result;
    }
  };

  const scanAllAliases = async function* (): AsyncIterableIterator<Result<Alias, ScanError>> {
    const aliasesDir = join(workspaceRoot, ".index", "aliases");

    for await (const filePath of walkFiles(aliasesDir, ".alias.json")) {
      // Read file content
      let content: string;
      try {
        content = await Deno.readTextFile(filePath);
      } catch (error) {
        yield Result.error({
          kind: "io_error",
          message: "failed to read alias file",
          path: filePath,
          cause: error,
        });
        continue;
      }

      // Parse JSON
      let data: AliasSnapshot;
      try {
        data = JSON.parse(content) as AliasSnapshot;
      } catch (error) {
        yield Result.error({
          kind: "parse_error",
          message: "invalid JSON in alias file",
          path: filePath,
          cause: error,
        });
        continue;
      }

      // Parse alias
      const aliasResult = parseAlias(data);
      if (aliasResult.type === "error") {
        yield Result.error({
          kind: "parse_error",
          message: "invalid alias data",
          path: filePath,
          cause: aliasResult.error,
        });
        continue;
      }

      yield Result.ok(aliasResult.value);
    }
  };

  return Object.freeze({
    scanAllItems,
    scanAllEdges,
    scanAllEdgesWithPath,
    scanAllAliases,
  });
};

/**
 * Parse an edge file into an EdgeReference
 */
async function parseEdgeFile(filePath: string): Promise<Result<EdgeReference, ScanError>> {
  // Read file content
  let content: string;
  try {
    content = await Deno.readTextFile(filePath);
  } catch (error) {
    return Result.error({
      kind: "io_error",
      message: "failed to read edge file",
      path: filePath,
      cause: error,
    });
  }

  // Parse JSON
  let data: { schema?: string; to?: string; rank: string };
  try {
    data = JSON.parse(content);
  } catch (error) {
    return Result.error({
      kind: "parse_error",
      message: "invalid JSON in edge file",
      path: filePath,
      cause: error,
    });
  }

  // For date edges, extract item ID from filename
  // For parent edges, use the "to" field
  let itemIdStr: string;
  if (data.to) {
    itemIdStr = data.to;
  } else {
    // Extract from filename: <itemId>.edge.json
    const fileName = filePath.split("/").pop() ?? "";
    itemIdStr = fileName.replace(".edge.json", "");
  }

  // Parse item ID
  const itemIdResult = parseItemId(itemIdStr);
  if (itemIdResult.type === "error") {
    return Result.error({
      kind: "parse_error",
      message: "invalid item ID in edge file",
      path: filePath,
      cause: itemIdResult.error,
    });
  }

  // Parse rank
  const rankResult = parseItemRank(data.rank);
  if (rankResult.type === "error") {
    return Result.error({
      kind: "parse_error",
      message: "invalid rank in edge file",
      path: filePath,
      cause: rankResult.error,
    });
  }

  return Result.ok({
    itemId: itemIdResult.value,
    rank: rankResult.value,
  });
}

/**
 * Parse an edge file into an EdgeReferenceWithPath (includes file path for doctor commands)
 */
async function parseEdgeFileWithPath(
  filePath: string,
): Promise<Result<EdgeReferenceWithPath, ScanError>> {
  // Read file content
  let content: string;
  try {
    content = await Deno.readTextFile(filePath);
  } catch (error) {
    return Result.error({
      kind: "io_error",
      message: "failed to read edge file",
      path: filePath,
      cause: error,
    });
  }

  // Parse JSON
  let data: { schema?: string; to?: string; rank?: string };
  try {
    data = JSON.parse(content);
  } catch (error) {
    return Result.error({
      kind: "parse_error",
      message: "invalid JSON in edge file",
      path: filePath,
      cause: error,
    });
  }

  // Validate rank field exists
  if (!data.rank) {
    return Result.error({
      kind: "parse_error",
      message: "missing rank field in edge file",
      path: filePath,
    });
  }

  // For date edges, extract item ID from filename
  // For parent edges, use the "to" field
  let itemIdStr: string;
  if (data.to) {
    itemIdStr = data.to;
  } else {
    // Extract from filename: <itemId>.edge.json
    const fileName = filePath.split("/").pop() ?? "";
    itemIdStr = fileName.replace(".edge.json", "");
  }

  // Parse item ID
  const itemIdResult = parseItemId(itemIdStr);
  if (itemIdResult.type === "error") {
    return Result.error({
      kind: "parse_error",
      message: "invalid item ID in edge file",
      path: filePath,
      cause: itemIdResult.error,
    });
  }

  return Result.ok({
    itemId: itemIdResult.value,
    rank: data.rank,
    path: filePath,
  });
}
