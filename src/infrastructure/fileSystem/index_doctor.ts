import { Item } from "../../domain/models/item.ts";
import { Alias } from "../../domain/models/alias.ts";
import { ItemId } from "../../domain/primitives/item_id.ts";

/**
 * Edge reference with file path information for integrity checking
 */
export type EdgeReferenceWithPath = Readonly<{
  readonly itemId: ItemId;
  readonly rank: string;
  readonly path: string;
}>;

/**
 * Issue types detected during index integrity checking
 */
export type IndexIntegrityIssue = Readonly<{
  kind:
    | "EdgeTargetNotFound"
    | "DuplicateEdge"
    | "CycleDetected"
    | "AliasConflict"
    | "EdgeItemMismatch"
    | "OrphanedEdge"
    | "MissingEdge";
  message: string;
  path?: string;
  context?: Record<string, unknown>;
}>;

/**
 * Check index integrity across items, edges, and aliases
 *
 * Design principle:
 * - Parse individual models (Item, EdgeReference, Alias) validates data within model boundaries
 * - This function validates relationships between parsed models
 *
 * Integrity checks performed:
 * 1. Every edge points to existing Item
 * 2. No duplicate edges within same (parent, section)
 * 3. No cycles in parent/child graph
 * 4. Alias uniqueness across all Items
 * 5. Edge files match Item frontmatter placement/rank
 */
export const checkIndexIntegrity = (
  items: ReadonlyMap<string, Item>,
  edges: ReadonlyArray<EdgeReferenceWithPath>,
  aliases: ReadonlyArray<Alias>,
): ReadonlyArray<IndexIntegrityIssue> => {
  const issues: IndexIntegrityIssue[] = [];

  // 1. Check edge targets exist in items
  const edgeTargetIssues = checkEdgeTargets(items, edges);
  issues.push(...edgeTargetIssues);

  // 2. Check for duplicate edges
  const duplicateIssues = checkDuplicateEdges(edges);
  issues.push(...duplicateIssues);

  // 3. Detect cycles in parent-child relationships
  const cycleIssues = detectCycles(items);
  issues.push(...cycleIssues);

  // 4. Validate alias uniqueness
  const aliasIssues = checkAliasUniqueness(items, aliases);
  issues.push(...aliasIssues);

  // 5. Check edge files match item frontmatter (missing edges, orphaned edges)
  const syncIssues = checkEdgeItemSync(items, edges);
  issues.push(...syncIssues);

  return issues;
};

/**
 * Check that every edge points to an existing item
 */
const checkEdgeTargets = (
  items: ReadonlyMap<string, Item>,
  edges: ReadonlyArray<EdgeReferenceWithPath>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  for (const edge of edges) {
    const itemIdStr = edge.itemId.toString();
    if (!items.has(itemIdStr)) {
      issues.push({
        kind: "EdgeTargetNotFound",
        message: `Edge points to non-existent item: ${itemIdStr}`,
        path: edge.path,
        context: { itemId: itemIdStr },
      });
    }
  }

  return issues;
};

/**
 * Check for duplicate edges in the same location
 *
 * Two edges are duplicates if they:
 * - Point to the same item
 * - Are in the same directory (parent/section)
 */
const checkDuplicateEdges = (
  edges: ReadonlyArray<EdgeReferenceWithPath>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  // Group edges by directory (parent path)
  const edgesByDir = new Map<string, EdgeReferenceWithPath[]>();

  for (const edge of edges) {
    // Extract directory from edge path
    const lastSlash = edge.path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? edge.path.slice(0, lastSlash) : "";

    const existing = edgesByDir.get(dir) ?? [];
    existing.push(edge);
    edgesByDir.set(dir, existing);
  }

  // Check for duplicates within each directory
  for (const [dir, dirEdges] of edgesByDir) {
    const seenIds = new Map<string, string>(); // itemId -> first path

    for (const edge of dirEdges) {
      const itemIdStr = edge.itemId.toString();
      const existingPath = seenIds.get(itemIdStr);

      if (existingPath) {
        issues.push({
          kind: "DuplicateEdge",
          message: `Duplicate edge for item ${itemIdStr} in ${dir}`,
          path: edge.path,
          context: {
            itemId: itemIdStr,
            firstEdge: existingPath,
            duplicateEdge: edge.path,
          },
        });
      } else {
        seenIds.set(itemIdStr, edge.path);
      }
    }
  }

  return issues;
};

/**
 * Detect cycles in parent-child relationships using DFS
 *
 * Algorithm: Three-color marking (white/gray/black)
 * - White (unvisited): default
 * - Gray (in current DFS path): cycle detected if we encounter gray
 * - Black (fully explored): skip
 */
const detectCycles = (
  items: ReadonlyMap<string, Item>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  // Node states: 0 = white (unvisited), 1 = gray (in path), 2 = black (done)
  const state = new Map<string, number>();

  // Track path for cycle reporting
  const parent = new Map<string, string>();

  const dfs = (nodeId: string): boolean => {
    state.set(nodeId, 1); // Mark gray

    const item = items.get(nodeId);
    if (!item) {
      state.set(nodeId, 2); // Mark black
      return false;
    }

    const placement = item.data.placement;
    if (placement.head.kind === "item") {
      const parentId = placement.head.id.toString();

      const parentState = state.get(parentId) ?? 0;

      if (parentState === 1) {
        // Found cycle - reconstruct path
        const cyclePath: string[] = [nodeId, parentId];
        let current = nodeId;

        while (parent.has(current) && parent.get(current) !== parentId) {
          current = parent.get(current)!;
          cyclePath.push(current);
        }

        issues.push({
          kind: "CycleDetected",
          message: `Cycle detected: ${cyclePath.join(" → ")}`,
          context: {
            cycle: cyclePath,
          },
        });

        state.set(nodeId, 2);
        return true;
      }

      if (parentState === 0) {
        parent.set(parentId, nodeId);
        if (dfs(parentId)) {
          state.set(nodeId, 2);
          return true;
        }
      }
    }

    state.set(nodeId, 2); // Mark black
    return false;
  };

  // Run DFS from all unvisited nodes
  for (const nodeId of items.keys()) {
    if ((state.get(nodeId) ?? 0) === 0) {
      dfs(nodeId);
    }
  }

  return issues;
};

/**
 * Check alias uniqueness across all items
 *
 * Two items cannot have the same canonical_key for their aliases
 */
const checkAliasUniqueness = (
  items: ReadonlyMap<string, Item>,
  _aliases: ReadonlyArray<Alias>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  // Build map of canonical_key -> items
  const aliasToItems = new Map<string, Array<{ id: string; raw: string }>>();

  for (const [id, item] of items) {
    const alias = item.data.alias;
    if (alias) {
      // Convert to canonical form (NFKC + casefold)
      const canonicalKey = alias.toString().normalize("NFKC").toLowerCase();
      const rawAlias = alias.toString();

      const existing = aliasToItems.get(canonicalKey) ?? [];
      existing.push({ id, raw: rawAlias });
      aliasToItems.set(canonicalKey, existing);
    }
  }

  // Report conflicts
  for (const [canonicalKey, itemList] of aliasToItems) {
    if (itemList.length > 1) {
      issues.push({
        kind: "AliasConflict",
        message: `Duplicate canonical_key '${canonicalKey}'`,
        context: {
          canonicalKey,
          items: itemList.map((i) => ({ id: i.id, alias: i.raw })),
        },
      });
    }
  }

  return issues;
};

/**
 * Check that edge files are in sync with item frontmatter
 *
 * Reports:
 * - Missing edges: Items with placement but no corresponding edge file
 * - Orphaned edges: Edge files without corresponding items
 * - Rank mismatch: Edge rank differs from item rank
 */
const checkEdgeItemSync = (
  items: ReadonlyMap<string, Item>,
  edges: ReadonlyArray<EdgeReferenceWithPath>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  // Build set of item IDs that have edge files
  const itemsWithEdges = new Set<string>();
  const edgeRankByItem = new Map<string, string>();

  for (const edge of edges) {
    const itemIdStr = edge.itemId.toString();
    itemsWithEdges.add(itemIdStr);
    edgeRankByItem.set(itemIdStr, edge.rank);
  }

  // Check each item has an edge file
  for (const [id, item] of items) {
    if (!itemsWithEdges.has(id)) {
      const placement = item.data.placement.toString();
      issues.push({
        kind: "MissingEdge",
        message: `Missing edge file for item ${id} (placement: ${placement})`,
        context: {
          itemId: id,
          placement,
        },
      });
    } else {
      // Check rank matches
      const edgeRank = edgeRankByItem.get(id);
      const itemRank = item.data.rank.toString();

      if (edgeRank && edgeRank !== itemRank) {
        issues.push({
          kind: "EdgeItemMismatch",
          message: `Rank mismatch for item ${id}: edge has '${edgeRank}', item has '${itemRank}'`,
          context: {
            itemId: id,
            edgeRank,
            itemRank,
          },
        });
      }
    }
  }

  // Orphaned edges are already reported by checkEdgeTargets

  return issues;
};
