## Story Log

### Goal
Eliminate performance regression by optimizing timezone date formatting and skipping unnecessary cwd resolution for absolute path queries.

### Why
PR #95 and #96 introduced a +17% performance regression in the `ls` command benchmark. Two root causes:

1. **DateTimeFormat overhead**: `computeTodayInTimezone()` was implemented separately in `cwd_resolution_service.ts` and `list.ts`, creating a new `Intl.DateTimeFormat` instance on every call. Meanwhile, `item_repository.ts` already has an optimized implementation with caching and UTC fast path.

2. **Unnecessary cwd resolution**: When an absolute path like `2025-01-01` is specified, cwd is not needed for path resolution, but the current implementation still reads the session file and resolves cwd.

### User Story
**As a CLI user, I want commands to execute quickly, so that my workflow is not interrupted by unnecessary delays.**

### Acceptance Criteria

#### 1. Shared Timezone Formatting Module
- [x] **Given** a new shared module exists at `src/shared/timezone_format.ts`, **When** you inspect the module, **Then** it exports `formatDateStringForTimezone(date: Date, timezone: TimezoneIdentifier): string` that returns `YYYY-MM-DD` format
- [x] **Given** the shared module, **When** you call `formatDateStringForTimezone` with the same timezone multiple times, **Then** it reuses cached `Intl.DateTimeFormat` instances (no repeated initialization)
- [x] **Given** the shared module, **When** you call `formatDateStringForTimezone` with a UTC-equivalent timezone (UTC, GMT, Etc/UTC, etc.), **Then** it uses the fast path without `Intl.DateTimeFormat`

#### 2. Code Deduplication
- [x] **Given** `cwd_resolution_service.ts`, **When** you inspect the file, **Then** it uses the shared module instead of its own `computeTodayInTimezone` implementation
- [x] **Given** `list.ts`, **When** you inspect the file, **Then** it uses the shared module instead of its own `computeTodayInTimezone` implementation
- [x] **Given** `item_repository.ts`, **When** you inspect the file, **Then** it uses the shared module for `formatSegmentsForTimezone`

#### 3. Skip cwd Resolution for Absolute Paths
- [x] **Given** locator is an absolute date like `2025-01-01`, **When** you run `mm ls 2025-01-01`, **Then** the session file is NOT read (cwd resolution is skipped)
- [x] **Given** locator is a relative path like `.` or `..`, **When** you run `mm ls .`, **Then** cwd is resolved as before (session file is read)
- [x] **Given** locator is an alias like `myproject`, **When** you run `mm ls myproject`, **Then** cwd resolution is skipped (alias resolves to absolute placement)

#### 4. Performance Improvement
- [ ] **Given** a workspace with 500 items, **When** you run `mm ls 2025-01-01`, **Then** the execution time is within 5% of the pre-PR #95 baseline (~86ms)

#### 5. Functional Correctness
- [x] **Given** a workspace with timezone `Asia/Tokyo`, **When** you run `mm pwd` without MM_CWD set at 2026-01-22 08:00 JST (= 2026-01-21 23:00 UTC), **Then** it shows `/2026-01-22` (workspace timezone is respected)
- [x] **Given** all existing unit tests, **When** you run `deno task test`, **Then** all tests pass

### Verification Approach
- Unit tests for the shared module
- Existing E2E tests for functional correctness
- CI benchmark comparison for performance (target: regression < 5%)

### Out of Scope
- Changing the design decision to use workspace timezone (already decided)
- Adding new CLI options or commands
- Modifying the session file storage mechanism

---

### Implementation (Red-Green)

**Status: Complete - Ready for Verify**

**Implemented:**
- **Shared Timezone Module** (`src/shared/timezone_format.ts`): Extracted `formatDateStringForTimezone` and `formatSegmentsForTimezone` with DateTimeFormat caching and UTC fast path
- **Code Deduplication**: Updated `item_repository.ts`, `cwd_resolution_service.ts`, and `list.ts` to use the shared module
- **Skip cwd for Absolute Paths**: Added `rangeExpressionRequiresCwd()` helper in `list.ts` to check if locator requires cwd resolution; absolute paths (dates, aliases, UUIDs, permanent) skip session file read

**Decisions:**
- Kept workspace timezone as the source of truth for "today" (per user request)
- Cwd resolution is only skipped when locator is specified AND it doesn't start with `.`, `..`, or numeric segment

**Tests:**
- `src/shared/timezone_format_test.ts`: 6 test cases (all passing)
- Existing unit tests: All passing (560+)
- Existing E2E tests: All passing (30 scenarios)
- 2 shell completion tests fail due to missing zsh/bash in environment (unrelated to this change)

**Refactoring Applied:**
- **[Single Responsibility]** Extracted `createTodayPlacement()` helper in `list.ts` to eliminate duplication - this function was needed in two places (absolute path fallback and no-locator branch)
- **[Simplification]** Optimized `todayStr` computation in no-locator branch to reuse cwd's date when available (avoids redundant timezone formatting call)
- **Design:** Reduced duplication while maintaining loose coupling; `createTodayPlacement` is a pure local helper with clear intent
- **Quality:** All tests passing (560+ unit, 30 E2E scenarios); Linting clean

**Next:** Verify

### Verification

**Status: Verified - Pending Performance Benchmark**

**Date:** 2026-01-21

**Acceptance Criteria Results:**

#### 1. Shared Timezone Formatting Module ✅ PASS
- **Evidence:** Module exists at `src/shared/timezone_format.ts` with:
  - `formatDateStringForTimezone(date: Date, timezone: TimezoneIdentifier): string` - returns YYYY-MM-DD format
  - `formatSegmentsForTimezone(date: Date, timezone: TimezoneIdentifier): [string, string, string]` - returns tuple
  - `dateFormatCache` Map for caching `Intl.DateTimeFormat` instances per timezone
  - `UTC_EQUIVALENT_TIMEZONES` Set containing UTC, GMT, Etc/UTC, etc.
  - Fast path using `formatUtcSegments()` for UTC-equivalent timezones (bypasses Intl.DateTimeFormat)
- **Test Coverage:** 6 test cases in `timezone_format_test.ts` all passing

#### 2. Code Deduplication ✅ PASS
- **cwd_resolution_service.ts:** Line 2 imports `formatDateStringForTimezone`, line 44 uses it in `defaultCwdPlacement()`
- **list.ts:** Line 15 imports `formatDateStringForTimezone`, lines 70 and 210 use it in `createTodayPlacement()` and no-locator branch
- **item_repository.ts:** Line 3 imports `formatSegmentsForTimezone`, lines 67 and 336 use it in `directorySegmentsFromIso()` and `deriveFilePathFromId()`
- **Evidence:** All three files correctly use the shared module instead of their own implementations

#### 3. Skip cwd Resolution for Absolute Paths ✅ PASS
- **Code Analysis:** `rangeExpressionRequiresCwd()` function in list.ts (lines 82-95) checks if first segment is "dot", "dotdot", or "numeric"
- **Logic Verification:**
  - Absolute date paths (e.g., "2025-01-01") → segment kind is "relativeDate" → needsCwd = false
  - Aliases (e.g., "myproject") → segment kind is "idOrAlias" → needsCwd = false
  - UUIDs → segment kind is "idOrAlias" → needsCwd = false
  - Permanent paths → segment kind is "permanent" → needsCwd = false
  - Relative paths (e.g., ".", "..") → segment kind is "dot"/"dotdot" → needsCwd = true
  - Numeric sections (e.g., "1", "2") → segment kind is "numeric" → needsCwd = true
- **Implementation:** Lines 136-162 in list.ts only call `getCwd()` when `needsCwd` is true

#### 4. Performance Improvement ⏸️ PENDING CI BENCHMARK
- **Status:** Requires CI benchmark run on PR to measure actual performance improvement
- **Target:** Execution time within 5% of pre-PR #95 baseline (~86ms)
- **Note:** This criterion can only be verified when CI runs the benchmark suite

#### 5. Functional Correctness ✅ PASS
- **Test Suite:** `deno task test` executed successfully
  - **Passed:** 30 E2E scenarios (291 steps), 560+ unit tests
  - **Failed:** 2 shell completion tests (zsh/bash not found in environment - unrelated to this change)
- **Timezone Handling:** Workspace timezone is correctly used for "today" calculation via shared module

**Tests:** All passing (30 E2E scenarios, 560+ unit tests) - 2 shell completion failures unrelated to this change

**Quality:**
- Linting clean (240 files checked)
- No debug code (console.log/console.error are expected in CLI commands for output)
- No uncommented TODOs

**Next:** Code Review (after CI performance benchmark confirms criterion 4)

### Pull Request
PR: [#98](https://github.com/kecbigmt/mm/pull/98)
Created: 2026-01-21
Status: Ready for review (pending CI benchmark)

### Follow-ups / Open Risks

#### Remaining
- Performance improvement needs CI benchmark verification (benchmark runs on PR)
- The 5% target may need adjustment based on actual CI measurements
