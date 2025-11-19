# Phase 0: Risk Mitigation Spikes - Findings

**Date:** 2025-11-17
**Status:** ✅ Complete

---

## Overview

Phase 0 conducted three exploratory spikes to de-risk high-uncertainty technical areas in the `mm doctor` implementation. All spikes were successful, validating the technical approaches and reducing implementation risk.

---

## Spike 0.1: Placement Parsing Investigation

### Objective

Understand the `Placement` type structure and prototype parsing logic to extract parent and section path for index rebuilding.

### Key Findings

1. **Placement parsing is already implemented** via `parsePlacement()` in `src/domain/primitives/placement.ts`

2. **Placement structure:**
   ```typescript
   type Placement = {
     head: { kind: 'date', date: CalendarDay } | { kind: 'item', id: ItemId }
     section: ReadonlyArray<number>
   }
   ```

3. **Parent extraction:**
   - Date placements: `placement.head.date` (e.g., `"2025-01-15"`)
   - Item placements: `placement.head.id` (e.g., UUID)

4. **Section path extraction:**
   - Direct child: `placement.section.length === 0`
   - With sections: `placement.section` (e.g., `[1, 3]` → `/1/3`)

5. **Edge file directory mapping:**
   - Date: `.index/graph/dates/<YYYY-MM-DD>/`
   - Item (no section): `.index/graph/parents/<parent-uuid>/`
   - Item (with section): `.index/graph/parents/<parent-uuid>/<section-path>/`

### Impact on Task 1.2 (Index Rebuilder)

- ✅ **No custom parsing needed** - use existing `parsePlacement()`
- ✅ **Clear directory mapping logic** identified
- ✅ **Edge file structure** understood

### Deliverable

- [`spike_0_1_placement_parsing.ts`](/home/kecy/dev/worktrees/mm/feature-doctor-command-spike/spike_0_1_placement_parsing.ts) - Working prototype demonstrating placement parsing

---

## Spike 0.2: Cycle Detection Prototype

### Objective

Prototype DFS-based cycle detection, test with fixtures, and benchmark performance characteristics.

### Key Findings

1. **Algorithm:** DFS with three-color node marking (white/gray/black)
   - White: unvisited
   - Gray: in current DFS path (on stack)
   - Black: visited and all descendants explored
   - **Cycle detected** when encountering a gray node during traversal

2. **Complexity:**
   - Time: **O(V + E)** where V = nodes, E = edges
   - Space: **O(V)** for state tracking

3. **Performance benchmarks:**
   ```
   100 nodes:   ~0.06ms
   500 nodes:   ~0.24ms
   1000 nodes:  ~0.41ms
   5000 nodes:  ~1.80ms
   ```

4. **Characteristics:**
   - Handles **1000s of nodes in <10ms**
   - Early termination when cycle found
   - Scales linearly with graph size
   - Suitable for workspace-scale graphs

5. **Test coverage:**
   - ✅ Valid DAG (no cycles)
   - ✅ Simple cycle (A → B → A)
   - ✅ Complex cycle (A → B → C → D → B)
   - ✅ Self-loop (A → A)
   - ✅ Disconnected graph with cycle in one component

### Impact on Task 2.1 (Index Doctor)

- ✅ **DFS approach validated** - efficient and scalable
- ✅ **Performance acceptable** for workspace scale
- ✅ **Implementation straightforward** - adapt with `ItemId` types and `IndexIntegrityIssue` results

### Deliverable

- [`spike_0_2_cycle_detection.ts`](/home/kecy/dev/worktrees/mm/feature-doctor-command-spike/spike_0_2_cycle_detection.ts) - Working prototype with benchmarks

---

## Spike 0.3: Large Workspace Scan Benchmark

### Objective

Benchmark workspace scanning performance, compare streaming vs. batch approaches, and measure memory/throughput characteristics.

### Key Findings

1. **Streaming approach (AsyncIterableIterator):**
   - **Constant memory usage** (~0.5 MB delta) regardless of workspace size
   - Throughput: **15,000-44,000 items/sec**
   - Allows **early termination** and **progress reporting**
   - **Error tolerance** - yield errors per-item, don't abort scan

2. **Batch approach (load all at once):**
   - Simpler code, but **memory grows with item count**
   - Throughput: **31,000-41,000 items/sec** (similar to streaming)
   - Not suitable for very large workspaces

3. **Performance characteristics:**
   ```
   100 items:   Streaming: 6.30ms  | Batch: 3.17ms
   500 items:   Streaming: 13.27ms | Batch: 12.39ms
   1000 items:  Streaming: 22.71ms | Batch: 24.01ms
   ```

4. **Bottleneck:** File I/O dominates; parsing overhead negligible

5. **Implementation approach:**
   ```typescript
   async function* scanItemsStreaming(
     workspaceRoot: string
   ): AsyncIterableIterator<Result<Item, ScanError>> {
     for await (const filePath of walkMarkdownFiles(itemsDir)) {
       // Read file, parse frontmatter, yield result or error
     }
   }
   ```

### Impact on Task 2.2 (Workspace Scanner)

- ✅ **AsyncIterableIterator is the right approach** - constant memory, good throughput
- ✅ **Performance acceptable** - handles 1000s of items in <30ms
- ✅ **Error tolerance pattern validated** - yield errors, don't throw
- ✅ **Progress reporting feasible** - can track items scanned

### Deliverable

- [`spike_0_3_workspace_scan.ts`](/home/kecy/dev/worktrees/mm/feature-doctor-command-spike/spike_0_3_workspace_scan.ts) - Working prototype with benchmarks

---

## Risk Mitigation Summary

| Task | Risk Level (Before) | Risk Level (After) | Mitigation |
|------|---------------------|-----------------------|------------|
| **Task 1.2** (Index Rebuilder) | 🔴 HIGH | 🟢 LOW | Placement parsing logic clear, existing APIs sufficient |
| **Task 2.1** (Index Doctor) | 🔴 HIGH | 🟢 LOW | DFS algorithm validated, benchmarks show acceptable performance |
| **Task 2.2** (Workspace Scanner) | 🔴 HIGH | 🟢 LOW | Streaming approach validated, performance characteristics known |

---

## Recommendations for Implementation

### Task 1.2 (Index Rebuilder)

```typescript
export interface IndexRebuilder {
  rebuildFromItems(items: ReadonlyArray<Item>): Result<RebuildResult, RebuildError>;
  // Use parsePlacement() to extract head and section
  // Map to edge directories based on head.kind
}
```

### Task 2.1 (Index Doctor)

```typescript
export const checkIndexIntegrity = (
  items: ReadonlyMap<ItemId, Item>,
  edges: ReadonlyArray<EdgeReference>,
  aliases: ReadonlyArray<AliasEntry>,
): ReadonlyArray<IndexIntegrityIssue> => {
  // Use DFS with white/gray/black node marking for cycle detection
  // Return IndexIntegrityIssue for each issue found
};
```

### Task 2.2 (Workspace Scanner)

```typescript
export interface WorkspaceScanner {
  scanAllItems(workspaceRoot: string): AsyncIterableIterator<Result<Item, ScanError>>;
  // Use AsyncIterableIterator for constant memory
  // Yield errors per-item, don't abort scan
}
```

---

## Next Steps

Phase 0 is complete. Proceed to **Phase 1 & 2** implementation with confidence that high-risk technical areas have been validated.

### Priority Tasks (Iteration 1):

1. **Task 1.1** - ValidationReport Type (foundation)
2. **Task 1.2** - Index Rebuilder (high complexity, now de-risked)
3. **Task 1.3** - Rank Rebalancer (independent)
4. **Task 2.1** - Index Doctor (high complexity, now de-risked)

### Iteration 2:

1. **Task 2.2** - Workspace Scanner (high priority, now de-risked)
2. **Task 2.3** - Index Writer (standard file I/O)
3. **Task 2.4** - Item Updater (standard file I/O)

---

**Phase 0 Status: ✅ Complete**
