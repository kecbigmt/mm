## Story Log

### Goal
Improve `mm ls` output for item-head placements: suppress `/0` header and inline section contents.

### Why
When cwd is an item head (e.g. `mm cd modeless-design`), `mm ls` currently shows:
- A partition header like `[modeless-design/0]` even though no section `/0` was explicitly created
- Section stubs like `📁 386/ (items: 1, sections: 0)` without showing the items inside them

This forces the user to manually `mm ls 386/` for each section to see its contents, making the overview less useful.

### User Story
**As a mm user, I want `mm ls` under an item head to omit the `/0` header and show items inside sections up to a configurable depth, so that I get a useful overview without extra navigation.**

### Acceptance Criteria

#### 1. Suppress `/0` header for item-head single placement
- [x] **Given** cwd is an item head (e.g. `permanent/modeless-design`), **When** you run `mm ls`, **Then** the partition header shows `[modeless-design]` (no `/0` suffix)
- [x] **Given** cwd is an item head with sections, **When** you run `mm ls` in print mode (`-p`), **Then** the header also omits `/0`

#### 2. Inline section contents (depth expansion)
- [x] **Given** cwd is an item head with sections containing items, **When** you run `mm ls`, **Then** items inside each section are displayed under a section header (e.g. `📁 386/` followed by its items indented)
- [x] **Given** cwd is an item head with nested sections (sections inside sections), **When** you run `mm ls`, **Then** only 1 level of section contents is expanded by default (deeper sections shown as stubs)
- [x] **Given** cwd is an item head with sections, **When** you run `mm ls -d 2` (or `--depth 2`), **Then** 2 levels of section contents are expanded
- [x] **Given** cwd is an item head with sections, **When** you run `mm ls -d 0`, **Then** no section contents are expanded (current behavior: stubs only)

#### 3. Backward compatibility
- [x] **Given** cwd is a date directory, **When** you run `mm ls`, **Then** output is unchanged (no depth expansion for date ranges)
- [x] **Given** a numeric range expression (e.g. `mm ls book/1..3`), **When** you run `mm ls`, **Then** output is unchanged

#### 4. Error Cases
- [x] **Given** a negative depth value, **When** you run `mm ls -d -1`, **Then** an error message is shown

### Verification Approach
CLI commands: run `mm ls` with cwd set to an item head and verify output format. Use `mm ls -p` for machine-readable verification. Unit tests for partition building and formatting.

### Out of Scope
- Depth expansion for date range listings
- Depth expansion for numeric range listings
- Changing the section stub format itself
- Recursive unlimited depth (cap at reasonable max)

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- Suppress /0 header: Fixed `getDisplayLabel` callback in `list.ts` to return just the head identifier when `sectionPrefix === 0`
- Depth expansion: Added `-d`/`--depth` CLI option with default depth=1 for item-head single placements, 0 for date/numeric ranges
- Section expansion: Stubs are expanded into section header + items when depth > 0; deeper sub-sections shown as stubs at depth boundary
- Added `placement` field to `SectionStub` type to enable async section item queries
- Added `formatSectionHeader` formatter for expanded section headers (without counts)
- Negative depth validation with error message

**Decisions:**
- Default depth=1 only for item-head single placements (not date ranges or numeric ranges)
- Expansion logic lives in `list.ts` (presentation layer) since it requires async IO
- Format output changed from `profileSync` to `profileAsync` to support async expansion
- `SectionStub` type extended with `placement` to avoid reconstructing placements from relative paths

**Tests:**
- `build_partitions_test.ts`: 22 tests (1 new: getDisplayLabel omits /0)
- `list_formatter_test.ts`: 77 tests (2 new: formatSectionHeader colored/print)
- `scenario_15_item_head_listing_depth_test.ts`: 5 E2E tests (all new)
- Status: All passing

**Technical debt:**
- ~~`expandStubs` function in `list.ts` is fairly large; could be extracted~~ (resolved in refactor)
- ~~Status filtering in expansion duplicates main listing logic~~ (resolved in refactor)

**Next:** ~~Refactor~~ Done

### Refactoring

**Status: Complete - Ready for Verify**

**Applied:**
- [Extract `expandStubs` to dedicated module]: Moved recursive expansion logic from `list.ts` to `expand_stubs.ts`. Reduces `list.ts` command handler size and enables independent unit testing. (Single responsibility, loose coupling)
- [Eliminate status filter duplication]: Status filter is now built once as a `StatusFilterFn` and injected into `expandStubs`, removing the duplicated inline filter logic. (Single responsibility, DRY)
- [Explicit dependency injection for `expandStubs`]: IO dependencies (`itemRepository`, `sectionQueryService`) and formatting callbacks (`FormatItemsFn`, `StatusFilterFn`) are passed as explicit parameters rather than captured from closure scope. (Loose coupling, testability)
- [Extract shared helpers]: `toRelativeStub` and `isNonEmpty` extracted as named functions in the new module, replacing duplicated inline logic. (High cohesion, DRY)
- [Extract prefix-length resolver to `alias_prefix_resolver.ts`]: Moved lazy prefix-length computation and caching logic out of `list.ts` into a dedicated module with its own type (`AliasPrefixData`) and factory (`createPrefixLengthResolver`). The command handler now loads alias data and delegates computation via the factory, removing inline caching logic and the intermediate data-bag object. (Single responsibility, loose coupling, testability)

**Design:**
- `expand_stubs.ts` owns one responsibility: recursive section expansion with IO
- `alias_prefix_resolver.ts` owns one responsibility: lazy prefix-length computation with caching
- Dependencies injected via `ExpandStubsDeps` type and callback parameters
- `list.ts` remains the orchestrator; builds the `FormatItemsFn` closure capturing alias/prefix context

**Quality:**
- Tests passing: 647 passed, 0 failed
- 5 unit tests for `expand_stubs.ts` covering depth 0/1/2, status filtering, boundary stubs
- 4 unit tests for `alias_prefix_resolver.ts` covering empty data, priority set, fallback, caching
- Linting clean, formatting clean

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance Criteria Verification (2026-02-16)**

All acceptance criteria verified via automated tests and code review:

#### 1. Suppress /0 header for item-head single placement
- **PASS**: E2E test `scenario_15_item_head_listing_depth_test.ts` - "omits /0 suffix from item-head header (print mode)" verifies header does not contain "/0"
- **PASS**: Unit test `build_partitions_test.ts` - "single item-head placement with getDisplayLabel omits /0" verifies display label logic
- Evidence: Tests verify both print and colored modes produce headers without /0 suffix

#### 2. Inline section contents (depth expansion)
- **PASS**: E2E test verifies items inside sections are displayed by default (depth=1)
- **PASS**: E2E test verifies only 1 level expanded by default (deeper sections shown as stubs)
- **PASS**: E2E test verifies --depth 2 expands 2 levels
- **PASS**: E2E test verifies --depth 0 shows stubs only (no expansion)
- **PASS**: Unit test `expand_stubs_test.ts` covers depth 0/1/2 expansion logic
- Evidence: Tests verify section header followed by indented items for expanded sections

#### 3. Backward compatibility
- **PASS**: E2E test verifies date range listing unchanged (no depth expansion)
- **PASS**: Build partitions logic only applies depth expansion to item-head single placements
- Evidence: Date range and numeric range listings maintain original behavior

#### 4. Error Cases
- **PASS**: E2E test verifies negative depth (-1) shows error message "depth must be a non-negative integer"
- **PASS**: CLI validation in `list.ts` line 107 checks depth >= 0
- Evidence: Error message displayed before any processing occurs

**Refactoring Verification:**
- **PASS**: Alias prefix resolver extraction verified via unit tests and code review
- **PASS**: `createPrefixLengthResolver` correctly computes prefix lengths for priority set and all aliases
- **PASS**: Lazy computation and caching working correctly (4 unit tests in `alias_prefix_resolver_test.ts`)
- **PASS**: `getPrefixLength` resolver used consistently in `formatItems` for both main listing and expanded section items
- Evidence: Line 491 in list.ts calls `getPrefixLength(alias)` for each item, and `formatItems` closure is passed to `expandStubs` (line 545), ensuring expanded section items get the same prefix highlighting as main items

**Tests:** All passing
- Unit tests: 647 passed, 0 failed (includes 4 new tests for alias_prefix_resolver)
- E2E tests: 32 passed (301 steps), 1 failed (2 steps - pre-existing completions_test failure)
- Only known failure: pre-existing completions_test (bash/zsh not available in NixOS environment)

**Quality Checks:**
- Linting: Clean (261 files checked)
- Formatting: Clean (263 files checked)
- Debug code: None found (all console.log/error are legitimate user output)
- TODOs: None found

**Next:** Code Review

### Refactoring (post-perf-fix)

**Status: Complete - Ready for Verify**
**Applied:** [Simplify `createPrefixLengthResolver` API]: After the perf fix removed the two-tier priority-set/all-aliases I/O, the caller always passed identical data for both tiers. Removed the `AliasPrefixData` type and its three fields; the factory now accepts a single `readonly string[]`. (Simplify, single responsibility, loose coupling)
**Design:** Eliminated dead two-tier branching logic and the `prioritySetLookup` set. Caller in `list.ts` reduced from 14 lines to 5 lines. Test count reduced from 4 to 3 (removed the two-tier fallback test which tested now-removed behavior).
**Quality:** Tests passing (3), Linting clean (262 files), Formatting clean
**Next:** Verify

### Verification (post-perf-fix and refactor)

**Status: Verified - Ready for Code Review**

**Date:** 2026-02-16

**Acceptance Criteria:**

1. **Performance restored**:
   - **PASS**: CI benchmark shows 90.9ms (target: ~90ms, was 173ms before fix)
   - Evidence: `deno bench` output shows average time of 90.9ms for 500-item workspace with single date query (10 matches)

2. **All tests pass**:
   - **PASS**: `deno task test` completed with 954 passing tests
   - Known failures: 3 shell completion tests (zsh/bash not available in NixOS environment - expected)
   - Evidence: Test output shows all domain, workflow, presentation, and E2E tests passing

3. **Clean lint/fmt**:
   - **PASS**: `deno lint` - 262 files checked, no issues
   - **PASS**: `deno fmt --check` - 264 files checked, no issues
   - Evidence: Both commands completed without errors or warnings

4. **Prefix highlighting still works**:
   - **PASS**: Code review confirms correct implementation
   - Evidence:
     - `list.ts` lines 382-386: Creates `sortedAliases` from displayed items only (no I/O)
     - `alias_prefix_resolver.ts`: Simplified to single-parameter API accepting sorted alias array
     - `alias_prefix_resolver_test.ts`: All 3 tests passing, covering empty data, prefix computation, and caching
     - `getPrefixLength` resolver passed to `formatItems` which is used for both main listing and expanded sections

**Implementation Quality:**
- No debug code: Only legitimate console.log/error for user output in tests
- No uncontextualized TODOs: Clean codebase
- Simplified API: Refactored from 3-field `AliasPrefixData` to single `readonly string[]` parameter

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- Depth expansion implemented with per-section async queries (acceptable perf for typical section counts)
- Performance regression fixed: O(n) I/O removed from prefix computation
- Prefix resolver API simplified after removing dead two-tier logic

#### Remaining
- Depth > 1 not yet tested with deeply nested sections in E2E (unit test coverage only)
- Consider whether depth option should also apply to numeric range listings in the future
- `expandStubs` could benefit from parallel queries for multiple sections
