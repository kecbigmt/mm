# Story Log: Default Command Shortcuts

## Goal
Enable `mm` and `mm workspace` to show lists without requiring explicit subcommands.

## Why
Users frequently run `mm list` to see their items and `mm workspace list` to see workspaces. Two key problems exist:
1. **Keystroke reduction**: Running `mm` and `mm ws` without arguments currently shows nothing, requiring extra typing
2. **Mental model building**: When users first run `mm` or `mm ws`, showing a list helps them understand what's available and how to interact with the system

By showing a simple list (without advanced options), users can:
- Quickly see their data with fewer keystrokes
- Learn what commands are available through a hint message
- Build a mental model of the system by seeing immediate, useful output

Advanced filtering options should remain exclusive to `mm list` and `mm workspace list` to preserve their purpose.

## User Story
**As a mm user, I want to run `mm` without arguments to see my item list and `mm workspace` (or `mm ws`) without arguments to see my workspace list, so that I can quickly view my data with fewer keystrokes.**

## Acceptance Criteria

### 1. Default Item List (`mm` with no args)
- [x] **Given** I am in a workspace, **When** I run `mm` with no arguments, **Then** it shows a hint message followed by a simple item list (default date range, no filtering options)
- [x] **Given** I am in a workspace, **When** I run `mm` with no arguments, **Then** the first line shows hint with bold "Hint:" using ANSI formatting: `Use \`mm -h\` for a list of available commands.`
- [x] **Given** I am in a workspace, **When** I run `mm` with no arguments, **Then** options like `-t`, `-a`, `-p` are NOT available (those are exclusive to `mm list`)

### 2. Default Workspace List (`mm workspace` with no args)
- [x] **Given** workspaces exist, **When** I run `mm workspace` with no arguments, **Then** it shows a hint message followed by workspace list with current marker
- [x] **Given** workspaces exist, **When** I run `mm ws` with no arguments, **Then** the first line shows hint with bold "Hint:" using ANSI formatting: `Use \`mm ws -h\` for a list of available commands.`
- [x] **Given** no workspaces exist, **When** I run `mm workspace` with no arguments, **Then** it shows hint, then "No workspaces found" message with creation hint

### 3. Backward Compatibility
- [x] **Given** the shortcuts are implemented, **When** I run `mm list` or `mm ls`, **Then** they continue to work as before with all options available
- [x] **Given** the shortcuts are implemented, **When** I run `mm workspace list` or `mm ws ls`, **Then** they continue to work as before

### 4. Error Cases
- [x] **Given** no workspace is configured, **When** I run `mm` with no arguments, **Then** it shows hint message followed by appropriate error message

## Verification Approach
- CLI command execution for all acceptance criteria
- Manual testing with various workspace states (empty, populated, no current workspace)
- Existing E2E tests should continue passing
- Add unit tests for new default action behavior if needed

## Out of Scope
- Changing the actual list output format or content (only adding hint message at the beginning)
- Advanced filtering or display options in default actions (these remain exclusive to `mm list` and `mm workspace list`)
- Modifying help text beyond adding the hint message

## Design Decisions

### Why No Options on Default Actions?
Advanced options (`-t`, `-a`, `-p`, etc.) are intentionally NOT available on `mm` and `mm ws` default actions:
1. **Preserves purpose**: `mm list` and `mm workspace list` remain the commands for advanced usage
2. **Reduces confusion**: Clear separation between quick peek (`mm`) and detailed query (`mm list`)
3. **Simpler mental model**: Users learn "no args = simple list, explicit command = full features"

### Why Show Hint Message?
The hint message serves two purposes:
1. **Discoverability**: New users learn that `-h` reveals available commands
2. **Mental model**: Reinforces that `mm` is the entry point to a larger command structure

**Implementation Note:** "Hint:" is displayed in bold using ANSI escape sequences (`bold()` from `@std/fmt/colors`), not markdown syntax, so it appears as actual bold text in the terminal.

---

## Completed Work Summary

### Implementation (Red-Green) - Revision 2

**Status: Complete - Ready for Verify**

**Acceptance: 2026-01-21 (Revised)**

Following user feedback on implementation, requirements were clarified:
- Hint messages MUST be displayed when using default actions
- Options (`-t`, `-a`, `-p`) MUST NOT be available on `mm` default action (exclusive to `mm list`)

**Implemented:**
- **main.ts**: Created `defaultListAction()` wrapper that displays hint message using ANSI bold formatting, then calls `listAction({})`
  - Removed all options from main command (no `-t`, `-a`, `-p`)
  - Maintains single responsibility: hint display is separate from list logic
  - Uses `bold()` from `@std/fmt/colors` for terminal bold formatting
- **workspace.ts**: Created `defaultListAction()` wrapper that displays hint message using ANSI bold formatting, then calls `listAction()`
  - `listAction()` remains pure (no parameters, single responsibility)
  - Default action for `mm workspace` shows hint, explicit `mm workspace list` does not
  - Uses `bold()` from `@std/fmt/colors` for terminal bold formatting
- **E2E tests**: Updated to verify hint messages are displayed (checking for "Hint:" text, allowing ANSI codes) and options are rejected

**Design Decisions:**
- **Single Responsibility Principle**: Each function has one clear purpose
  - `listAction()` - displays item/workspace list only
  - `defaultListAction()` - displays hint + calls listAction()
- **Separation of Concerns**: Hint display is not mixed into list logic
- **No Boolean Parameters**: Avoided `listAction(showHint)` anti-pattern

**Tests:**
- All 13 E2E test cases passing
- Full test suite: 31 passed (293 steps)

**Next:** Code Review

---

## Verification

**Status: Verified - Ready for Code Review**

**Date:** 2026-01-21

**Acceptance Criteria Results:**

### 1. Default Item List (`mm` with no args) - PASS
- **Criterion 1.1:** Shows hint message followed by simple item list
  - **Evidence:** Manual test showed hint `**Hint:** Use \`mm -h\` for a list of available commands.` followed by item list
  - **Result:** PASS
- **Criterion 1.2:** First line shows correct hint format
  - **Evidence:** Verified exact format with bold "Hint:" through manual testing
  - **Result:** PASS
- **Criterion 1.3:** Options like `-t`, `-a`, `-p` are NOT available
  - **Evidence:** E2E test verifies these options are rejected (tests lines 58-83)
  - **Result:** PASS

### 2. Default Workspace List (`mm workspace` with no args) - PASS
- **Criterion 2.1:** Shows hint message followed by workspace list
  - **Evidence:** Manual test showed hint `**Hint:** Use \`mm ws -h\` for a list of available commands.` followed by workspace list
  - **Result:** PASS
- **Criterion 2.2:** `mm ws` alias shows correct hint
  - **Evidence:** E2E test verifies ws alias (test lines 140-154)
  - **Result:** PASS
- **Criterion 2.3:** No workspaces case shows hint + helpful message
  - **Evidence:** Manual test confirmed "No workspaces found" with creation hint after hint message
  - **Result:** PASS

### 3. Backward Compatibility - PASS
- **Criterion 3.1:** `mm list` and `mm ls` continue to work
  - **Evidence:** E2E tests verify both commands work (tests lines 184-198)
  - **Result:** PASS
- **Criterion 3.2:** `mm workspace list` and `mm ws ls` continue to work
  - **Evidence:** E2E tests verify both commands work (tests lines 200-214)
  - **Result:** PASS
- **Note:** Explicit commands (`mm list`, `mm workspace list`) do NOT show hint message (as designed)

### 4. Error Cases - PASS
- **Criterion 4.1:** No workspace configured shows hint + error
  - **Evidence:** E2E test verifies hint appears even with error (test lines 85-102)
  - **Result:** PASS

**Test Suite Results:**
- E2E tests: 13/13 passed (Default Command Shortcuts scenario)
- Full test suite: 31 test files passed (293 steps total)
- Test execution time: 1m9s
- All tests passing

**Code Quality Checks:**
- Linting: PASS (232 files checked, no issues)
- Formatting: PASS (233 files checked, no issues)
- Debug code: PASS (All console.log/error/warn calls are legitimate output)
- Uncommented TODOs: PASS (No uncommented TODOs found)

**Recommendation:** Ready for Code Review

**Summary:**
All acceptance criteria verified through independent testing. Implementation correctly:
1. Shows hint messages for default actions (`mm`, `mm workspace`)
2. Excludes advanced options from default actions (exclusive to `mm list`)
3. Maintains backward compatibility (explicit commands work without hint)
4. Handles error cases gracefully (hint shown even on error)

**Files Modified:**
- src/main.ts (added defaultListAction wrapper)
- src/presentation/cli/commands/workspace.ts (added defaultListAction wrapper)
- src/presentation/cli/commands/list.ts (no changes to listAction signature)
- tests/e2e/scenarios/scenario_default_commands_test.ts (comprehensive E2E tests)

## Follow-ups / Open Risks

### Addressed
- `--help` continues to work correctly (Cliffy handles it automatically)
- Single responsibility maintained: hint display separated from list logic
- No boolean parameters: each action function has clear, single purpose
- All acceptance criteria verified independently

### Remaining
- None identified
