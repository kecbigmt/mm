import { Result } from "../../shared/result.ts";
import { Directory } from "../primitives/directory.ts";
import {
  createResolvedGraphPath,
  formatResolvedGraphPath,
  ResolvedGraphPath,
  ResolvedSegment,
} from "../primitives/resolved_graph_path.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { AliasSlug } from "../primitives/alias_slug.ts";
import { ItemId } from "../primitives/item_id.ts";

export type DirectoryDisplayDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
}>;

export type DirectoryDisplayError =
  | RepositoryError
  | ValidationError<"DirectoryDisplay">;

/**
 * Converts a Directory to a ResolvedGraphPath for display purposes
 * This function looks up aliases for items to provide user-friendly paths
 * and traverses up to the root date to build a complete path
 */
export async function directoryToResolvedGraphPath(
  directory: Directory,
  deps: DirectoryDisplayDependencies,
): Promise<Result<ResolvedGraphPath, DirectoryDisplayError>> {
  const segments: ResolvedSegment[] = [];

  // Build path from root to current directory
  // If head is an item, we need to traverse up to find the root date
  let currentDirectory = directory;
  const pathStack: Array<{ id: ItemId; alias?: AliasSlug; section: ReadonlyArray<number> }> = [];

  // Traverse up to the root (date or permanent)
  while (currentDirectory.head.kind === "item") {
    const itemId = currentDirectory.head.id;
    const itemResult = await deps.itemRepository.load(itemId);
    if (itemResult.type === "error") {
      return Result.error(itemResult.error);
    }
    if (!itemResult.value) {
      return Result.error(
        createValidationError("DirectoryDisplay", [
          createValidationIssue(
            `Item not found: ${itemId.toString()}`,
            { code: "item_not_found", path: ["value"] },
          ),
        ]),
      );
    }

    pathStack.push({
      id: itemId,
      alias: itemResult.value.data.alias,
      section: currentDirectory.section,
    });

    // Move to parent directory
    currentDirectory = itemResult.value.data.directory;
  }

  // Now currentDirectory has a date or permanent head - this is our root
  if (currentDirectory.head.kind === "date") {
    segments.push({
      kind: "date",
      date: currentDirectory.head.date,
    });
  } else {
    // permanent head
    segments.push({
      kind: "permanent",
    });
  }

  // Add root sections (if any)
  for (const sectionIndex of currentDirectory.section) {
    segments.push({
      kind: "section",
      index: sectionIndex,
    });
  }

  // Now unwind the stack to build the path from root to current
  for (let i = pathStack.length - 1; i >= 0; i--) {
    const entry = pathStack[i];
    segments.push({
      kind: "item",
      id: entry.id,
      alias: entry.alias,
    });

    // Add sections
    for (const sectionIndex of entry.section) {
      segments.push({
        kind: "section",
        index: sectionIndex,
      });
    }
  }

  const graphPath = createResolvedGraphPath(segments);
  return Result.ok(graphPath);
}

/**
 * Formats a Directory as a user-friendly string with aliases
 */
export async function formatDirectoryForDisplay(
  directory: Directory,
  deps: DirectoryDisplayDependencies,
): Promise<Result<string, DirectoryDisplayError>> {
  const graphPathResult = await directoryToResolvedGraphPath(directory, deps);
  if (graphPathResult.type === "error") {
    return Result.error(graphPathResult.error);
  }

  return Result.ok(formatResolvedGraphPath(graphPathResult.value));
}
