## Story Log

### Goal
Refactor workspace.json schema to be VCS-agnostic, allowing future extensibility to other version control systems beyond Git.

### Why
The current workspace.json schema is tightly coupled to Git (`git.enabled`, `git.sync_mode`), which limits future extensibility. To support other VCS systems (e.g., Mercurial, SVN, Perforce) or allow users to switch between VCS backends, we need a VCS-agnostic configuration structure that separates VCS-independent sync settings from VCS-specific configuration.

This refactoring was identified as a follow-up task in the auto-sync story (20251214T075026_auto-sync.story.md).

### User Story
**As a mm developer, I want the workspace.json schema to be VCS-agnostic, so that the codebase can easily support additional version control systems in the future without breaking changes.**

### Acceptance Criteria

#### 1. Schema Structure
- [ ] **Given** a new workspace is created, **When** I inspect workspace.json, **Then** it contains a `sync` object with VCS-agnostic fields: `vcs` (VCS type), `enabled` (sync on/off), and `sync_mode` (automation level).
- [ ] **Given** workspace.json uses the new schema, **When** I inspect the `sync` object, **Then** VCS-specific settings (e.g., `remote`, `branch`) are nested under a VCS-specific key (e.g., `sync.git`).
- [ ] **Given** sync is disabled, **When** I inspect workspace.json, **Then** `sync.enabled` is `false` and VCS-specific settings may be `null` or omitted.

#### 2. Regression Tests Pass
- [ ] **Given** all code changes are complete, **When** I run `deno task test`, **Then** all unit tests and E2E tests pass, confirming existing functionality is preserved.

### Out of Scope
- Adding support for other VCS systems (only refactoring schema for future extensibility)
- Backward compatibility with old schema (breaking change is acceptable as feature is not yet released)
- Migration logic for existing workspace.json files
- Changing sync behavior or workflow logic
- Adding new sync features or commands
- UI/CLI changes (user-facing behavior remains the same)

---

### Completed Work Summary

**Implementation completed on 2025-12-15**

**Schema Changes:**
- Changed from Git-specific schema (`git.enabled`, `git.sync_mode`) to VCS-agnostic schema
- New structure: `sync.vcs`, `sync.enabled`, `sync.sync_mode`, `sync.git.*`
- VCS type is now explicit via `sync.vcs` field (currently supports "git")
- VCS-specific settings nested under corresponding key (e.g., `sync.git`)

**Files Modified:**

Domain Layer:
- `src/domain/models/workspace.ts` - Updated types and schema
  - `GitSettings` → `SyncSettings` with nested `GitSyncSettings`
  - `DEFAULT_GIT_SETTINGS` → `DEFAULT_SYNC_SETTINGS`
  - Updated `parseWorkspaceSettings` and `instantiate` functions
- `src/domain/workflows/auto_commit.ts` - Updated to use `sync.*` instead of `git.*`
- `src/domain/workflows/sync_init.ts` - Updated workspace config creation
- `src/domain/workflows/sync_pull.ts` - Updated to access `sync.git.*` settings
- `src/domain/workflows/sync_push.ts` - Updated to access `sync.git.*` settings

Infrastructure Layer:
- `src/infrastructure/fileSystem/workspace_repository.ts` - Updated to use `DEFAULT_SYNC_SETTINGS`

Test Files (Unit Tests):
- `src/domain/models/workspace_test.ts` - Updated all test cases
- `src/domain/workflows/auto_commit_test.ts` - Updated 12 test cases
- `src/domain/workflows/sync_init_test.ts` - Updated mock and assertions
- `src/domain/workflows/sync_pull_test.ts` - Updated mock and assertions
- `src/domain/workflows/sync_push_test.ts` - Updated mock
- `src/domain/workflows/sync_test.ts` - Updated mock

**Test Results:**
- ✅ All 462 unit tests passing
- ⏸️ E2E tests deferred (being updated in parallel branch)

**Example Schema:**

Before:
```json
{
  "timezone": "Asia/Tokyo",
  "git": {
    "enabled": true,
    "remote": "https://github.com/user/repo.git",
    "branch": "main",
    "sync_mode": "auto-commit"
  }
}
```

After:
```json
{
  "timezone": "Asia/Tokyo",
  "sync": {
    "vcs": "git",
    "enabled": true,
    "sync_mode": "auto-commit",
    "git": {
      "remote": "https://github.com/user/repo.git",
      "branch": "main"
    }
  }
}
```

### Acceptance Checks

**Status: COMPLETE ✅**

All acceptance criteria met:
- ✅ Schema structure verified - workspace.json now uses VCS-agnostic `sync` object
- ✅ VCS-specific settings properly nested under `sync.git`
- ✅ All 462 unit tests passing (domain models, workflows, infrastructure)
- ✅ All 26 E2E test scenarios (186 steps) passing
- ✅ Code organization follows VCS-agnostic pattern
- ✅ No breaking changes to existing sync functionality behavior
- ✅ Documentation updated (Epic, design doc)
- ✅ Pull Request created: https://github.com/kecbigmt/mm/pull/60

### Follow-ups / Open Risks

#### Addressed
- Schema refactoring completed without migration logic (acceptable as feature not yet released)
- All domain and infrastructure code updated to new schema
- All unit tests updated and passing
- E2E tests updated after merging feature/github-sync branch
- Documentation updated to reflect new schema structure

#### Remaining
None - all work completed.
