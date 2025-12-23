## Story Log

### Goal
Improve `mm ls` relative date display to use weekday names and consistent notation.

### Why
The current relative date display has two issues:
1. Within a week, people naturally think in weekdays ("next Monday", "last Friday") rather than day counts ("+3d", "-2d")
2. The display uses `-Xd` for past dates, but the command input uses `~Xd`, causing confusion

### User Story
**As a mm user, I want `mm ls` to display relative dates using weekday names for the past/next week and use `~Xd` notation for older dates, so that the output is more intuitive and consistent with command input format.**

### Acceptance Criteria

#### 1. Weekday Display for Past Week
- [x] **Given** a date that is 2-6 days in the past, **When** running `mm ls`, **Then** it displays as `last-{weekday}` (e.g., `last-monday`, `last-friday`)
- [x] **Given** a date that is exactly 7 days in the past (same weekday as today), **When** running `mm ls`, **Then** it displays as `last-{weekday}`

#### 2. Weekday Display for Next Week
- [x] **Given** a date that is 2-6 days in the future, **When** running `mm ls`, **Then** it displays as `next-{weekday}` (e.g., `next-monday`, `next-friday`)
- [x] **Given** a date that is exactly 7 days in the future (same weekday as today), **When** running `mm ls`, **Then** it displays as `next-{weekday}`

#### 3. Today/Tomorrow/Yesterday Unchanged
- [x] **Given** today's date, **When** running `mm ls`, **Then** it displays as `today` (unchanged)
- [x] **Given** tomorrow's date, **When** running `mm ls`, **Then** it displays as `tomorrow` (unchanged)
- [x] **Given** yesterday's date, **When** running `mm ls`, **Then** it displays as `yesterday` (unchanged)

#### 4. Tilde Notation for Dates Beyond a Week
- [x] **Given** a date that is 8+ days in the past, **When** running `mm ls`, **Then** it displays as `~Xd` (e.g., `~8d`, `~14d`)
- [x] **Given** a date that is 8+ days in the future, **When** running `mm ls`, **Then** it displays as `+Xd` (e.g., `+8d`, `+14d`)

#### 5. Print Mode Compatibility
- [x] **Given** the `--print` flag is used, **When** running `mm ls --print`, **Then** the relative date labels are displayed without ANSI formatting

### Out of Scope
- Changing the parsing/input format (already uses `~Xd`, weekday syntax)
- Localization of weekday names (use English lowercase: monday, tuesday, etc.)
- Changing the date format `[YYYY-MM-DD]` itself

---

### Completed Work Summary

**Implementation completed:**

1. Modified `computeRelativeLabel` function in `src/presentation/cli/formatters/list_formatter.ts`:
   - Added `WEEKDAY_NAMES` constant for day-of-week to weekday name mapping
   - Changed +2 to +7 days to display as `next-{weekday}` (e.g., `next-wednesday`)
   - Changed -2 to -7 days to display as `last-{weekday}` (e.g., `last-saturday`)
   - Changed dates beyond -7 days to display as `~Xd` (tilde notation, consistent with input)
   - Changed dates beyond +7 days to display as `+Xd`

2. Updated tests in `src/presentation/cli/formatters/list_formatter_test.ts`:
   - Modified existing `+2d` test to expect `next-wednesday`
   - Added test for `-2d` → `last-saturday`
   - Added test for `+7d` → `next-monday`
   - Added test for `-7d` → `last-monday`
   - Changed "far future" test to expect `+19d` instead of no label
   - Changed "far past" test to expect `~40d` instead of no label
   - Added boundary tests for `+8d` and `~8d`

3. Updated doc comments for `formatDateHeader` function

**Key design decisions:**
- Used UTC weekday calculation (`getUTCDay()`) consistent with existing date handling
- Reused lowercase weekday format consistent with `date_resolver.ts` (next-monday, last-friday)
- All existing tests for today/tomorrow/yesterday remain unchanged

**Test coverage:**
- Unit tests: 490 passed (all formatDateHeader tests pass)
- E2E tests: 27 passed, 1 failed (unrelated shell completion environment issue)

### Acceptance Checks

**Status: Accepted**

Developer verification completed:
- Verified weekday labels display correctly for ±2 to ±7 days
- Verified tilde notation (~Xd) for past dates beyond a week
- Verified plus notation (+Xd) for future dates beyond a week
- Verified today/tomorrow/yesterday unchanged
- Verified print mode works correctly (no ANSI codes in tests)
- All unit tests pass
- E2E tests pass (except unrelated shell completion test)

**Acceptance testing results (2025-12-23):**
- AC.1 PASSED: `last-sunday`, `last-saturday`, `last-tuesday` displayed correctly for -2d to -7d
- AC.2 PASSED: `next-thursday`, `next-friday`, `next-tuesday` displayed correctly for +2d to +7d
- AC.3 PASSED: `today`, `tomorrow`, `yesterday` labels unchanged
- AC.4 PASSED: `~8d` for -8d, `+8d` for +8d displayed correctly
- AC.5 PASSED: Print mode output contains no ANSI escape codes

All acceptance criteria verified in temporary workspace `/tmp/tmp.dBZbIohEgy`.

### Follow-ups / Open Risks

#### Addressed
- Weekday calculation uses UTC consistently with existing codebase
- Weekday format matches existing `date_resolver.ts` conventions

#### Remaining
- (none identified)
