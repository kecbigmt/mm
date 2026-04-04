---
status: draft
depends: []
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Extract Core Runtime Composition

**Role**: This story defines the shared runtime composition boundary that will be reused by CLI and
future JSON-RPC adapters.

## Story Log

### Goal

Move workspace resolution and dependency wiring out of CLI-specific code into a shared core runtime.

### Why

The current `loadCliDependencies` path keeps runtime composition inside `presentation/cli`, which
prevents non-CLI adapters from reusing the same repository and service wiring. A shared runtime is
the smallest seam needed before other use cases can move behind a reusable application boundary.

### User Story

**As a client adapter developer, I want to initialize a shared mm runtime outside the CLI layer, so
that CLI and JSON-RPC can reuse the same repositories and services without duplicating wiring.**

### Acceptance Criteria

#### 1. Shared Runtime Boundary

- [ ] **Given** a valid workspace path or configured workspace, **When** a client initializes the
      shared runtime, **Then** it receives a UI-agnostic set of repositories and services
- [ ] **Given** the shared runtime exists, **When** CLI consumes it, **Then** command definitions,
      console output, and exit handling remain in `presentation/cli`

#### 2. Workspace Resolution

- [ ] **Given** explicit workspace input or configured defaults, **When** the shared runtime
      resolves the workspace, **Then** it preserves the current behavior for selecting the target
      workspace
- [ ] **Given** workspace resolution fails, **When** runtime initialization runs, **Then** it
      returns structured errors that adapters can map independently

#### 3. Sync Compatibility

- [ ] **Given** the existing GitHub-based multi-client workflow, **When** the shared runtime is
      introduced, **Then** sync-related repositories and persistence assumptions remain compatible

### Out Of Scope

- Migrating specific use cases such as list, create, edit, or move
- Implementing JSON-RPC transport
- SwiftUI UI work

---

### Completed Work Summary

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Remove duplicated test helpers and resolveWorkspaceRootFromSources tests from
dependencies_test.ts: loose coupling, no duplication. Remove resolveWorkspaceRootFromSources
re-export from CLI dependencies.ts: single responsibility, CLI wrapper only wraps.
**Design:** CLI dependencies.ts is now a pure thin wrapper with no re-exports of application-layer
utilities. workspace.ts imports resolveMmHome from application layer directly.
**Quality:** Tests passing (703), Linting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Acceptance:** 2026-04-04
- Criterion 1 (Shared Runtime Boundary): PASS - `src/application/runtime.ts` exports `CoreDependencies` (UI-agnostic repos/services); `src/presentation/cli/dependencies.ts` is a thin wrapper that re-exports `loadCoreDependencies` and type-aliases `CoreDependencies` as `CliDependencies`, keeping command definitions, console output, and exit handling in CLI layer
- Criterion 2 (Workspace Resolution): PASS - `loadCoreDependencies` preserves current workspace resolution logic (explicit path, MM_HOME, HOME, config file); returns structured `CoreDependencyError` with `type: "workspace"` or `type: "repository"` on failure
- Criterion 3 (Sync Compatibility): PASS - `versionControlService`, `sessionRepository`, and `stateRepository` remain in `CoreDependencies`; no sync-related infrastructure was altered

**Tests:** All passing (703)
**Quality:** Linting clean (`deno lint src/` 0 errors), no debug output in application/domain layers, no bare TODOs
**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed

- none yet

#### Remaining

- choosing the final module name for the shared layer (`application`, `core`, or equivalent)
- deciding how much of current CLI environment resolution should stay adapter-specific
