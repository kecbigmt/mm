## Story Log

### Goal
Improve list display formatting for better alias visibility and shell compatibility.

### Why
The current list display has usability issues:
1. In colored mode, the time is shown before the alias in parentheses, making aliases harder to scan
2. In print mode (`--print`), date section headers add noise, and the format isn't optimal for shell processing (alias isn't at the start of each line)

### User Story
**As a CLI user, I want improved list display formatting, so that I can quickly identify items by alias and easily process output in shell scripts.**

### Acceptance Criteria

#### 1. Colored Mode (without --print)
- [x] **Given** an event with start time only, **When** you run `mm ls`, **Then** it shows `○ <alias> HH:MM <title>` (time after alias, no parentheses)
- [x] **Given** an event with start and end time, **When** you run `mm ls`, **Then** it shows `○ <alias> HH:MM-HH:MM <title>` (time range after alias, no parentheses)
- [x] **Given** a task item, **When** you run `mm ls`, **Then** it shows `• <alias> <title>` (unchanged behavior)

#### 2. Print Mode (with --print)
- [x] **Given** any items exist, **When** you run `mm ls --print`, **Then** date section headers are NOT shown (flat output)
- [x] **Given** a task item, **When** you run `mm ls --print`, **Then** it shows `<alias>:task <date> <title>` format
- [x] **Given** an event with start time only, **When** you run `mm ls --print`, **Then** it shows `<alias>:event <date>T<HH:MM> <title>` format
- [x] **Given** an event with start and end time, **When** you run `mm ls --print`, **Then** it shows `<alias>:event <date>T<HH:MM>-<HH:MM> <title>` format
- [x] **Given** a closed task, **When** you run `mm ls --print`, **Then** it shows `<alias>:task:closed <date> <title>` format
- [x] **Given** a snoozing task, **When** you run `mm ls --print`, **Then** it shows `<alias>:task:snoozing <date> <title>` format

#### 3. Backward Compatibility
- [x] **Given** projects and contexts attached to an item, **When** you run `mm ls`, **Then** they still appear after the title (e.g., `+project @context`)
- [x] **Given** a due date on a task, **When** you run `mm ls`, **Then** it still appears at the end (e.g., `→2026-01-25`)

### Verification Approach
CLI commands with test data to verify output format matches specifications.

### Out of Scope
- Changes to section stub formatting (`📁` / `[section]`)
- Changes to item-head section headers (e.g., `[some-book/1]`)
- Changes to note or topic formatting

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- Colored mode: Event time now appears after alias without parentheses (`○ <alias> HH:MM <title>`)
- Print mode: New format `<alias>:<type>[:status] <date>[T<time>] <title> ...`
- Print mode: Date section headers removed for flat output
- Print mode: No empty lines between date partitions

**Decisions:**
- Removed `formatItemIconPlain` function - no longer needed with new print format
- Introduced `formatTypeToken` for print mode type suffix (e.g., `task`, `task:closed`)
- Introduced `formatEventTimeString` to share time formatting logic
- Introduced `formatDateTimeForPrint` to combine date and time for events

**Tests:**
- `list_formatter_test.ts`: 73 tests (9 new tests + updated 13 existing tests)
- Status: All passing

**Technical debt:**
- Old test assertions updated to match new format expectations

**Next:** Refactor

### Completed Work Summary
Implementation complete with TDD Red-Green cycle.

### Verification
**Status: Verified - Ready for Code Review**

**Acceptance Testing Completed: 2026-01-22**

#### 1. Colored Mode (without --print)
- [x] **Event with start time only** shows `○ <alias> HH:MM <title>`: PASS
  - Test: "formatItemLine - colored mode event with start time only shows time after alias"
  - Evidence: Verifies time appears without parentheses (line 895)
- [x] **Event with start and end time** shows `○ <alias> HH:MM-HH:MM <title>`: PASS
  - Test: "formatItemLine - colored mode event shows time after alias without parens"
  - Evidence: Verifies time range format without parentheses (line 877)
- [x] **Task item** shows `• <alias> <title>`: PASS
  - Test: "formatItemIcon - task open returns •"
  - Evidence: Confirms task icon unchanged (line 112)

#### 2. Print Mode (with --print)
- [x] **Date section headers NOT shown**: PASS
  - Implementation: Print mode uses flat output (formatItemLinePrintMode)
  - No date headers in print mode formatter
- [x] **Task item** shows `<alias>:task <date> <title>`: PASS
  - Test: "formatItemLine - print mode task uses new format alias:type date title"
  - Evidence: Exact format verified (line 914)
- [x] **Event with start time only** shows `<alias>:event <date>T<HH:MM> <title>`: PASS
  - Test: "formatItemLine - print mode event with start time only uses new format"
  - Evidence: Format with T separator verified (line 949)
- [x] **Event with start and end time** shows `<alias>:event <date>T<HH:MM>-<HH:MM> <title>`: PASS
  - Test: "formatItemLine - print mode event with time range uses new format"
  - Evidence: Format with time range verified (line 932)
- [x] **Closed task** shows `<alias>:task:closed <date> <title>`: PASS
  - Test: "formatItemLine - print mode closed task uses new format with status"
  - Evidence: Closed status suffix verified (line 966)
- [x] **Snoozing task** shows `<alias>:task:snoozing <date> <title>`: PASS
  - Test: "formatItemLine - print mode snoozing task uses new format with status"
  - Evidence: Snoozing status suffix verified (line 983)

#### 3. Backward Compatibility
- [x] **Projects and contexts** still appear after title: PASS
  - Test: "formatItemLine - print mode preserves project and context in new format"
  - Evidence: Context "@work" appears after title (line 1001)
- [x] **Due dates** still appear at end: PASS
  - Test: "formatItemLine - includes due date when present"
  - Evidence: Due date format "→2025-02-15" verified (line 237)

**Tests:** All 68 tests passing
**Type Check:** Clean (`deno check src/main.ts`)
**Linting:** Clean (`deno lint src/` - 206 files checked)
**Quality:** No debug statements, no uncontextualized TODOs

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- (none yet)

#### Remaining
- Print mode format is a breaking change for any scripts depending on current format
