# **mm doctor: Implementation Plan**

**Version:** 1.0
**Status:** In Progress (Sequential Complete, Parallel tracks ready)
**Target:** Initial implementation of `mm doctor` subcommands

---

## Overview

This plan breaks down the implementation of `mm doctor` into independent, parallelizable tasks organized by architectural layer. Each task is designed to be implementable without blocking dependencies where possible.

---

## Development Approach

### Test-Driven Development (TDD)

All implementation follows the **Red-Green-Refactor** cycle:

1. **Red** - Write a failing test that defines the expected behavior
2. **Green** - Write the minimum code to make the test pass
3. **Refactor** - Improve code quality while keeping tests green

### TDD Guidelines

- **Start with tests**: Every new function/module begins with a test file
- **Small increments**: Each cycle should be completable in minutes, not hours
- **Test behavior, not implementation**: Focus on inputs/outputs, not internal details
- **Descriptive test names**: Test names should describe the scenario and expected outcome
- **One assertion per test** (where practical): Makes failures easier to diagnose

### Test Organization

```
src/
  infrastructure/
    fileSystem/
      fixtures/
        helpers.ts               # Shared helpers for test workspace generation
      index_doctor.ts
      index_doctor_test.ts
      workspace_scanner.ts
      workspace_scanner_test.ts
  presentation/
    cli/
      commands/
        doctor/
          mod.ts                 # Parent command
          check.ts
          check_test.ts

tests/
  e2e/
    scenarios/
      doctor_test.ts             # End-to-end tests
```

Test workspaces are generated dynamically during test execution using helpers from `fixtures/helpers.ts`, not committed as static files.

### Test Types by Layer

| Layer | Test Type | Focus |
|-------|-----------|-------|
| Domain | Unit tests | Pure logic, no I/O |
| Infrastructure | Unit + Integration | File I/O with test fixtures |
| Presentation | E2E tests | Full command execution |

### Example TDD Cycle

```typescript
// 1. RED - Write failing test
Deno.test("detectCycles - returns empty array for valid DAG", () => {
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ];
  const result = detectCycles(edges);
  assertEquals(result, []);
});

// 2. GREEN - Minimal implementation
export const detectCycles = (edges: Edge[]): CycleIssue[] => {
  return []; // TODO: implement
};

// 3. RED - Add next test case
Deno.test("detectCycles - detects simple cycle", () => {
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "a" },
  ];
  const result = detectCycles(edges);
  assertEquals(result.length, 1);
});

// 4. GREEN - Implement cycle detection
// 5. REFACTOR - Clean up implementation
```

---

## Risk Assessment & Mitigation

### High-Risk Tasks (High Uncertainty)

The following tasks have significant technical uncertainty and should be de-risked early:

1. **Task 1.1: Index Rebuilder (Placement Parsing)** - Parsing logic unclear from existing codebase
2. **Task 1.3: Index Doctor (Cycle Detection)** - Complex algorithm, performance unknown at scale
3. **Task 1.4: Workspace Scanner (Streaming)** - Performance characteristics unknown for large workspaces

### Mitigation Strategy: Phase 0 (Spikes)

Before full implementation, conduct small spike tasks to validate technical approaches and reduce uncertainty.

---

## Task Breakdown

### **Phase 0: Risk Mitigation Spikes (Sequential)**

Small exploratory tasks to de-risk high-uncertainty areas.

#### **Spike 0.1: Placement Parsing Investigation**

Investigate existing `Placement` type structure and parsing:

- Examine `src/domain/primitives/placement.ts`
- Understand internal representation (head, section, etc.)
- Prototype parsing placement string to extract:
  - Parent (date `YYYY-MM-DD` or UUID)
  - Section path (e.g., `/1/3`)
- Document findings for Task 1.1

**Deliverable:** Small prototype + documentation of parsing approach

**Reduces risk for:** Task 1.1 (Index Rebuilder)

---

#### **Spike 0.2: Cycle Detection Prototype**

Prototype cycle detection algorithm:

- Implement DFS-based cycle detection
- Test with small graph fixtures (valid graphs, simple cycles, complex cycles)
- Benchmark with larger graphs (100s, 1000s of nodes)
- Identify memory/performance characteristics

**Deliverable:** Prototype implementation + benchmark results

**Reduces risk for:** Task 1.3 (Index Doctor)

---

#### **Spike 0.3: Large Workspace Scan Benchmark**

Benchmark workspace scanning performance:

- Create test workspace with 1000+ items
- Implement simple AsyncIterator-based scanner
- Measure:
  - Throughput (items/sec)
  - Memory usage
  - Error handling overhead
- Compare batch vs. streaming approaches

**Deliverable:** Benchmark results + recommended approach

**Reduces risk for:** Task 1.4 (Workspace Scanner)

---

### **Phase 1: Infrastructure Layer**

These tasks implement filesystem operations and can be developed in parallel.

#### **Task 1.1: Index Rebuilder**
**File:** `src/infrastructure/fileSystem/index_rebuilder.ts`

Implement index rebuild logic:

```typescript
export interface IndexRebuilder {
  rebuildFromItems(
    items: ReadonlyArray<Item>
  ): Result<RebuildResult, RebuildError>;
}

export type RebuildResult = Readonly<{
  graphEdges: Map<string, ReadonlyArray<Edge>>;  // key: directory path
  aliases: Map<string, Alias>;
  itemsProcessed: number;
  edgesCreated: number;
  aliasesCreated: number;
}>;
```

**Process:**
1. Parse each Item's `placement` field
2. Extract parent (date or UUID) and section path
3. Group Items by (parent, section)
4. Sort by `rank` (with `created_at` tiebreak)
5. Create Edge objects
6. Build alias map

**Deliverables:**
- `IndexRebuilder` implementation
- Placement parsing logic
- Edge grouping and sorting logic
- Unit tests with various placement patterns

**Dependencies:** None (uses existing domain models)

**Priority:** HIGH - Placement parsing needs validation, implement early after Spike 0.1

---

#### **Task 1.2: Rank Rebalancer**
**File:** `src/infrastructure/fileSystem/rank_rebalancer.ts`

Implement rank rebalancing logic:

```typescript
export interface RankRebalancer {
  rebalanceGroup(
    siblings: ReadonlyArray<Item>
  ): Result<ReadonlyArray<ItemRankUpdate>, RebalanceError>;
}

export type ItemRankUpdate = Readonly<{
  itemId: ItemId;
  oldRank: ItemRank;
  newRank: ItemRank;
}>;
```

**Process:**
1. Sort siblings by current `rank` (with `created_at` tiebreak)
2. Generate evenly-spaced new ranks using LexoRank
3. Verify ordering preserved
4. Return rank updates

**Deliverables:**
- `RankRebalancer` implementation
- Even distribution algorithm
- Ordering preservation verification
- Unit tests with dense rank scenarios

**Dependencies:** Existing `RankService`

---

#### **Task 1.3: Index Doctor**
**File:** `src/infrastructure/fileSystem/index_doctor.ts`

Implement index integrity checking for `mm doctor check`:

```typescript
export type IndexIntegrityIssue = Readonly<{
  kind: "EdgeTargetNotFound" | "DuplicateEdge" | "CycleDetected" | "AliasConflict" | "EdgeItemMismatch";
  message: string;
  path?: string;
  context?: Record<string, unknown>;
}>;

export const checkIndexIntegrity = (
  items: ReadonlyMap<ItemId, Item>,
  edges: ReadonlyArray<EdgeReference>,
  aliases: ReadonlyArray<AliasEntry>,
): ReadonlyArray<IndexIntegrityIssue> => {
  const issues: IndexIntegrityIssue[] = [];

  // 1. Check edge targets exist in items
  // 2. Detect duplicate edges within same (parent, section)
  // 3. Detect cycles in parent-child relationships
  // 4. Validate alias uniqueness
  // 5. Check edge rank matches item rank

  return issues;
};
```

**Design principle:**
- Parse individual models (Item, EdgeReference, AliasEntry) validates data within model boundaries
- `checkIndexIntegrity` validates relationships between parsed models

**Integrity checks:**
- Every edge points to existing Item
- No duplicate edges within same (parent, section)
- No cycles in parent/child graph
- Alias uniqueness
- Edge files match Item frontmatter placement/rank

**Deliverables:**
- `IndexIntegrityIssue` type
- `checkIndexIntegrity` function
- Cycle detection algorithm (DFS-based)
- Unit tests with fixtures (valid, cycles, duplicates, orphans)

**Dependencies:** None (uses existing types)

**Priority:** HIGH - Complex algorithm, implement early after Spike 0.2

---

#### **Task 1.4: Workspace Scanner**
**File:** `src/infrastructure/fileSystem/workspace_scanner.ts`

Implement workspace scanning:

```typescript
export interface WorkspaceScanner {
  scanAllItems(workspaceRoot: string): AsyncIterableIterator<Result<Item, ScanError>>;
  scanAllEdges(workspaceRoot: string): AsyncIterableIterator<Result<EdgeReference, ScanError>>;
  scanAllAliases(workspaceRoot: string): AsyncIterableIterator<Result<Alias, ScanError>>;
}
```

**Features:**
- Stream-based scanning (memory efficient)
- Error tolerance (continue on individual file errors)
- Progress reporting capability

**Deliverables:**
- `WorkspaceScanner` implementation
- Async iteration for large workspaces
- Unit tests with fixture workspaces
- Error handling tests

**Dependencies:** None (uses existing file I/O)

**Priority:** HIGH - Critical for all workflows, implement early after Spike 0.3

---

#### **Task 1.5: Index Writer**
**File:** `src/infrastructure/fileSystem/index_writer.ts`

Implement atomic index writing:

```typescript
export interface IndexWriter {
  writeGraphIndex(
    workspaceRoot: string,
    edges: Map<string, ReadonlyArray<Edge>>
  ): Promise<Result<void, WriteError>>;

  writeAliasIndex(
    workspaceRoot: string,
    aliases: Map<string, Alias>
  ): Promise<Result<void, WriteError>>;
}
```

**Process:**
1. Write to temporary directory (`.index/.tmp-graph/`, `.index/.tmp-aliases/`)
2. Verify writes succeeded
3. Delete existing index
4. Rename temporary to final location

**Deliverables:**
- `IndexWriter` implementation
- Atomic write with temp directory
- Cleanup on error
- Unit tests with filesystem operations

**Dependencies:** None (uses Deno file APIs)

---

#### **Task 1.6: Item Updater**
**File:** `src/infrastructure/fileSystem/item_updater.ts`

Implement batch Item updates for rank rebalancing:

```typescript
export interface ItemUpdater {
  updateRanks(
    workspaceRoot: string,
    updates: ReadonlyArray<ItemRankUpdate>
  ): AsyncIterableIterator<Result<UpdateResult, UpdateError>>;
}

export type UpdateResult = Readonly<{
  itemId: ItemId;
  updated: boolean;
}>;
```

**Features:**
- Atomic file updates (temp file + rename)
- Frontmatter-only updates (preserve body)
- Update `updated_at` timestamp
- Parallel updates where safe

**Deliverables:**
- `ItemUpdater` implementation
- Frontmatter update logic
- Atomic file writes
- Unit tests with file updates

**Dependencies:** Existing `frontmatter.ts` module

---

### **Phase 2: Presentation Layer (Sequential after Phase 1)**

CLI commands that implement the full processing flow directly.

#### **Task 2.1: CLI Command - check**
**File:** `src/presentation/cli/commands/doctor/check.ts`

Implement `mm doctor check` command with full processing flow:

```typescript
export const checkCommand = new Command()
  .name("check")
  .description("Inspect workspace integrity without modifications")
  .action(async () => {
    const workspaceRoot = await resolveWorkspace();

    // 1. Scan and parse all Items
    const items = new Map<ItemId, Item>();
    const itemIssues: ItemValidationResult[] = [];
    for await (const file of scanItemFiles(workspaceRoot)) {
      const result = parseItem(file.snapshot);
      if (result.type === "error") {
        itemIssues.push({ filePath: file.path, issues: result.error.issues });
      } else {
        items.set(result.value.data.id, result.value);
      }
    }

    // 2. Scan and parse all EdgeReferences and AliasEntries
    const edges = await scanAndParseEdges(workspaceRoot);
    const aliases = await scanAndParseAliases(workspaceRoot);

    // 3. Check index integrity
    const integrityIssues = checkIndexIntegrity(items, edges, aliases);

    // 4. Display report
    displayReport({ itemIssues, integrityIssues });

    // 5. Exit with appropriate code
    const hasIssues = itemIssues.length > 0 || integrityIssues.length > 0;
    Deno.exit(hasIssues ? 1 : 0);
  });
```

**Output format:**
- Structured report by category
- Color-coded (errors in red, warnings in yellow)
- Summary counts
- Exit code 0 if no issues, 1 if issues found

**Deliverables:**
- `check` command implementation
- Report formatting logic
- E2E tests with test workspaces

**Dependencies:**
- Task 1.3 (Index Doctor)
- Task 1.4 (Workspace Scanner)

---

#### **Task 2.2: CLI Command - rebuild-index**
**File:** `src/presentation/cli/commands/doctor/rebuild_index.ts`

Implement `mm doctor rebuild-index` command with full processing flow:

```typescript
export const rebuildIndexCommand = new Command()
  .name("rebuild-index")
  .description("Rebuild .index/ from Item frontmatter")
  .action(async () => {
    const workspaceRoot = await resolveWorkspace();

    // 1. Scan all Items
    const items = await scanAndParseAllItems(workspaceRoot);

    // 2. Rebuild index using IndexRebuilder
    const rebuildResult = rebuildFromItems(items);

    // 3. Write to temporary location
    await writeGraphIndex(workspaceRoot, rebuildResult.graphEdges, { temp: true });
    await writeAliasIndex(workspaceRoot, rebuildResult.aliases, { temp: true });

    // 4. Replace existing index
    await replaceIndex(workspaceRoot);

    // 5. Display results
    displayRebuildResult(rebuildResult);
  });
```

**Output format:**
- Progress indicator
- Summary (items scanned, edges created, etc.)
- Success/error message

**Deliverables:**
- `rebuild-index` command implementation
- Progress display
- E2E tests

**Dependencies:**
- Task 1.1 (Index Rebuilder)
- Task 1.4 (Workspace Scanner)
- Task 1.5 (Index Writer)

---

#### **Task 2.3: CLI Command - rebalance-rank**
**File:** `src/presentation/cli/commands/doctor/rebalance_rank.ts`

Implement `mm doctor rebalance-rank` command with full processing flow:

```typescript
export const rebalanceRankCommand = new Command()
  .name("rebalance-rank")
  .description("Rebalance LexoRank values for siblings")
  .action(async () => {
    const workspaceRoot = await resolveWorkspace();

    // 1. Scan all Items
    const items = await scanAndParseAllItems(workspaceRoot);

    // 2. Group by (parent, section)
    const groups = groupByPlacement(items);

    // 3. Rebalance each group
    const allUpdates: ItemRankUpdate[] = [];
    for (const group of groups) {
      const updates = rebalanceGroup(group.siblings);
      allUpdates.push(...updates);
    }

    // 4. Update Items and edge files
    await updateItemRanks(workspaceRoot, allUpdates);

    // 5. Display results and warn about Git changes
    displayRebalanceResult(allUpdates);
    console.log("Warning: Files have been modified. Review and commit changes.");
  });
```

**Output format:**
- Progress indicator
- Summary by group
- Warning about Git changes

**Deliverables:**
- `rebalance-rank` command implementation
- Progress display
- Git change warning
- E2E tests

**Dependencies:**
- Task 1.2 (Rank Rebalancer)
- Task 1.4 (Workspace Scanner)
- Task 1.6 (Item Updater)

---

#### **Task 2.4: CLI Command - doctor (parent)**
**File:** `src/presentation/cli/commands/doctor.ts`

Implement parent `mm doctor` command:

```typescript
export const doctorCommand = new Command()
  .name("doctor")
  .description("Workspace validation and maintenance")
  .command("check", checkCommand)
  .command("rebuild-index", rebuildIndexCommand)
  .command("rebalance-rank", rebalanceRankCommand);
```

**Deliverables:**
- Parent `doctor` command
- Subcommand registration
- Help text
- E2E tests for command discovery

**Dependencies:**
- Task 2.1 (check command)
- Task 2.2 (rebuild-index command)
- Task 2.3 (rebalance-rank command)

---

#### **Task 2.5: Main CLI Integration**
**File:** `src/main.ts`

Register `doctor` command in main CLI:

```typescript
await new Command()
  .name("mm")
  // ... existing commands
  .command("doctor", doctorCommand)
  .parse(Deno.args);
```

**Deliverables:**
- Integration in `main.ts`
- E2E tests for full command paths

**Dependencies:** Task 2.4 (doctor command)

---

### **Phase 3: Testing & Documentation (Parallel with Phase 2)**

#### **Task 3.1: Test Fixture Helpers**
**File:** `src/infrastructure/fileSystem/fixtures/helpers.ts`

Shared helper functions for generating test workspaces dynamically:

- `createTestWorkspace()` - Create minimal workspace in temp directory
- `createItemFile()` - Create item with valid frontmatter
- `createEdgeFile()` - Create date/parent edge file
- `createAliasFile()` - Create alias index file
- `createItemContent()` / `createDateEdgeContent()` / etc. - Content generators

**Usage:** Each test creates its own workspace in a temp directory using these helpers, then cleans up after execution. This keeps tests independent and avoids committing large fixture directories.

**Deliverables:**
- Shared helper functions for workspace generation
- Content generators for items, edges, aliases
- High-level helpers (createTestWorkspace, createItemFile, etc.)

**Dependencies:** None

---

#### **Task 3.2: E2E Test Scenarios**
**File:** `tests/e2e/scenarios/doctor_test.ts`

End-to-end tests for all commands:

```typescript
Deno.test("mm doctor check - detects frontmatter issues", async () => { ... });
Deno.test("mm doctor check - detects graph cycles", async () => { ... });
Deno.test("mm doctor rebuild-index - recreates index from frontmatter", async () => { ... });
Deno.test("mm doctor rebuild-index - preserves existing index on error", async () => { ... });
Deno.test("mm doctor rebalance-rank - redistributes ranks evenly", async () => { ... });
```

**Deliverables:**
- Comprehensive E2E test suite
- Coverage of success and error paths
- Performance benchmarks

**Dependencies:** Task 3.1 (fixture helpers)

---

#### **Task 3.3: Documentation Updates**
**Files:**
- `README.md`
- `docs/cli.md` (if exists)

Document `mm doctor` commands:

- Command syntax
- When to use each command
- Example outputs
- Troubleshooting guide

**Deliverables:**
- User-facing documentation
- Examples and use cases
- Screenshots/sample output

**Dependencies:** Tasks 2.1-2.3 (CLI commands)

---

## Task Dependencies Visualization (Revised)

```
Phase 0 (Spikes - Sequential):
  0.1 Placement Parsing Investigation
  0.2 Cycle Detection Prototype
  0.3 Workspace Scan Benchmark

Sequential (Common Foundation):
  3.1 Test Fixture Helpers (TDD foundation)
  1.4 Workspace Scanner (all commands depend on this)
  2.4 doctor command (parent command framework)
  2.5 Main CLI integration

Parallel A (check command):
  1.3 Index Doctor (checkIndexIntegrity)
  2.1 check command

Parallel B (rebuild-index command):
  1.1 Index Rebuilder
  1.5 Index Writer
  2.2 rebuild-index command

Parallel C (rebalance-rank command):
  1.2 Rank Rebalancer
  1.6 Item Updater
  2.3 rebalance-rank command

Finalization (after all parallel tasks):
  3.2 E2E Tests
  3.3 Documentation
```

**Design principle:**
- Parse individual models (Item, EdgeReference, AliasEntry) validates data within model boundaries ("Parse, don't validate")
- `checkIndexIntegrity` validates relationships between parsed models (integrity check)
- CLI commands implement full processing flow directly (no workflow layer)

**Parallel development:**
- After Sequential tasks complete, three agents can work independently on Parallel A/B/C
- Each parallel track is self-contained with its own infrastructure + CLI command

---

## Parallelization Strategy (Revised)

### **Phase 0: Risk Mitigation Spikes (Sequential)**
Execute spikes sequentially to validate technical approaches:
- Spike 0.1: Placement Parsing
- Spike 0.2: Cycle Detection
- Spike 0.3: Workspace Scanning

### **Sequential: Common Foundation**
Must be completed before parallel work begins:
1. Task 3.1 - Test Fixture Helpers (TDD foundation)
2. Task 1.4 - Workspace Scanner (all commands depend on this)
3. Task 2.4 - doctor command (parent command framework)
4. Task 2.5 - Main CLI integration

### **Parallel Tracks (3 agents can work independently)**

**Agent A - check command:**
1. Task 1.3 - Index Doctor (checkIndexIntegrity)
2. Task 2.1 - CLI Command - check

**Agent B - rebuild-index command:**
1. Task 1.1 - Index Rebuilder
2. Task 1.5 - Index Writer
3. Task 2.2 - CLI Command - rebuild-index

**Agent C - rebalance-rank command:**
1. Task 1.2 - Rank Rebalancer
2. Task 1.6 - Item Updater
3. Task 2.3 - CLI Command - rebalance-rank

### **Finalization (after all parallel tracks complete)**
- Task 3.2 - E2E Tests (comprehensive testing of all commands)
- Task 3.3 - Documentation (user-facing docs)

---

## Success Criteria

### **Phase 0 Complete:**
- [x] Placement parsing approach documented and validated
- [x] Cycle detection algorithm prototyped and benchmarked
- [x] Workspace scanning performance characteristics measured
- [x] Technical risks for high-uncertainty tasks mitigated

### **Sequential (Common Foundation) Complete:**
- [x] Test fixture helpers for dynamic workspace generation
- [x] Workspace scanner streams Items/Edges/Aliases
- [x] Parent doctor command registered
- [x] Main CLI integration working

### **Parallel A (check) Complete:**
- [ ] Index doctor with checkIndexIntegrity (including cycle detection)
- [ ] `mm doctor check` detects all issue categories

### **Parallel B (rebuild-index) Complete:**
- [ ] Index rebuilder functional
- [ ] Index writer performs atomic writes
- [ ] `mm doctor rebuild-index` rebuilds from frontmatter

### **Parallel C (rebalance-rank) Complete:**
- [ ] Rank rebalancer functional
- [ ] Item updater handles batch rank updates
- [ ] `mm doctor rebalance-rank` redistributes ranks

### **Finalization Complete:**
- [ ] E2E tests pass for all commands
- [ ] Documentation complete and accurate

### **Overall Success:**
- [ ] `deno task test` passes
- [ ] `deno lint` passes
- [ ] `deno fmt --check` passes
- [ ] All three `doctor` subcommands functional
- [ ] Integration tests demonstrate correct behavior

---

**End of plan.**
