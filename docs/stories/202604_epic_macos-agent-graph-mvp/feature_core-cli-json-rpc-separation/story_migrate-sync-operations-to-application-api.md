---
status: completed
depends:
  - story_define-final-parallel-workflow-migration-wave
  - story_extract-core-runtime-composition
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Migrate Sync Operations To Application API

**Role**: This story implements Lane B by migrating `sync_pull`, `sync_push`, and `sync_init` into
shared application use cases and retiring the thin `sync.ts` workflow composition.

## Story Log

### Goal

Implement shared application APIs for sync pull, sync push, and sync init; migrate CLI `sync` to
call those use cases; and remove `src/domain/workflows/sync.ts` instead of carrying it forward as a
thin wrapper.

### Why

The sync lane is the largest remaining workflow group, but its reusable core is now clear:

- pull, push, and init are adapter-facing operations that future JSON-RPC clients would also need
- the CLI already composes pull and push directly with adapter-only steps in between
- the thin `sync.ts` workflow no longer justifies a separate migration target

This story finishes the reusable sync boundary while keeping infrastructure-specific post-processing
in the adapter.

### User Story

**As a client adapter developer, I want shared application APIs for sync pull, sync push, and sync
init, so that CLI and future JSON-RPC handlers can run sync operations through structured contracts
without importing `domain/workflows/sync*.ts`.**

### Acceptance Criteria

#### 1. Shared Sync APIs

- [ ] **Given** a client wants to initialize sync, pull, or push, **When** it calls the shared
      application APIs, **Then** it can submit typed requests and receive structured results without
      relying on CLI-only output modules
- [ ] **Given** sync operations fail validation or Git/repository operations fail, **When** the
      APIs return, **Then** adapters receive structured errors they can map independently

#### 2. CLI Boundary Migration

- [ ] **Given** `application/use_cases` is the adapter-facing boundary, **When** the sync lane is
      migrated, **Then** CLI `sync` imports application use cases rather than
      `src/domain/workflows/sync_pull.ts`, `sync_push.ts`, or `sync_init.ts`
- [ ] **Given** the CLI also performs adapter-specific post-processing, **When** the migration is
      complete, **Then** index rebuild, sync state reset, and temporary-directory cleanup remain in
      the CLI adapter instead of moving into shared use cases

#### 3. Thin Composition Retirement

- [ ] **Given** `src/domain/workflows/sync.ts` is only thin composition, **When** the sync lane is
      migrated, **Then** it is removed rather than reintroduced as a first-class application API
- [ ] **Given** the CLI already composes sync steps directly, **When** `sync.ts` is removed,
      **Then** the observable sync command behavior remains compatible

#### 4. Verification Surface

- [ ] **Given** sync workflow tests currently live under workflow paths, **When** the migration
      completes, **Then** orchestration coverage for pull/push/init moves to the application layer
      or to smaller domain helpers directly
- [ ] **Given** the migration is complete, **When** remaining workflow modules are reviewed,
      **Then** `sync_pull.ts`, `sync_push.ts`, `sync_init.ts`, and `sync.ts` are no longer on the
      adapter-facing path

### Out Of Scope

- Migrating `snooze_item` in the same story
- Migrating `workspace_init_remote` in the same story
- Changing sync command UX beyond preserving current behavior
- Implementing JSON-RPC transport handlers

---

### Completed Work Summary

### Refactoring
**Status: Not Started**

### Verification
**Status: Verified - Story Definition Accurate**

Verified 2026-04-05 against codebase state on branch `feature/cli-core-separation`.

#### 1. Workflow files still exist in `src/domain/workflows/` — PASS

`sync_pull.ts`, `sync_push.ts`, `sync_init.ts`, and `sync.ts` are all present. The story is define-only; no implementation has been performed yet.

#### 2. Story correctly describes sync behavior — PASS

- `sync_pull.ts` validates `git_not_enabled`, `no_remote_configured`, `uncommitted_changes`, and `branch_mismatch` before executing `gitService.pull`.
- `sync_push.ts` validates `git_not_enabled`, `no_remote_configured`, and `branch_mismatch` (no uncommitted-changes guard) before executing `gitService.push`.
- `sync_init.ts` validates URL format and branch name, calls `gitService.init`, handles remote, persists workspace config, creates/updates `.gitignore`, and makes an initial commit. All three match the story's description.

#### 3. `sync.ts` is thin composition not used by the CLI — PASS

`src/domain/workflows/sync.ts` is exactly 42 lines: it composes `SyncPullWorkflow.execute` and `SyncPushWorkflow.execute` and labels the combined output. The CLI (`src/presentation/cli/commands/sync.ts`) imports `SyncPullWorkflow` and `SyncPushWorkflow` directly — it never imports from `sync.ts`. The story's characterization is accurate.

#### 4. CLI adapter-specific logic correctly identified — PASS

The story names three pieces that must stay in the adapter. All three are confirmed present in `src/presentation/cli/commands/sync.ts`:

- **Index rebuild** — `rebuildIndexIfNeeded()` scans workspace items and atomically replaces the graph/alias index after a pull.
- **Sync state reset** — `resetSyncState()` writes `commitsSinceLastSync: 0` to the state repository after a successful push.
- **Temp dir cleanup** — `cleanupTempDirs()` removes `.index/.tmp-graph` and `.index/.tmp-aliases` on index-write failure.

None of this logic has any domain equivalent; it is correctly scoped to the CLI adapter.

#### 5. Acceptance criteria are testable and specific — PASS

All eight acceptance-criteria bullets name observable, verifiable outcomes: import paths, file existence, test file location, and retained post-processing locations. No criterion requires subjective judgment.

#### 6. Dependency `story_extract-core-runtime-composition` is valid — PASS

The file `docs/stories/202604_epic_macos-agent-graph-mvp/feature_core-cli-json-rpc-separation/story_extract-core-runtime-composition.md` exists with `status: draft`.

### Acceptance Checks
**Status: Pending Product Owner Review**

### Follow-ups / Open Risks

- deciding how much of current sync warning/reporting should be returned from use cases versus kept
  as CLI formatting concerns
- coordinating final export wiring because this lane introduces multiple new use-case modules
