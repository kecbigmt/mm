import { Result } from "../../shared/result.ts";
import { Placement } from "../primitives/placement.ts";
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

export type PlacementDisplayDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
}>;

export type PlacementDisplayError =
  | RepositoryError
  | ValidationError<"PlacementDisplay">;

/**
 * Converts a Placement to a ResolvedGraphPath for display purposes
 * This function looks up aliases for items to provide user-friendly paths
 * and traverses up to the root date to build a complete path
 */
export async function placementToResolvedGraphPath(
  placement: Placement,
  deps: PlacementDisplayDependencies,
): Promise<Result<ResolvedGraphPath, PlacementDisplayError>> {
  const segments: ResolvedSegment[] = [];

  // Build path from root to current placement
  // If head is an item, we need to traverse up to find the root date
  let currentPlacement = placement;
  const pathStack: Array<{ id: ItemId; alias?: AliasSlug; section: ReadonlyArray<number> }> = [];

  // Traverse up to the root (date or permanent)
  while (currentPlacement.head.kind === "item") {
    const itemId = currentPlacement.head.id;
    const itemResult = await deps.itemRepository.load(itemId);
    if (itemResult.type === "error") {
      return Result.error(itemResult.error);
    }
    if (!itemResult.value) {
      return Result.error(
        createValidationError("PlacementDisplay", [
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
      section: currentPlacement.section,
    });

    // Move to parent placement
    currentPlacement = itemResult.value.data.placement;
  }

  // Now currentPlacement has a date or permanent head - this is our root
  if (currentPlacement.head.kind === "date") {
    segments.push({
      kind: "date",
      date: currentPlacement.head.date,
    });
  } else {
    // permanent head - use "permanent" as the root segment
    // Note: ResolvedGraphPath doesn't have a "permanent" kind yet,
    // so we represent it as a section with index 0 as placeholder
    // This will need to be extended when permanent display is fully implemented
    segments.push({
      kind: "section",
      index: 0,
    });
  }

  // Add root sections (if any)
  for (const sectionIndex of currentPlacement.section) {
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
 * Formats a Placement as a user-friendly string with aliases
 */
export async function formatPlacementForDisplay(
  placement: Placement,
  deps: PlacementDisplayDependencies,
): Promise<Result<string, PlacementDisplayError>> {
  const graphPathResult = await placementToResolvedGraphPath(placement, deps);
  if (graphPathResult.type === "error") {
    return Result.error(graphPathResult.error);
  }

  return Result.ok(formatResolvedGraphPath(graphPathResult.value));
}
