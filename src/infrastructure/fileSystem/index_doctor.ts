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
    | "MissingEdge"
    | "EdgeLocationMismatch"
    | "OrphanedAliasIndex"
    | "MissingAliasIndex";
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
 * Check alias uniqueness and consistency between frontmatter and index files
 *
 * Validates:
 * 1. No duplicate canonical_key in item frontmatter
 * 2. No duplicate canonical_key in alias index files
 * 3. Alias index files point to valid items with matching aliases
 * 4. Item frontmatter aliases have corresponding index files
 */
const checkAliasUniqueness = (
  items: ReadonlyMap<string, Item>,
  aliases: ReadonlyArray<Alias>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  // Check for duplicate canonical_key in item frontmatter
  const frontmatterByCanonicalKey = new Map<string, Array<{ id: string; raw: string }>>();
  for (const [id, item] of items) {
    const alias = item.data.alias;
    if (alias) {
      const canonicalKey = alias.toString().normalize("NFKC").toLowerCase();
      const rawAlias = alias.toString();

      const existing = frontmatterByCanonicalKey.get(canonicalKey) ?? [];
      existing.push({ id, raw: rawAlias });
      frontmatterByCanonicalKey.set(canonicalKey, existing);
    }
  }

  for (const [canonicalKey, itemList] of frontmatterByCanonicalKey) {
    if (itemList.length > 1) {
      issues.push({
        kind: "AliasConflict",
        message: `Duplicate canonical_key '${canonicalKey}' in item frontmatter`,
        context: {
          canonicalKey,
          items: itemList.map((i) => ({ id: i.id, alias: i.raw })),
        },
      });
    }
  }

  // Build map of canonical_key -> alias index entries
  const indexByCanonicalKey = new Map<string, Alias[]>();
  for (const alias of aliases) {
    const canonicalKey = alias.data.slug.canonicalKey.toString();
    const existing = indexByCanonicalKey.get(canonicalKey) ?? [];
    existing.push(alias);
    indexByCanonicalKey.set(canonicalKey, existing);
  }

  // Check for duplicate canonical_key in alias index files
  for (const [canonicalKey, aliasEntries] of indexByCanonicalKey) {
    if (aliasEntries.length > 1) {
      issues.push({
        kind: "AliasConflict",
        message: `Duplicate canonical_key '${canonicalKey}' in alias index`,
        context: {
          canonicalKey,
          entries: aliasEntries.map((a) => ({
            itemId: a.data.itemId.toString(),
            raw: a.data.slug.raw,
          })),
        },
      });
    }
  }

  // Build map of itemId -> alias index entry (for quick lookup)
  const indexByItemId = new Map<string, Alias>();
  for (const alias of aliases) {
    const itemId = alias.data.itemId.toString();
    // Use first entry if multiple (duplicates already reported above)
    if (!indexByItemId.has(itemId)) {
      indexByItemId.set(itemId, alias);
    }
  }

  // Check each alias index entry
  for (const alias of aliases) {
    const itemId = alias.data.itemId.toString();
    const canonicalKey = alias.data.slug.canonicalKey.toString();
    const item = items.get(itemId);

    if (!item) {
      // Orphaned alias index: points to non-existent item
      issues.push({
        kind: "OrphanedAliasIndex",
        message: `Alias index points to non-existent item: ${itemId}`,
        context: {
          itemId,
          canonicalKey,
          raw: alias.data.slug.raw,
        },
      });
      continue;
    }

    const itemAlias = item.data.alias;
    if (!itemAlias) {
      // Orphaned alias index: item has no alias in frontmatter
      issues.push({
        kind: "OrphanedAliasIndex",
        message: `Alias index exists but item ${itemId} has no alias in frontmatter`,
        context: {
          itemId,
          canonicalKey,
          raw: alias.data.slug.raw,
        },
      });
      continue;
    }

    // Check if canonical_key matches
    const itemCanonicalKey = itemAlias.toString().normalize("NFKC").toLowerCase();
    if (canonicalKey !== itemCanonicalKey) {
      // Stale alias index: canonical_key doesn't match item frontmatter
      issues.push({
        kind: "OrphanedAliasIndex",
        message: `Alias index canonical_key '${canonicalKey}' doesn't match item ${itemId} frontmatter '${itemCanonicalKey}'`,
        context: {
          itemId,
          indexCanonicalKey: canonicalKey,
          itemCanonicalKey,
        },
      });
    }
  }

  // Check each item's frontmatter alias
  for (const [id, item] of items) {
    const itemAlias = item.data.alias;
    if (itemAlias) {
      const aliasEntry = indexByItemId.get(id);
      if (!aliasEntry) {
        // Missing alias index file
        issues.push({
          kind: "MissingAliasIndex",
          message: `Item ${id} has alias '${itemAlias.toString()}' but no alias index file`,
          context: {
            itemId: id,
            alias: itemAlias.toString(),
          },
        });
      }
    }
  }

  return issues;
};

/**
 * Derive the expected edge directory pattern from an item's placement
 *
 * Returns a pattern like:
 * - "dates/2024-01-15" for date placement
 * - "dates/2024-01-15/1/2" for date placement with sections
 * - "parents/<parent-id>" for item placement
 * - "parents/<parent-id>/1/2" for item placement with sections
 */
const deriveExpectedEdgeDirectory = (item: Item): string => {
  const placement = item.data.placement;
  const sections = placement.section;

  let basePath: string;

  if (placement.head.kind === "date") {
    const date = placement.head.date;
    // Use ISO format (YYYY-MM-DD) to match graph_index storage
    const dateStr = date.data.iso;
    basePath = `dates/${dateStr}`;
  } else {
    // item placement
    const parentId = placement.head.id.toString();
    basePath = `parents/${parentId}`;
  }

  if (sections.length > 0) {
    return `${basePath}/${sections.join("/")}`;
  }

  return basePath;
};

/**
 * Extract the edge directory from an edge file path
 *
 * Input: "/workspace/.index/graph/dates/2024/01/15/item-id.edge.json"
 * Output: "dates/2024/01/15"
 */
const extractEdgeDirectory = (edgePath: string): string | null => {
  // Find ".index/graph/" in the path
  const graphMarker = ".index/graph/";
  const graphIndex = edgePath.indexOf(graphMarker);

  if (graphIndex === -1) {
    return null;
  }

  // Extract everything after ".index/graph/" up to the filename
  const afterGraph = edgePath.slice(graphIndex + graphMarker.length);
  const lastSlash = afterGraph.lastIndexOf("/");

  if (lastSlash === -1) {
    return null;
  }

  return afterGraph.slice(0, lastSlash);
};

/**
 * Check that edge files are in sync with item frontmatter
 *
 * Reports:
 * - Missing edges: Items with no edge file at expected location
 * - Rank mismatch: Edge rank differs from item rank
 * - Location mismatch: Edge exists but in wrong directory (stale edges)
 */
const checkEdgeItemSync = (
  items: ReadonlyMap<string, Item>,
  edges: ReadonlyArray<EdgeReferenceWithPath>,
): IndexIntegrityIssue[] => {
  const issues: IndexIntegrityIssue[] = [];

  // Build map of item ID -> ALL edges for that item
  const edgesByItem = new Map<string, Array<{ path: string; rank: string }>>();

  for (const edge of edges) {
    const itemIdStr = edge.itemId.toString();
    const existing = edgesByItem.get(itemIdStr) ?? [];
    existing.push({ path: edge.path, rank: edge.rank });
    edgesByItem.set(itemIdStr, existing);
  }

  // Check each item
  for (const [id, item] of items) {
    const itemEdges = edgesByItem.get(id);
    const expectedDir = deriveExpectedEdgeDirectory(item);

    if (!itemEdges || itemEdges.length === 0) {
      // No edge files at all
      const placement = item.data.placement.toString();
      issues.push({
        kind: "MissingEdge",
        message: `Missing edge file for item ${id} (placement: ${placement})`,
        context: {
          itemId: id,
          placement,
        },
      });
      continue;
    }

    // Check all edges for this item
    let hasCorrectLocation = false;
    let correctEdge: { path: string; rank: string } | undefined;

    for (const edgeInfo of itemEdges) {
      const actualDir = extractEdgeDirectory(edgeInfo.path);

      if (actualDir === expectedDir) {
        // Found edge at correct location
        hasCorrectLocation = true;
        correctEdge = edgeInfo;
      } else if (actualDir) {
        // Edge at wrong location (stale edge)
        issues.push({
          kind: "EdgeLocationMismatch",
          message: `Edge file for item ${id} is in wrong location`,
          path: edgeInfo.path,
          context: {
            itemId: id,
            expectedDirectory: expectedDir,
            actualDirectory: actualDir,
            placement: item.data.placement.toString(),
          },
        });
      }
    }

    // If no edge at correct location, report missing
    if (!hasCorrectLocation) {
      const placement = item.data.placement.toString();
      issues.push({
        kind: "MissingEdge",
        message: `Missing edge file for item ${id} at expected location (placement: ${placement})`,
        context: {
          itemId: id,
          placement,
          expectedDirectory: expectedDir,
        },
      });
    } else if (correctEdge) {
      // Check rank matches for the edge at correct location
      const edgeRank = correctEdge.rank;
      const itemRank = item.data.rank.toString();

      if (edgeRank !== itemRank) {
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

  return issues;
};
