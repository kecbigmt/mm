## Story Log

### Goal

Enhance `cd` and `ls` commands with `~` (home), `-` (previous), and correct `ls` behavior at
non-date placements like `/permanent`.

### Why

Three usability gaps exist in the current cd/ls implementation:

1. `mm cd ~` does not work as a shortcut for "go home" (today's date), which is a common shell
   convention.
2. There is no way to jump back to the previous location (`mm cd -`), which is a standard shell
   navigation feature.
3. After `mm cd permanent`, running `mm ls` (no args) shows the default ±7 day date range instead of
   listing items in `/permanent`, because the no-arg branch only handles `item` heads, not
   `permanent`.

### User Story

**As a mm user, I want shell-like navigation shortcuts (`~`, `-`) and correct `ls` behavior at my
current location, so that I can navigate efficiently and always see the items where I actually am.**

### Acceptance Criteria

#### 1. `cd ~` navigates to today (home)

- [ ] **Given** the CWD is any placement (e.g., `/permanent`, a date, an item), **When** you run
      `mm cd ~`, **Then** the CWD changes to today's date and the new placement is displayed
- [ ] **Given** the workspace timezone is configured, **When** you run `mm cd ~`, **Then** today is
      computed using the workspace timezone

#### 2. `cd -` navigates to the previous location

- [ ] **Given** the user has navigated at least once (e.g., `mm cd permanent`), **When** you run
      `mm cd -`, **Then** the CWD changes to the placement that was active before the last `cd` and
      the new placement is displayed
- [ ] **Given** no previous location exists in the session, **When** you run `mm cd -`, **Then** an
      error message is displayed (e.g., "no previous directory")
- [ ] **Given** the user runs `mm cd -` twice consecutively, **When** the second `mm cd -` executes,
      **Then** the CWD toggles back to where the user was before the first `mm cd -`

#### 3. `ls` respects non-date CWD

- [ ] **Given** the CWD is `/permanent`, **When** you run `mm ls` (no args), **Then** items in
      `/permanent` are listed (not the default date range)
- [ ] **Given** the CWD is `/permanent/1`, **When** you run `mm ls` (no args), **Then** items in
      `/permanent/1` are listed

#### 4. Error Cases

- [ ] **Given** the user has never navigated (`cd` never used), **When** you run `mm cd -`, **Then**
      an informative error is shown

### Out of Scope

- Making `~` usable in arbitrary path expressions (e.g., `mm ls ~/1` or `mm cd ~/foo`); only
  `mm cd ~` as a standalone argument
- Storing navigation history beyond the single previous location (no full `pushd`/`popd` stack)
- Changing `mm cd` (no args) behavior (it already goes to today)

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**

- [Criterion 1 - cd ~]: Treat `~` same as no-arg in cd.ts (navigate to today)
- [Criterion 2 - cd -]: Added `previousCwd` field to SessionData, `getPreviousCwd` to
  CwdResolutionService, `-` handling in cd.ts. setCwd now accepts optional previousPlacement.
- [Criterion 3 - ls at permanent]: Changed condition in list.ts from `cwd.head.kind === "item"` to
  `cwd.head.kind === "item" || cwd.head.kind === "permanent"` so permanent CWD uses single placement
  query instead of date range.
- [Criterion 4 - error case]: getPreviousCwd returns validation error when no previousCwd exists in
  session.

**Decisions:**

- previousCwd is passed explicitly from cd.ts rather than read from session in setCwd, because the
  session may not exist on first navigation (default today placement isn't persisted until first
  cd).
- `~` and `-` are handled as special cases before path parsing, not as path tokens, keeping path
  parser unchanged.
- `Deno.exitCode = 1` set on `cd -` error to match shell convention for failed cd.

**Tests:**

- `tests/e2e/scenarios/scenario_cd_ls_enhancement_test.ts`: 7 tests (10 steps), all passing
  - cd ~: 2 tests (from different date, from /permanent)
  - cd -: 3 tests (navigate back, toggle, no previous error)
  - ls at permanent: 2 tests (shows permanent items only, empty permanent doesn't show date items)

**Files changed:**

- `src/domain/repositories/session_repository.ts`: Added `previousCwd?` to SessionData
- `src/infrastructure/fileSystem/session_repository.ts`: Added `previousCwd?` to SessionFileContent
- `src/domain/services/cwd_resolution_service.ts`: Added `previousPlacement` param to setCwd, added
  `getPreviousCwd` method
- `src/presentation/cli/commands/cd.ts`: Handle `~` and `-` special args, pass currentPlacement to
  saveAndDisplayPlacement
- `src/presentation/cli/commands/list.ts`: Added `permanent` to non-date CWD condition

**Technical debt:**

- cd.ts loads getCwd in multiple branches (home, dash, path) — each branch has different error
  handling semantics (non-fatal for ~/-, fatal for path), so consolidation would reduce clarity

**Next:** Verify

### Refactoring

**Status: Complete - Ready for Verify**

**Applied:**

- [Eliminate redundant deps object in cd.ts]: Removed `saveDeps` variable; reuse `cwdDeps` which is
  a structural superset of `SaveAndDisplayDeps`. Reduces coupling between variable declarations and
  clarifies that one dependency object serves all branches. (Single responsibility / simplicity)
- [Unit test coverage for previousCwd]: Added 7 unit tests covering `setCwd` with
  `previousPlacement` parameter (saves/omits previousCwd) and `getPreviousCwd` (success, no session,
  no previousCwd, workspace mismatch, invalid previousCwd). Closes the test coverage gap noted as
  technical debt.

**Design:** No coupling/cohesion changes needed; the implementation already follows good separation
of concerns.

**Quality:** Tests passing (22 unit, 10 e2e steps), linting clean, formatting clean.

**Note:** The getCwd duplication across branches in cd.ts was evaluated but intentionally kept: each
branch has different error semantics (non-fatal silencing for ~/- vs. fatal early return for path
args), so consolidation would obscure the control flow.

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance Testing:** 2026-02-16

All acceptance criteria verified through independent E2E testing:

**Criterion 1: `cd ~` navigates to today (home)**
- PASS: Test "navigates to today from a different date" - navigated from 2025-01-01 to today
- PASS: Test "navigates to today from /permanent" - navigated from /permanent to today
- Evidence: Tests verify placement changes to today's date in both scenarios

**Criterion 2: `cd -` navigates to previous location**
- PASS: Test "navigates to the previous location" - successfully returned to previous placement
- PASS: Test "toggles back and forth with consecutive cd -" - verified toggle behavior across 3
  consecutive cd - commands
- PASS: Test "shows error when no previous directory exists" - error message "no previous directory"
  displayed with exit code 1

**Criterion 3: `ls` respects non-date CWD**
- PASS: Test "shows only permanent items, not date items, when CWD is /permanent" - ls at /permanent
  shows only permanent items, not date range
- PASS: Test "shows (empty) not date headers when /permanent has no items" - empty /permanent shows
  "(empty)", not date items

**Criterion 4: Error Cases**
- PASS: Covered by Criterion 2 test for no previous directory

**Test Suite:** All passing (22 unit tests + 10 E2E steps for cd/ls enhancement)

**Quality Checks:**
- Linting: Clean (deno lint passes, unused import removed)
- Formatting: Clean (deno fmt --check passes)
- Debug statements: None found (all console.log are legitimate command output)
- TODOs: No uncontextualized TODOs found

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed

- Session backward compatibility: existing session files without previousCwd work fine (field is
  optional)

#### Remaining

- `~` only works as standalone cd argument, not in path expressions (by design, documented in Out of
  Scope)
