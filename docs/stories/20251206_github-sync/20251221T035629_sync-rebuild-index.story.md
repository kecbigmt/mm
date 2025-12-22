## Story Log

### Goal
Automatically rebuild index after `mm sync pull` when items have changed.

### Why
Currently, after `mm sync pull`, users must manually run `mm doctor --rebuild-index` to update the index. This is easy to forget, leading to stale indexes and unexpected query results.

### User Story
**As a user syncing across multiple devices, I want the index to update automatically after pull, so that I don't need to manually rebuild and my queries reflect the latest synced state.**

### Acceptance Criteria

#### 1. Automatic Index Rebuild After Pull
- [ ] **Given** sync is enabled and `mm sync pull` succeeds, **When** items were added/modified/deleted by the pull, **Then** full index rebuild is executed automatically
- [ ] **Given** sync is enabled and `mm sync pull` succeeds, **When** no items changed, **Then** no index rebuild is performed (skip for efficiency)

#### 2. Error Cases
- [ ] **Given** index rebuild fails, **When** error is detected, **Then** display warning but do not fail the pull command (pull itself succeeded)
- [ ] **Given** git diff command fails, **When** detecting changes, **Then** skip index rebuild with a warning message

### Out of Scope
- Incremental/differential index updates (too complex, full rebuild is acceptable)
- Automatic index update for `mm sync` (the combined pull+push command) - can be added later
- Automatic index update for auto-sync mode - can be added later
- Conflict resolution during rebase - remains manual per Epic design

---

### Technical Design

#### Change Detection

After `git pull --rebase` completes, check if items changed:

```bash
git diff --quiet ORIG_HEAD HEAD -- items/
```

- Exit code 0: No changes in items/
- Exit code 1: Changes detected in items/

**Note**: We use `ORIG_HEAD` instead of `HEAD@{1}` because:
- `git pull --rebase` sets `ORIG_HEAD` to the pre-rebase HEAD
- `HEAD@{1}` after rebase points to the last cherry-pick step, not the pre-rebase state
- This ensures we detect upstream changes even when local commits exist and are rebased

#### Integration Point

Modify `sync pull` CLI command (presentation layer) to:
1. Execute pull via `SyncPullWorkflow`
2. If pull succeeded, check for item changes via `git diff --quiet ORIG_HEAD HEAD -- items/`
3. If items changed, run existing `rebuildIndex()` logic
4. Display combined result (pull output + rebuild status)

#### Reuse Existing Code

- Use existing `IndexRebuilder.rebuildFromItems()` for the rebuild
- Use existing `WorkspaceScanner.scanAllItems()` for scanning
- No new indexing logic required

---

### Completed Work Summary

**Implementation complete.**

#### Files Modified
- `src/domain/services/version_control_service.ts`: Added `hasChangesInPath()` interface method
- `src/infrastructure/git/git_client.ts`: Implemented `hasChangesInPath()` using `git diff --quiet`
- `src/presentation/cli/commands/sync.ts`: Added `rebuildIndexIfNeeded()` function and integrated into pull command

#### Test Files Updated
- `src/domain/workflows/sync_pull_test.ts`
- `src/domain/workflows/sync_push_test.ts`
- `src/domain/workflows/sync_test.ts`
- `src/domain/workflows/sync_init_test.ts`
- `src/domain/workflows/auto_commit_test.ts`

All mocks updated to include `hasChangesInPath` method.

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- Unit tests pass (469 passed, 0 failed)
- E2E tests pass (25 passed, 1 failed - shell completion test unrelated to this change)
- Type checking passes
- Lint passes

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- **Complexity concern**: Avoided incremental update logic by reusing existing full rebuild

#### Remaining
- **Performance for large workspaces**: Full rebuild on every pull with changes. Acceptable for typical workspaces, but may need optimization if users report slow syncs with 10K+ items.
