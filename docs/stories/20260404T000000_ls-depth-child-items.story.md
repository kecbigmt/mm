## Story Log

### Goal
Extend `mm ls --depth` to recursively expand child items (item-to-item nesting), not just numbered sections.

### Why
Currently `--depth` only expands numbered sections (sub-directories like `1/`, `2/`). Items nested under other items via the `directory` field are always shown flat, with no way to see their children. Users working with hierarchical item structures (e.g. a project with sub-tasks) must manually `mm cd` into each child to see its contents.

### User Story
**As a mm user, I want `mm ls --depth N` to also expand child items recursively, so that I can see a tree view of my item hierarchy without extra navigation.**

### Acceptance Criteria

#### 1. Child Item Expansion
- [x] **Given** an item-head directory with child items (items whose directory head is the parent item), **When** you run `mm ls -d 1`, **Then** the child items appear indented under their parent
- [x] **Given** a parent with children and grandchildren, **When** you run `mm ls -d 2`, **Then** grandchildren appear indented under their respective children
- [x] **Given** a parent with children and grandchildren, **When** you run `mm ls -d 0`, **Then** only the direct partition items are shown (no children expanded)

#### 2. Correct Tree Ordering
- [x] **Given** a parent with two children (A and B) where only A has a grandchild, **When** you run `mm ls -d 2`, **Then** the output is ordered as: Child A, Grandchild of A, Child B (each item's descendants appear immediately after it, before the next sibling)

#### 3. Mixed Children and Sections
- [x] **Given** a parent item with both direct child items and numbered sections containing items, **When** you run `mm ls -d 1`, **Then** both the child items and the section contents are expanded
- [x] **Given** an item inside an expanded section that itself has child items, **When** you run `mm ls -d 2`, **Then** the section item's children are also expanded (section expansion and child expansion share the same depth counter)

#### 4. Filtering Consistency
- [x] **Given** child items include closed items, **When** you run `mm ls -d 1` (without `--all`), **Then** closed child items are hidden (consistent with main listing filter)
- [x] **Given** child items include items of various types, **When** you run `mm ls -d 1 -t task`, **Then** only tasks appear among the expanded children

#### 5. Backward Compatibility
- [x] **Given** cwd is a date directory, **When** you run `mm ls`, **Then** output is unchanged (no child item expansion for date ranges)
- [x] **Given** an item-head with only sections (no direct child items), **When** you run `mm ls`, **Then** behavior is identical to pre-change (sections expand as before)

### Verification Approach
- Unit tests in `expand_stubs_test.ts` for `expandItemChildren` function (depth 0/1/2, filtering, ordering, mixed children+sections)
- E2E tests in `scenario_15_item_head_listing_depth_test.ts` using `--dir` to create nested item hierarchies and verify `mm ls -p -d N` output
- Manual: create a 3-level hierarchy, run `mm ls -d 0`, `mm ls -d 1`, `mm ls -d 2`, `mm ls -d 10`

### Out of Scope
- Depth expansion for date range or numeric range listings
- Parallel queries for child items (sequential is acceptable for typical nesting depth)
- Visual tree connectors (e.g. `├──`, `└──`); indentation only

---

### Completed Work Summary
Implementation complete. `expandItemChildren` function added to `expand_stubs.ts` with full depth-recursive child item expansion. Interleaved rendering ensures each item's descendants appear immediately after it. Item-head events are filtered out for consistency with `buildPartitions`.

### Acceptance Checks

**Status: ACCEPTED (2026-04-04)**

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1.1 | Child expansion depth 1 | PASS | Children appear indented under parent |
| 1.2 | Grandchild expansion depth 2 | PASS | Grandchildren indented under children |
| 1.3 | No expansion depth 0 | PASS | Only direct partition items shown |
| 2.1 | Correct tree ordering | PASS | Interleaved: Child A → Grandchild → Child B |
| 3.1 | Mixed children + sections | PASS | Both expanded at depth 1 |
| 3.2 | Shared depth counter | PASS | Section item children expanded at depth 2 |
| 4.1 | Closed items filtered | PASS | Hidden without `--all` |
| 4.2 | Type filter on children | PASS | CLI `mm ls -p -d 1 -t task` shows only task-type children |
| 5.1 | Date dir backward compat | PASS | Output unchanged |
| 5.2 | Sections-only backward compat | PASS | Behavior identical to pre-change |

Self-verified via CLI (2026-04-04):
- Created 3-level hierarchy (Parent -> Child A/B -> Grandchild) and ran `mm ls -p -d 0/1/2`
- Verified mixed parent (direct child + section items) at d=1 and d=2
- Verified closed item filtering and type filtering with real workspace
- Verified date directory listing unchanged

Automated verification:
- Unit tests: 14 pass in `src/presentation/cli/partitioning/expand_stubs_test.ts`
- E2E tests: 9 pass in `tests/e2e/scenarios/scenario_15_item_head_listing_depth_test.ts`
- Full test suite: 344 steps pass (1 pre-existing zsh completions failure on NixOS, unrelated)

### Follow-ups / Open Risks

#### Addressed
- Tree ordering: Fixed interleaving so each item's descendants appear immediately after it
- Depth counter shared between child-item and section expansion
- Item-head event filtering: `expandItemChildren` and `expandStubs` now filter out events under item-heads, consistent with `buildPartitions`

#### Remaining
- Deep nesting (depth > 3) not tested in E2E (unit test coverage only)
- Consider adding visual tree connectors in a future story
