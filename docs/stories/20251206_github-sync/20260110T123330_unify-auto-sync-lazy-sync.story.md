## Story Log

### Goal
Unify `lazy-sync` and `auto-sync` modes into a single configurable `auto-sync` mode with threshold settings.

### Why
Currently there are two separate sync modes: `auto-sync` (syncs every commit) and `lazy-sync` (syncs when thresholds are met). However, `lazy-sync` with `commits=1` behaves identically to `auto-sync`. This redundancy complicates the user mental model and configuration. By unifying them, users get a simpler model: `auto-sync` with configurable `commits` and `minutes` thresholds, where `commits=1` provides immediate sync (current auto-sync behavior) and higher values provide batched sync (current lazy-sync behavior).

### User Story
**As a mm user, I want a unified `auto-sync` mode with configurable threshold settings, so that I can choose between immediate sync or batched sync without having to understand two different mode names.**

### Acceptance Criteria

#### 1. Mode Unification
- [ ] **Given** workspace.json with `sync.mode="auto-sync"`, **When** no `sync.lazy` settings exist, **Then** sync triggers after every commit (default: `commits=1`).
- [ ] **Given** `sync.mode="auto-sync"` with `sync.lazy.commits=10`, **When** 10 commits accumulate, **Then** sync is triggered.
- [ ] **Given** `sync.mode="auto-sync"` with `sync.lazy.minutes=10`, **When** 10+ minutes pass since last sync, **Then** sync is triggered on next commit.
- [ ] **Given** `sync.mode="lazy-sync"` in existing config, **When** mm loads workspace, **Then** it is treated as `auto-sync` (backward compatibility via alias).

#### 2. Configuration
- [ ] **Given** user wants to configure thresholds, **When** they run `mm config set sync.lazy.commits 5`, **Then** the setting is saved and applies to auto-sync mode.
- [ ] **Given** user wants immediate sync, **When** they run `mm config set sync.lazy.commits 1`, **Then** sync happens after every commit.
- [ ] **Given** user runs `mm config list`, **When** auto-sync mode is active, **Then** `sync.lazy.commits` and `sync.lazy.minutes` are shown with their current values.

#### 3. Default Behavior Change
- [ ] **Given** new workspace with `sync.mode="auto-sync"` and no explicit lazy settings, **When** user commits, **Then** sync happens immediately (commits=1 is default for auto-sync).
- [ ] **Given** `sync.mode="auto-commit"`, **When** user commits, **Then** no sync happens (unchanged behavior).

#### 4. Error Cases
- [ ] **Given** invalid mode value in workspace.json, **When** mm loads workspace, **Then** it falls back to `auto-commit` mode.

### Out of Scope
- Changing `auto-commit` mode behavior (remains local-only)
- Adding new sync modes
- Background/async sync

---

### Completed Work Summary

#### Implementation

1. **Type System Changes** (`src/domain/models/workspace.ts`)
   - Removed `lazy-sync` from `VersionControlSyncMode` type (now only `auto-commit` | `auto-sync`)
   - Added `DEFAULT_AUTO_SYNC_SETTINGS` (commits=1, minutes=0) for immediate sync
   - Kept `DEFAULT_LAZY_SYNC_SETTINGS` (commits=10, minutes=10) for backward compatibility
   - Parser treats `lazy-sync` as alias for `auto-sync` (backward compatibility)

2. **Workflow Changes** (`src/domain/workflows/auto_commit.ts`)
   - Unified `auto-sync` and `lazy-sync` handling into single code path
   - Auto-sync now uses threshold settings (defaults to commits=1 for immediate sync)
   - Time threshold check only activates when `minutes > 0` (0 disables it)

3. **Configuration Changes** (`src/presentation/cli/commands/config.ts`)
   - `mm config set sync.mode lazy-sync` is accepted but stored as `auto-sync` with lazy defaults
   - `sync.lazy.minutes` now accepts 0 (disables time threshold)
   - Default values shown are mode-aware (auto-sync shows commits=1, minutes=0)

4. **Tests Updated**
   - Renamed lazy-sync tests to auto-sync threshold tests
   - Updated default value expectations
   - Added test for minutes=0 acceptance

#### Files Modified
- `src/domain/models/workspace.ts`
- `src/domain/workflows/auto_commit.ts`
- `src/presentation/cli/commands/config.ts`
- `src/presentation/cli/commands/sync.ts` (comment update)
- `src/domain/workflows/auto_commit_test.ts`
- `tests/e2e/scenarios/scenario_26_config_command_test.ts`

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- Verified default sync.lazy.commits=1 and sync.lazy.minutes=0 for new workspaces
- Verified `mm config set sync.mode lazy-sync` stores as auto-sync with lazy defaults (commits=10, minutes=10)
- Verified `mm config list` shows threshold values correctly
- Verified `mm config set sync.lazy.commits 5` saves and applies to auto-sync
- Verified invalid mode values are rejected with clear error message
- All unit tests pass (555 tests)
- All relevant E2E tests pass (config, sync scenarios)
- Linting passes with no errors
- No debug prints or uncontextualized TODOs

**Note**: Shell completion E2E tests fail due to missing zsh/bash in test environment (pre-existing issue, unrelated to this change).

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- Users with existing `lazy-sync` config: Parser treats as `auto-sync` (backward compatible)
- Default change for `auto-sync`: Now uses commits=1 by default (same behavior as before, just explicit)

#### Remaining
- None identified
