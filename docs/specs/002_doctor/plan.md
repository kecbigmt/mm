# **mm doctor: Implementation Plan**

**Version:** 1.0
**Status:** Planning
**Target:** Initial implementation of `mm doctor` subcommands

---

## Overview

This plan breaks down the implementation of `mm doctor` into independent, parallelizable tasks organized by architectural layer. Each task is designed to be implementable without blocking dependencies where possible.

---

## Risk Assessment & Mitigation

### High-Risk Tasks (High Uncertainty)

The following tasks have significant technical uncertainty and should be de-risked early:

1. **Task 1.3: Graph Validator (Cycle Detection)** - Complex algorithm, performance unknown at scale
2. **Task 1.4: Index Rebuilder (Placement Parsing)** - Parsing logic unclear from existing codebase
3. **Task 2.1: Workspace Scanner (Streaming)** - Performance characteristics unknown for large workspaces
4. **Task 3.1: Check Workflow (Integration Complexity)** - Aggregating all validation results

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
- Document findings for Task 1.4

**Deliverable:** Small prototype + documentation of parsing approach

**Reduces risk for:** Task 1.4 (Index Rebuilder)

---

#### **Spike 0.2: Cycle Detection Prototype**

Prototype cycle detection algorithm:

- Implement DFS-based cycle detection
- Test with small graph fixtures (valid graphs, simple cycles, complex cycles)
- Benchmark with larger graphs (100s, 1000s of nodes)
- Identify memory/performance characteristics

**Deliverable:** Prototype implementation + benchmark results

**Reduces risk for:** Task 1.3 (Graph Validator)

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

**Reduces risk for:** Task 2.1 (Workspace Scanner)

---

### **Phase 1: Domain Layer (Adjusted Order)**

Core domain logic. High-risk tasks prioritized early after spikes.

#### **Task 1.1: Validation Error Types**
**File:** `src/domain/validation/validation_error.ts`

Define error types for `mm doctor check`:

```typescript
export type FrontmatterValidationIssue =
  | MissingRequiredField
  | InvalidFieldValue
  | InvalidPlacementFormat
  | InvalidRankFormat
  | InvalidAliasFormat
  | YamlParseError
  | ...

export type GraphValidationIssue =
  | EdgeTargetNotFound
  | DuplicateEdge
  | CycleDetected
  | EdgeFrontmatterMismatch
  | ...

export type IndexValidationIssue =
  | OrphanedEdgeFile
  | MissingEdgeFile
  | AliasIndexMismatch
  | ...

export type ValidationReport = Readonly<{
  frontmatterIssues: ReadonlyArray<FrontmatterValidationIssue>;
  graphIssues: ReadonlyArray<GraphValidationIssue>;
  indexIssues: ReadonlyArray<IndexValidationIssue>;
  itemsScanned: number;
  edgesScanned: number;
  aliasesScanned: number;
}>;
```

**Deliverables:**
- Type definitions for all validation issue types
- `ValidationReport` aggregate type
- Helper functions for creating validation issues
- Unit tests for type guards and helpers

**Dependencies:** None (pure types)

---

#### **Task 1.2: Item Validator Service**
**File:** `src/domain/services/item_validator.ts`

Implement validation logic for individual Items:

```typescript
export interface ItemValidator {
  validateFrontmatter(item: Item): ReadonlyArray<FrontmatterValidationIssue>;
  validatePlacement(placement: Placement): ReadonlyArray<FrontmatterValidationIssue>;
  validateRank(rank: ItemRank): ReadonlyArray<FrontmatterValidationIssue>;
  validateAlias(alias?: AliasSlug): ReadonlyArray<FrontmatterValidationIssue>;
}
```

**Validation rules:**
- Required fields present (`id`, `kind`, `status`, `placement`, `rank`, `created_at`, `updated_at`, `schema`)
- `id` matches filename and is valid UUID v7
- `kind` is valid enum value
- `status` is valid enum value
- `placement` is normalized (no relative dates, no aliases)
- `rank` is valid LexoRank format
- Timestamps are valid ISO-8601
- `schema` is present
- `alias` (if present) follows rules and is not reserved

**Deliverables:**
- `ItemValidator` implementation
- Unit tests covering all validation rules
- Edge cases (missing fields, malformed values, etc.)

**Dependencies:** Task 1.1 (validation error types)

---

#### **Task 1.3: Graph Validator Service**
**File:** `src/domain/services/graph_validator.ts`

Implement graph-level validation:

```typescript
export interface GraphValidator {
  validateEdges(edges: ReadonlyArray<Edge>, items: Map<ItemId, Item>): ReadonlyArray<GraphValidationIssue>;
  detectCycles(edges: ReadonlyArray<Edge>): ReadonlyArray<GraphValidationIssue>;
  validateAliasUniqueness(items: ReadonlyArray<Item>): ReadonlyArray<GraphValidationIssue>;
}
```

**Validation rules:**
- Every edge points to existing Item
- No duplicate edges within same (parent, section)
- No cycles in parent/child graph
- Alias `canonical_key` uniqueness
- Edge files match Frontmatter placement/rank

**Deliverables:**
- `GraphValidator` implementation
- Cycle detection algorithm (DFS-based)
- Unit tests with graph fixtures (valid graphs, cycles, duplicates)

**Dependencies:** Task 1.1 (validation error types)

**Priority:** HIGH - Complex algorithm, implement early after Spike 0.2

---

#### **Task 1.4: Index Rebuilder Service**
**File:** `src/domain/services/index_rebuilder.ts`

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

#### **Task 1.5: Rank Rebalancer Service**
**File:** `src/domain/services/rank_rebalancer.ts`

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

### **Phase 2: Infrastructure Layer (Parallel after Phase 1)**

These tasks implement filesystem operations and can be developed in parallel.

#### **Task 2.1: Workspace Scanner**
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

#### **Task 2.2: Index Writer**
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

#### **Task 2.3: Item Updater**
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

### **Phase 3: Workflow Layer (Sequential after Phase 2)**

These workflows orchestrate domain services and infrastructure.

#### **Task 3.1: Check Workflow**
**File:** `src/domain/workflows/doctor_check.ts`

Implement `mm doctor check` workflow:

```typescript
export const DoctorCheckWorkflow = {
  execute: async (
    deps: DoctorCheckDependencies
  ): Promise<Result<ValidationReport, DoctorCheckError>>
};
```

**Process:**
1. Scan all Items (stream)
2. Validate each Item's frontmatter
3. Collect all Items for graph validation
4. Scan all edges
5. Validate graph (cycles, duplicates, edge-item consistency)
6. Validate index consistency
7. Build ValidationReport

**Deliverables:**
- `DoctorCheckWorkflow` implementation
- Error aggregation logic
- Integration tests with fixture workspaces
- Performance tests (large workspaces)

**Dependencies:**
- Task 1.2 (ItemValidator)
- Task 1.3 (GraphValidator)
- Task 2.1 (WorkspaceScanner)

---

#### **Task 3.2: Rebuild Index Workflow**
**File:** `src/domain/workflows/doctor_rebuild_index.ts`

Implement `mm doctor rebuild-index` workflow:

```typescript
export const DoctorRebuildIndexWorkflow = {
  execute: async (
    deps: DoctorRebuildIndexDependencies
  ): Promise<Result<RebuildIndexResult, RebuildIndexError>>
};
```

**Process:**
1. Scan all Items
2. Rebuild index using `IndexRebuilder`
3. Basic validation of rebuilt index
4. Write to temporary location using `IndexWriter`
5. Verify integrity
6. Replace existing index

**Deliverables:**
- `DoctorRebuildIndexWorkflow` implementation
- Progress reporting
- Integration tests
- Rollback on error tests

**Dependencies:**
- Task 1.4 (IndexRebuilder)
- Task 2.1 (WorkspaceScanner)
- Task 2.2 (IndexWriter)

---

#### **Task 3.3: Rebalance Rank Workflow**
**File:** `src/domain/workflows/doctor_rebalance_rank.ts`

Implement `mm doctor rebalance-rank` workflow:

```typescript
export const DoctorRebalanceRankWorkflow = {
  execute: async (
    deps: DoctorRebalanceRankDependencies
  ): Promise<Result<RebalanceRankResult, RebalanceRankError>>
};
```

**Process:**
1. Scan all Items
2. Group by (parent, section)
3. For each group, call `RankRebalancer`
4. Collect all rank updates
5. Update Items using `ItemUpdater`
6. Update edge files
7. Report results

**Deliverables:**
- `DoctorRebalanceRankWorkflow` implementation
- Group-by-placement logic
- Progress reporting
- Integration tests

**Dependencies:**
- Task 1.5 (RankRebalancer)
- Task 2.1 (WorkspaceScanner)
- Task 2.3 (ItemUpdater)

---

### **Phase 4: Presentation Layer (Sequential after Phase 3)**

CLI commands that expose workflows to users.

#### **Task 4.1: CLI Command - check**
**File:** `src/presentation/cli/commands/doctor/check.ts`

Implement `mm doctor check` command:

```typescript
export const checkCommand = new Command()
  .name("check")
  .description("Inspect workspace integrity without modifications")
  .action(async () => {
    // Call DoctorCheckWorkflow
    // Format and display ValidationReport
    // Exit with appropriate code
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

**Dependencies:** Task 3.1 (DoctorCheckWorkflow)

---

#### **Task 4.2: CLI Command - rebuild-index**
**File:** `src/presentation/cli/commands/doctor/rebuild_index.ts`

Implement `mm doctor rebuild-index` command:

```typescript
export const rebuildIndexCommand = new Command()
  .name("rebuild-index")
  .description("Rebuild .index/ from Item frontmatter")
  .action(async () => {
    // Call DoctorRebuildIndexWorkflow
    // Display progress
    // Report results
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

**Dependencies:** Task 3.2 (DoctorRebuildIndexWorkflow)

---

#### **Task 4.3: CLI Command - rebalance-rank**
**File:** `src/presentation/cli/commands/doctor/rebalance_rank.ts`

Implement `mm doctor rebalance-rank` command:

```typescript
export const rebalanceRankCommand = new Command()
  .name("rebalance-rank")
  .description("Rebalance LexoRank values for siblings")
  .action(async () => {
    // Call DoctorRebalanceRankWorkflow
    // Display progress
    // Report results
    // Warn user to commit changes
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

**Dependencies:** Task 3.3 (DoctorRebalanceRankWorkflow)

---

#### **Task 4.4: CLI Command - doctor (parent)**
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
- Task 4.1 (check command)
- Task 4.2 (rebuild-index command)
- Task 4.3 (rebalance-rank command)

---

#### **Task 4.5: Main CLI Integration**
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

**Dependencies:** Task 4.4 (doctor command)

---

### **Phase 5: Testing & Documentation (Parallel with Phases 3-4)**

#### **Task 5.1: Integration Test Fixtures**
**Directory:** `tests/e2e/fixtures/doctor/`

Create test workspaces with known issues:

- `valid-workspace/` - Clean workspace (check should pass)
- `invalid-frontmatter/` - Missing fields, malformed placement
- `graph-cycles/` - Parent-child cycles
- `index-desync/` - Frontmatter and index out of sync
- `dense-ranks/` - High-density ranks requiring rebalance

**Deliverables:**
- Test fixture workspaces
- README documenting each fixture
- Fixture generation scripts if needed

**Dependencies:** None

---

#### **Task 5.2: E2E Test Scenarios**
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

**Dependencies:** Task 5.1 (fixtures)

---

#### **Task 5.3: Documentation Updates**
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

**Dependencies:** Tasks 4.1-4.3 (CLI commands)

---

## Task Dependencies Visualization (Revised)

```
Phase 0 (Spikes - Sequential):
  0.1 Placement Parsing Investigation
  0.2 Cycle Detection Prototype
  0.3 Workspace Scan Benchmark

Phase 1 (Domain - Prioritized):
  1.1 Validation Error Types
    ├─> 1.2 Item Validator
    └─> 1.3 Graph Validator (HIGH PRIORITY, after Spike 0.2)

  1.4 Index Rebuilder (HIGH PRIORITY, after Spike 0.1)
  1.5 Rank Rebalancer (independent)

Phase 2 (Infrastructure - Prioritized):
  2.1 Workspace Scanner (HIGH PRIORITY, after Spike 0.3)
  2.2 Index Writer (independent)
  2.3 Item Updater (independent)

Phase 3 (Workflows - Sequential):
  3.1 Check Workflow ← 1.2, 1.3, 2.1
  3.2 Rebuild Index Workflow ← 1.4, 2.1, 2.2
  3.3 Rebalance Rank Workflow ← 1.5, 2.1, 2.3

Phase 4 (Presentation - Sequential):
  4.1 check command ← 3.1
  4.2 rebuild-index command ← 3.2
  4.3 rebalance-rank command ← 3.3
  4.4 doctor command ← 4.1, 4.2, 4.3
  4.5 Main integration ← 4.4

Phase 5 (Testing - Parallel with 3-4):
  5.1 Fixtures (can start in Phase 0)
  5.2 E2E Tests ← 5.1, all Phase 4
  5.3 Documentation ← 4.1, 4.2, 4.3
```

---

## Parallelization Strategy (Revised)

### **Iteration 0: Risk Mitigation (Sequential)**
Execute spikes sequentially to validate technical approaches:
- Spike 0.1: Placement Parsing
- Spike 0.2: Cycle Detection
- Spike 0.3: Workspace Scanning

### **Iteration 1: High-Risk Domain Tasks (Parallel after spikes)**
Prioritize high-risk tasks early:
- Task 1.1 (Developer A) - Foundation for others
- Task 1.3 (Developer B) - After Spike 0.2, high complexity
- Task 1.4 (Developer C) - After Spike 0.1, high complexity
- Task 1.2 + 1.5 (Developer D) - Lower risk, can start in parallel

### **Iteration 2: Infrastructure (Parallel)**
Can be developed simultaneously:
- Task 2.1 (Developer A) - After Spike 0.3, high priority
- Task 2.2 (Developer B) - Standard file I/O
- Task 2.3 (Developer C) - Standard file I/O

### **Iteration 3: Workflows (Semi-parallel)**
Can start when dependencies are ready:
- Task 3.1 (when 1.2, 1.3, 2.1 ready)
- Task 3.2 (when 1.4, 2.1, 2.2 ready)
- Task 3.3 (when 1.5, 2.1, 2.3 ready)

### **Iteration 4: Presentation (Semi-parallel)**
Can start when workflows are ready:
- Tasks 4.1, 4.2, 4.3 in parallel
- Task 4.4 when 4.1-4.3 ready
- Task 4.5 final integration

### **Ongoing: Testing & Docs**
- Task 5.1 can start immediately (or during Phase 0)
- Task 5.2 as commands become available
- Task 5.3 near completion

---

## Success Criteria

### **Phase 0 Complete:**
- [ ] Placement parsing approach documented and validated
- [ ] Cycle detection algorithm prototyped and benchmarked
- [ ] Workspace scanning performance characteristics measured
- [ ] Technical risks for high-uncertainty tasks mitigated

### **Phase 1 Complete:**
- [ ] All validation error types defined
- [ ] Item validator with comprehensive tests
- [ ] Graph validator with cycle detection
- [ ] Index rebuilder functional
- [ ] Rank rebalancer functional

### **Phase 2 Complete:**
- [ ] Workspace scanner streams Items/Edges/Aliases
- [ ] Index writer performs atomic writes
- [ ] Item updater handles batch rank updates

### **Phase 3 Complete:**
- [ ] `mm doctor check` detects all issue categories
- [ ] `mm doctor rebuild-index` rebuilds from frontmatter
- [ ] `mm doctor rebalance-rank` redistributes ranks

### **Phase 4 Complete:**
- [ ] All CLI commands registered and functional
- [ ] Help text and error messages clear
- [ ] Integration in main CLI

### **Phase 5 Complete:**
- [ ] E2E tests pass for all commands
- [ ] Test fixtures cover all scenarios
- [ ] Documentation complete and accurate

### **Overall Success:**
- [ ] `deno task test` passes
- [ ] `deno lint` passes
- [ ] `deno fmt --check` passes
- [ ] All three `doctor` subcommands functional
- [ ] Integration tests demonstrate correct behavior

---

**End of plan.**
