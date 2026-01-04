# Story: Execute sync pull before file operations instead of after

**Status:** Implementation Complete
**Created:** 2026-01-03T03:12:40
**Reference:** mm task yoni-0h6

## User Story

As a user syncing across multiple devices,
I want mm to pull remote changes before performing file operations,
So that I minimize conflicts when editing existing items.

## Background

When sync mode is `lazy-sync` or `auto-sync`, the current sync flow is:

```
AsIs: File operation → pull → commit → push
```

This ordering can cause conflicts when editing existing items (e.g., `mm edit`) because local changes are written before remote changes are fetched.

The proposed change:

```
ToBe: pull → File operation → commit → push
```

By pulling first, remote changes are incorporated before local file operations, reducing the likelihood of conflicts.

## Acceptance Criteria

### 1. Pull Before File Operations

- [ ] **Given** sync mode is `auto-sync` and remote is configured, **When** you run a state-changing command (e.g., `mm edit`), **Then** mm pulls from remote before performing the file operation
- [ ] **Given** sync mode is `lazy-sync` and remote is configured, **When** you run a state-changing command, **Then** mm pulls from remote before performing the file operation
- [ ] **Given** sync mode is `auto-commit`, **When** you run a state-changing command, **Then** mm does NOT pull before the file operation (no sync behavior)

### 2. Commit and Push After File Operations

- [ ] **Given** pull succeeded before file operation, **When** the file operation completes, **Then** mm commits and pushes as before
- [ ] **Given** pull succeeded and file operation completes, **When** push is performed, **Then** conflicts are less likely because local files are up-to-date

### 3. Error Handling

- [ ] **Given** pull fails due to network error, **When** running a state-changing command, **Then** the file operation proceeds with a warning
- [ ] **Given** pull fails due to rebase conflict, **When** running a state-changing command, **Then** the file operation proceeds with a warning (not blocked)
- [ ] **Given** remote is not configured, **When** running a state-changing command, **Then** the file operation proceeds without pull

### 4. Affected Commands

State-changing commands that should trigger pre-pull:
- [ ] `mm task` / `mm note` / `mm event` (create)
- [ ] `mm edit` (update)
- [ ] `mm close` / `mm reopen` (status change)
- [ ] `mm remove` (delete)

## Verification Approach

- Unit tests for the new pre-sync workflow
- E2E tests simulating multi-device sync scenarios
- Manual testing with actual remote repository

## Technical Notes

- Pre-pull displays loading indicator (same as post-sync)
- Performance: latency is acceptable for `auto-sync` users; users who prefer speed can use `lazy-sync` or `auto-commit`

## Out of Scope

- Background/async sync (pull happens synchronously before operation)
- Automatic conflict resolution
- Changes to `auto-commit` mode behavior

---

### Completed Work Summary

#### New Files
- `src/infrastructure/git/sync_service.ts` - SyncService with prePull operation (Infrastructure layer)
- `src/infrastructure/git/sync_service_test.ts` - Unit tests (9 test cases)
- `src/presentation/cli/pre_pull_helper.ts` - CLI helper for orchestrating pre-pull in Imperative Shell

#### Modified Files (pre-pull integration)
- `src/presentation/cli/commands/task.ts`
- `src/presentation/cli/commands/note.ts`
- `src/presentation/cli/commands/event.ts`
- `src/presentation/cli/commands/edit.ts`
- `src/presentation/cli/commands/close.ts`
- `src/presentation/cli/commands/reopen.ts`
- `src/presentation/cli/commands/remove.ts`
- `src/presentation/cli/commands/move.ts`
- `src/presentation/cli/commands/snooze.ts`

#### Key Design Decisions
- **DMMF-aligned architecture**: Pre-pull is an Infrastructure Service, not a Domain Workflow
  - Git sync operations are I/O concerns, not domain logic
  - CLI (Imperative Shell) orchestrates: prePull → Domain Workflow → autoCommit
- Pre-pull is failure-tolerant: warnings are displayed but operations proceed
- Loading indicator uses same "Syncing..." message as post-sync
- Network errors and pull failures show specific warning messages
- Skips pre-pull for `auto-commit` mode (only for `auto-sync` and `lazy-sync`)

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

#### AC1: Pull Before File Operations
- ✓ auto-sync mode: Verified by unit test "executes pull when mode is auto-sync" and E2E test "pulls remote changes before creating a new note"
- ✓ lazy-sync mode: Verified by unit test "executes pull when mode is lazy-sync" and E2E test "pre-pulls in lazy-sync mode"
- ✓ auto-commit mode skips: Verified by unit test "skips pull when mode is auto-commit" and E2E test "skips pre-pull in auto-commit mode"

#### AC2: Commit and Push After Operations
- ✓ All 9 CLI commands call `executeAutoCommit` after file operations (verified by code review)
- ✓ Sequence preserved: pre-pull → file operation → commit → push

#### AC3: Error Handling
- ✓ Network error warning: Verified by unit test "returns warning when pull fails due to network error" and E2E test "continues operation with warning when pull fails"
- ✓ Rebase conflict warning: Verified by unit test "returns warning when pull fails due to rebase conflict"
- ✓ No remote configured: Verified by unit test "skips pull when no remote configured"

#### AC4: Affected Commands
- ✓ All 9 state-changing commands have `executePrePull` integration:
  - task.ts, note.ts, event.ts (create)
  - edit.ts (update)
  - close.ts, reopen.ts (status change)
  - remove.ts (delete)
  - move.ts, snooze.ts (additional state changes)

#### Code Quality
- ✓ No debug console.log statements
- ✓ No uncontextualized TODO comments
- ✓ Code follows project conventions

#### Test Coverage
- 9 unit tests in `src/infrastructure/git/sync_service_test.ts`
- 4 E2E tests in `tests/e2e/scenarios/scenario_26_pre_pull_test.ts`

**Tests verified**: All 536 unit tests and 212 E2E test steps passed (2026-01-03).
- 2 E2E test steps failed in `completions_test.ts` due to missing `zsh`/`bash` shells in CI environment (unrelated to pre-pull feature).

### Follow-ups / Open Risks

#### Addressed

- Performance impact: Acceptable for `auto-sync`; speed-conscious users can choose `lazy-sync` or `auto-commit`
- Loading indicator: Will be shown during pre-pull

#### Remaining

- Edge case: what if pull succeeds but local file was modified externally?

---

## Completed: AutoCommitWorkflow Refactoring

### Background

When refactoring PrePullWorkflow to align with DMMF (Domain Modeling Made Functional), we identified the same architectural issue in `AutoCommitWorkflow`. Git I/O operations are infrastructure concerns, not domain logic, and should be moved accordingly.

### Design Approach

**Before**:
```
src/domain/workflows/auto_commit.ts          # Git I/O in domain layer (DELETED)
src/presentation/cli/auto_commit_helper.ts   # CLI helper
```

**After**:
```
src/infrastructure/git/sync_service.ts       # SyncService.autoCommit()
src/presentation/cli/auto_commit_helper.ts   # Updated to call SyncService
```

### Architecture (Final)

```
┌─────────────────────────────────────────────────────────────┐
│  CLI (Imperative Shell)                                     │
│  - executePrePull()    → SyncService.prePull()   ✅ Done    │
│  - executeAutoCommit() → SyncService.autoCommit() ✅ Done   │
├─────────────────────────────────────────────────────────────┤
│  Domain Workflows (pure business logic)                     │
│  - EditItemWorkflow, CreateItemWorkflow, etc.              │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Services (I/O operations)                   │
│  - SyncService.prePull()    ✅ Done                         │
│  - SyncService.autoCommit() ✅ Done                         │
└─────────────────────────────────────────────────────────────┘
```

### Completed Tasks (2026-01-04)

1. [x] Added `SyncService.autoCommit()` to `sync_service.ts`
   - Ported logic from `AutoCommitWorkflow.execute()`
   - Type definitions: `AutoCommitInput`, `AutoCommitResult`, `AutoCommitError`
   - Includes lazy-sync threshold logic

2. [x] Added 16 test cases to `sync_service_test.ts`
   - All auto-commit scenarios covered
   - Mock dependencies (StateRepository, etc.)

3. [x] Updated `auto_commit_helper.ts`
   - Changed from `AutoCommitWorkflow` to `SyncService.autoCommit()` call
   - Settings loading handled in helper (same pattern as prePull)

4. [x] Deleted old files
   - `src/domain/workflows/auto_commit.ts`
   - `src/domain/workflows/auto_commit_test.ts`

5. [x] Tests verified
   - 540 unit tests passed
   - 224 E2E test steps passed
   - 2 E2E failures unrelated (zsh/bash shell not available in CI environment)

### Key Changes

- Removed `Result<T, never>` wrapper, using simple return type instead
- Settings loading responsibility moved to helper (Shell layer)
- SyncService handles only pure Git operations
- Both prePull and autoCommit now consolidated in SyncService
