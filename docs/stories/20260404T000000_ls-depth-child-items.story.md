## Story Log

### Goal
Extend `mm ls --depth` to recursively expand child items (item-to-item nesting), not just numbered sections.

### Why
Currently `--depth` only expands numbered sections (sub-directories like `1/`, `2/`). Items nested under other items via the `directory` field are always shown flat, with no way to see their children. Users working with hierarchical item structures (e.g. a project with sub-tasks) must manually `mm cd` into each child to see its contents.

### User Story
**As a mm user, I want `mm ls --depth N` to also expand child items recursively, so that I can see a tree view of my item hierarchy without extra navigation.**

### Acceptance Criteria

#### 1. Child Item Expansion
- [ ] **Given** an item-head directory with child items (items whose directory head is the parent item), **When** you run `mm ls -d 1`, **Then** the child items appear indented under their parent
- [ ] **Given** a parent with children and grandchildren, **When** you run `mm ls -d 2`, **Then** grandchildren appear indented under their respective children
- [ ] **Given** a parent with children and grandchildren, **When** you run `mm ls -d 0`, **Then** only the direct partition items are shown (no children expanded)

#### 2. Correct Tree Ordering
- [ ] **Given** a parent with two children (A and B) where only A has a grandchild, **When** you run `mm ls -d 2`, **Then** the output is ordered as: Child A, Grandchild of A, Child B (each item's descendants appear immediately after it, before the next sibling)

#### 3. Mixed Children and Sections
- [ ] **Given** a parent item with both direct child items and numbered sections containing items, **When** you run `mm ls -d 1`, **Then** both the child items and the section contents are expanded
- [ ] **Given** an item inside an expanded section that itself has child items, **When** you run `mm ls -d 2`, **Then** the section item's children are also expanded (section expansion and child expansion share the same depth counter)

#### 4. Filtering Consistency
- [ ] **Given** child items include closed items, **When** you run `mm ls -d 1` (without `--all`), **Then** closed child items are hidden (consistent with main listing filter)
- [ ] **Given** child items include items of various types, **When** you run `mm ls -d 1 -t task`, **Then** only tasks appear among the expanded children

#### 5. Backward Compatibility
- [ ] **Given** cwd is a date directory, **When** you run `mm ls`, **Then** output is unchanged (no child item expansion for date ranges)
- [ ] **Given** an item-head with only sections (no direct child items), **When** you run `mm ls`, **Then** behavior is identical to pre-change (sections expand as before)

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
Not yet started.

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- Unit tests: 14 tests in `expand_stubs_test.ts` (8 new for expandItemChildren)
- E2E tests: 9 tests in `scenario_15_item_head_listing_depth_test.ts` (4 new for child item expansion)
- Lint and format checks pass
- Full test suite passes (excluding pre-existing completions_test failures on NixOS)

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- Tree ordering: Fixed interleaving so each item's descendants appear immediately after it
- Depth counter shared between child-item and section expansion
- Item-head event filtering: `expandItemChildren` and `expandStubs` now filter out events under item-heads, consistent with `buildPartitions`

#### Remaining
- Deep nesting (depth > 3) not tested in E2E (unit test coverage only)
- Consider adding visual tree connectors in a future story
