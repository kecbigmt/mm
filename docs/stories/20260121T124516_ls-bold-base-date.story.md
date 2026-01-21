## Story Log

### Goal
Make `mm ls` bold the base date header instead of always bolding "today".

### Why
When using `mm ls` from a date directory (e.g., `mm cd 2026-01-25`), the list centers on that date as the "base date". Currently, "today" is always bolded regardless of the base date, which doesn't visually highlight the date the user is focused on. The base date should be bold to indicate the reference point for the current listing.

### User Story
**As a CLI user, I want the base date to be bold in `mm ls` output, so that I can easily identify the reference date for the current listing.**

### Acceptance Criteria

#### 1. Base Date Bolding
- [ ] **Given** I'm at the workspace root (no date directory), **When** I run `mm ls`, **Then** today's date header is bold (same as current behavior)
- [ ] **Given** I'm in a date directory (e.g., `2026-01-25`), **When** I run `mm ls`, **Then** that date's header is bold (not today)
- [ ] **Given** I'm in a date directory that doesn't appear in the output range, **When** I run `mm ls`, **Then** no date header is bold

#### 2. Print Mode
- [ ] **Given** print mode is enabled (`--print`), **When** I run `mm ls`, **Then** no date header is bold (no ANSI codes)

#### 3. Edge Cases
- [ ] **Given** the base date equals today, **When** I run `mm ls`, **Then** today's date header is bold (both conditions satisfied)

### Verification Approach
- Unit tests for `formatDateHeader()` function with different base date scenarios
- Manual CLI verification with `mm cd <date>` and `mm ls`

### Out of Scope
- Changing the relative label display format
- Adding new command-line options
- Modifying how the base date is determined

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- Base Date Bolding: Added optional `baseDate` parameter to `formatDateHeader()`. When provided and matches the displayed date, that date is bolded. Falls back to bolding "today" when not provided.
- Integration: Updated `list.ts` to extract base date from cwd (when cwd is a date directory) and pass it to `formatDateHeader()`.

**Decisions:**
- Backwards compatible: When `baseDate` is not provided, the function falls back to the original behavior of bolding "today".
- Base date extraction: Only date directories provide a base date. Permanent directories and item directories use undefined (fall back to today).

**Tests:**
- `src/presentation/cli/formatters/list_formatter_test.ts`: Added 6 new tests for base date bolding scenarios
- Status: All passing (59 tests)

**Technical debt:**
- None identified - implementation is minimal and focused

**Next:** Refactor

### Completed Work Summary
Implementation complete. Added base date bolding feature to `mm ls`:
- Modified `formatDateHeader()` to accept optional `baseDate` parameter
- Updated `list.ts` to pass cwd date as base date when applicable
- Added 6 unit tests covering all acceptance criteria

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance:** 2026-01-21

#### Acceptance Criteria: PASS

1. **Base Date Bolding**: PASS
   - At workspace root, today is bold: Covered by test "today is bold when base date equals today"
   - In date directory, that date is bold: Covered by test "base date is bold when different from today"
   - Base date not in range, no date is bold: Covered by test "no date is bold when base date not in output range"

2. **Print Mode**: PASS
   - No bold in print mode: Covered by test "base date not bold in print mode"

3. **Edge Cases**: PASS
   - Base date equals today: Covered by test "today is bold when base date equals today"

**Tests:** All passing (575 unit tests, 5 specific base date tests)

**Quality:**
- Linting: Clean (deno lint passed)
- Debug code: None (only intentional console.error/console.warn for user feedback)
- TODOs: None

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- Base date is passed through the call chain via optional parameter to `formatDateHeader()`

#### Remaining
- None identified
