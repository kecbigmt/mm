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

### Current State Analysis (2026-02-17)

**Completion script (`completions.ts`) gaps vs CLI commands:**

1. **`--project` flag missing entirely** from both Zsh and Bash completion scripts
   - CLI commands (note, task, event, edit) all define `--project <project:string>`
   - Completion scripts have no mention of `--project`

2. **`--context` uses old tag cache** instead of alias cache
   - Zsh: `->context_tags` state with `_mm_get_tag_candidates()` (reads `completion_context_tags.txt`)
   - Bash: `_mm_get_tag_candidates()` for `--context` values
   - Should use `_mm_get_alias_candidates()` (reads `completion_aliases.txt`) instead

3. **`edit` command missing metadata flags** in completion
   - Zsh: Only completes positional `item_id`, no flag completion for `--project`, `--context`
   - Bash: Only lists `--workspace --help --version` flags

4. **`_mm_get_tag_candidates()` can be removed** once `--context` switches to alias cache

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:**
- Consolidated identical `note_flags`/`task_flags`/`event_flags` into single `create_flags`: duplication removal, single source of truth
- Merged `note|n)`, `task|t)`, `event|ev)` Zsh case handlers into one: they shared identical flag sets and completion behavior
- Merged `close|cl)`, `reopen|op)`, `remove|rm)`, `snooze|sn)` Zsh case handlers into one: identical multi-item alias completion
- Merged duplicate `item_id` and `project_aliases|context_aliases` branches in `edit|e)`: both resolved to alias completion
- Extracted `getCompletionOutput()` test helper to eliminate repeated capture/parse/restore/join boilerplate across all 15 tests
- Extracted shared `expectedCommands` constant used by both zsh/bash command-list tests
**Design:** Reduced coupling between flag definitions and command cases; improved cohesion by grouping commands with identical completion behavior
**Quality:** Tests passing (15/15), Linting clean, Formatting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Date: 2026-02-17**

**Acceptance Criteria:**

#### 1. Zsh Completion for --project: PASS
- [x] `mm note "Test" --project <TAB>` - Line 92 declares `--project:->project_aliases`, lines 125-129 complete with `_mm_get_alias_candidates()`
- [x] `mm task "Test" --project <TAB>` - Same flag declaration and completion logic (merged case handler lines 122-130)
- [x] `mm event "Test" --project <TAB>` - Same flag declaration and completion logic
- [x] `mm edit item-id --project <TAB>` - Line 107 in edit_flags, lines 138-142 complete with aliases

#### 2. Zsh Completion for --context: PASS
- [x] `mm note "Test" --context <TAB>` - Line 93 declares `--context:->context_aliases`, uses `_mm_get_alias_candidates()` (not tags)
- [x] `mm task "Test" --context <TAB>` - Same flag and completion logic
- [x] `mm edit item-id --context <TAB>` - Line 108 in edit_flags, completes with aliases

#### 3. Bash Completion for --project: PASS
- [x] `mm note "Test" --project <TAB>` - Line 348 includes `--project` flag, lines 371-374 complete with `_mm_get_alias_candidates()`
- [x] `mm edit item-id --project <TAB>` - Line 352 includes `--project` in edit flags, same completion logic

#### 4. Bash Completion for --context: PASS
- [x] `mm note "Test" --context <TAB>` - Line 348 includes `--context`, lines 371-374 complete with aliases

#### 5. Flag Declaration Updates: PASS
- [x] Zsh script declares `--project` with alias completion - Line 92 in create_flags, line 107 in edit_flags
- [x] Bash script includes `--project` flag values completing with aliases - Lines 348, 352, 371-374

**Tests:** All passing (15/15 completion tests, 674/674 total unit tests)
**Quality:** Linting clean, Formatting clean, No debug code, No uncontextualized TODOs
**Next:** Code Review

### Follow-ups / Open Risks

#### Remaining
- Old `completion_context_tags.txt` cache file is still being written by CacheRepository
  - Consider removing if no other features use it (separate concern from shell completion)
