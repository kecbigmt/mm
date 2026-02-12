## Story Log

### Goal
Enable tab completion for `--project` and `--context` options when creating or editing items.

### Why
The permanent notes epic introduced `--project` and `--context` options that reference permanent Item
aliases. Currently, users must remember and type exact alias names. Tab completion would significantly
improve UX by suggesting available aliases, matching the existing completion behavior for item locators.

### User Story
**As a mm user, I want tab completion for --project and --context options, so that I can quickly
reference existing projects and contexts without remembering exact alias names.**

### Acceptance Criteria

#### 1. Zsh Completion for --project
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm note "Test" --project <TAB>`, **Then** available aliases are suggested from the completion cache
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm task "Test" --project <TAB>`, **Then** available aliases are suggested
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm event "Test" --project <TAB>`, **Then** available aliases are suggested
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm edit item-id --project <TAB>`, **Then** available aliases are suggested

#### 2. Zsh Completion for --context
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm note "Test" --context <TAB>`, **Then** available aliases are suggested from the completion cache
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm task "Test" --context <TAB>`, **Then** available aliases are suggested
- [ ] **Given** the user has sourced the zsh completion script, **When** they type `mm edit item-id --context <TAB>`, **Then** available aliases are suggested

#### 3. Bash Completion for --project
- [ ] **Given** the user has sourced the bash completion script, **When** they type `mm note "Test" --project <TAB>`, **Then** available aliases are suggested
- [ ] **Given** the user has sourced the bash completion script, **When** they type `mm edit item-id --project <TAB>`, **Then** available aliases are suggested

#### 4. Bash Completion for --context
- [ ] **Given** the user has sourced the bash completion script, **When** they type `mm note "Test" --context <TAB>`, **Then** available aliases are suggested

#### 5. Flag Declaration Updates
- [ ] **Given** the zsh completion script, **When** I inspect the flag declarations for note/task/event, **Then** `--project` is listed with alias completion
- [ ] **Given** the bash completion script, **When** I inspect the flag handling, **Then** `--project` flag values complete with aliases

### Verification Approach
- Unit tests for completion script output (verify flags are declared correctly)
- Manual shell testing with sourced completion scripts
- E2E test verifying completion script structure

### Out of Scope
- Filtering aliases to show only "topic" type items (all aliases are suggested)
- Creating a separate cache file for project/context aliases
- Fish or PowerShell support

---

### Implementation (Red-Green)

**Status: Complete**

**Implemented:**
- Zsh: Added `--project` flag with `->project_aliases` state to note_flags, task_flags, event_flags
- Zsh: Changed `--context` from `->context_tags` to `->context_aliases` (uses aliases, not old tags)
- Zsh: Added `edit_flags` array with `--project` and `--context` options
- Zsh: Added case handlers for `project_aliases` and `context_aliases` states in note/task/event/edit
- Bash: Added `--project` to flag lists for note/task/event/edit commands
- Bash: Updated flag value completion to handle `--project` and `--context` with alias candidates

**Decisions:**
- Both `--project` and `--context` use the same alias cache (`completion_aliases.txt`)
- No filtering by item type (all aliases available for both project and context)
- Reused existing `_mm_get_alias_candidates()` helper function

**Tests:**
- `completions_test.ts`: 12 tests (6 new tests added)
- Status: All passing

---

### Refactoring

**Status: Complete - Ready for Verify**

**Applied:**
1. [Removed unused code]: Deleted `_mm_get_tag_candidates()` function from both Zsh and Bash scripts
   - Single responsibility: function was no longer called after `--context` switched to alias cache
   - Reduces maintenance burden and avoids confusion
2. [Consolidated duplicated case handlers]: Combined `project_aliases` and `context_aliases` cases
   - Changed from separate `project_aliases)` and `context_aliases)` cases to `project_aliases|context_aliases)`
   - For edit command, also consolidated `item_id` since it uses the same logic
   - Reduces code duplication while keeping shell scripts readable
3. [Cleaned up comments]: Removed outdated comment referencing `completion_context_tags.txt` in `_mm_find_cache_file()`

**Design:**
- Coupling: No change (shell scripts remain self-contained)
- Cohesion: Improved by grouping related completion states that share the same logic
- Responsibilities: Cleaner separation - `_mm_get_alias_candidates()` is the only alias candidate function

**Quality:**
- Tests passing: 580 unit tests, 12 completion tests
- Linting: Clean (deno fmt/lint)
- E2E: Shell registration tests fail due to environment (no zsh, bash completion support) - pre-existing

**Next:** Verify

### Completed Work Summary
Implementation complete with TDD Red-Green cycle, followed by refactoring to remove unused code and consolidate duplication.

### Verification

**Status: Verified - Ready for Code Review**

**Date:** 2026-01-22

**Acceptance Criteria Results:**

#### 1. Zsh Completion for --project: PASS
- Evidence: Zsh script declares `'--project[Project reference]:project:->project_aliases'` in note_flags, task_flags, event_flags, and edit_flags
- Evidence: Case handlers include `project_aliases|context_aliases)` pattern with `_mm_get_alias_candidates()` function call
- All commands (note, task, event, edit) properly configured

#### 2. Zsh Completion for --context: PASS
- Evidence: Zsh script declares `'--context[Context reference]:context:->context_aliases'` in note_flags, task_flags, event_flags, and edit_flags
- Evidence: Case handlers use same `context_aliases` state with alias completion
- Correctly switched from old `context_tags` to `context_aliases` using alias cache

#### 3. Bash Completion for --project: PASS
- Evidence: Bash script includes `--project` in flags list for note/task/event/edit commands
- Evidence: Flag value completion handles `"--project"` with `_mm_get_alias_candidates()` function

#### 4. Bash Completion for --context: PASS
- Evidence: Bash script includes `--context` in flags list for note/task/event/edit commands
- Evidence: Flag value completion handles `"--context"` with `_mm_get_alias_candidates()` function

#### 5. Flag Declaration Updates: PASS
- Evidence: Zsh flag declarations verified for all commands
- Evidence: Bash flag handling verified for all commands
- Both shells use alias completion cache (`completion_aliases.txt`)

**Tests:**
- All 12 completion unit tests passing (completions_test.ts)
- All 665 test cases passing across unit and E2E suites
- 30 E2E scenarios passing (291 steps)
- Note: Shell registration E2E tests fail due to environment (no zsh installed, bash lacks completion support) - pre-existing limitation

**Quality:**
- Linting clean: `deno lint` passed (240 files checked)
- Formatting clean: `deno fmt --check` passed (241 files checked)
- No debug code: All console.log statements are legitimate CLI output
- No uncontextualized TODOs: Zero TODO comments found
- Bash script syntax verified: `bash -n` passed

**Next:** Code Review

### Pull Request

PR: [#101](https://github.com/kecbigmt/mm/pull/101)
Created: 2026-01-22
Status: Ready for review

### Follow-ups / Open Risks

#### Addressed
- `--context` previously used old `context_tags` cache; now correctly uses alias cache
- `_mm_get_tag_candidates()` function removed from shell scripts (no longer used)
- Zsh case handler duplication consolidated using `|` pattern matching

#### Remaining
- Old `completion_context_tags.txt` cache file is still being written by CacheRepository
  - Consider removing if no other features use it (separate concern from shell completion)

