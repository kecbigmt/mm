---
status: completed
depends:
  - story_define-final-parallel-workflow-migration-wave
  - story_extract-core-runtime-composition
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Migrate Workspace Init Remote To Application API

**Role**: This story implements Lane C by migrating `workspace_init_remote` into a shared
application use case.

## Story Log

### Goal

Implement a shared application API for remote workspace initialization and migrate the relevant CLI
workspace command path to call it instead of importing
`src/domain/workflows/workspace_init_remote.ts` directly.

### Why

`workspace_init_remote` is the last standalone bootstrap workflow on the adapter-facing path. It is
small enough to migrate independently, and moving it behind `application/use_cases` completes the
final workflow wave without coupling it to the larger sync lane.

### User Story

**As a client adapter developer, I want a shared remote-workspace initialization API, so that CLI
and future JSON-RPC handlers can bootstrap a remote workspace through the same contract without
depending on `domain/workflows/workspace_init_remote.ts`.**

### Acceptance Criteria

#### 1. Shared Remote Init API

- [ ] **Given** a client wants to initialize a workspace from a remote repository, **When** it
      calls the shared application API, **Then** it can submit typed request data and receive a
      structured result without relying on CLI-only orchestration
- [ ] **Given** bootstrap validation or repository/Git failures occur, **When** the API returns,
      **Then** adapters receive structured errors they can map independently

#### 2. Boundary Migration

- [ ] **Given** `application/use_cases` is the adapter-facing boundary, **When**
      `workspace_init_remote` is migrated, **Then** CLI workspace remote-init code imports the
      application use case rather than `src/domain/workflows/workspace_init_remote.ts`
- [ ] **Given** the migration is complete, **When** implementation ownership is inspected, **Then**
      reusable bootstrap orchestration lives in `src/application/use_cases`

#### 3. Behavior Preservation

- [ ] **Given** current remote init behavior, **When** the application API is introduced, **Then**
      clone flow, branch handling, cleanup on failure, and workspace bootstrap validation remain
      compatible
- [ ] **Given** local-only workspace init does not depend on this workflow, **When** the migration
      completes, **Then** that unaffected CLI path remains outside this story’s changes

#### 4. Workflow Retirement

- [ ] **Given** remote-init orchestration tests currently live under workflow paths, **When** the
      migration completes, **Then** orchestration coverage moves to the application layer or to
      smaller domain helpers directly
- [ ] **Given** the migration is complete, **When** remaining workflow modules are reviewed,
      **Then** `src/domain/workflows/workspace_init_remote.ts` is removed from the adapter-facing
      path

### Out Of Scope

- Migrating sync workflows in the same story
- Migrating `snooze_item` in the same story
- Changing workspace-init UX beyond preserving current behavior
- Implementing JSON-RPC transport handlers

---

### Completed Work Summary

### Refactoring
**Status: Not Started**

### Verification
**Status: Verified - Ready for Implementation**
**Acceptance:** 2026-04-05

- Criterion 1 (Source file exists): PASS — `src/domain/workflows/workspace_init_remote.ts` is present and exports `WorkspaceInitRemoteWorkflow`.
- Criterion 2 (Behavior description accuracy): PASS — The workflow source confirms all four behaviors named in AC 3: clone flow (`gitService.clone`), optional branch handling (`input.branch`), cleanup on failure (`removeDirectory` called inside the clone error branch), and config update (`configRepository.setCurrentWorkspace`).
- Criterion 3 (Local-only path unaffected): PASS — `workspace.ts` branches on `remoteUrl` at line 172; the local init path (lines 208–239) uses `repository.create` and never imports `WorkspaceInitRemoteWorkflow`, confirming the story's AC 3 second bullet is accurate.
- Criterion 4 (Migration pattern consistency): PASS — Story follows the established pattern (define use case in `application/use_cases`, update CLI import, retire domain workflow) matching the completed `move_item`, `edit_item`, `change_item_status`, and `remove_item` migrations.
- Criterion 5 (Criteria testable and specific): PASS — All ACs are Given/When/Then, name concrete artifacts (`src/domain/workflows/workspace_init_remote.ts`, `src/application/use_cases`), and describe observable outcomes that can be verified by code inspection or test.
- Criterion 6 (Dependency validity): PASS — `story_extract-core-runtime-composition.md` exists in the same feature directory and its own verification is marked "Verified - Ready for Code Review".

### Acceptance Checks
**Status: Pending Product Owner Review**

### Follow-ups / Open Risks

- deciding whether the result contract should expose bootstrap metadata beyond what the current CLI
  path needs
