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

#### 2. Change Detection
- [ ] **Given** `mm sync pull` just completed, **When** detecting changes, **Then** use git diff to check if any files under `items/` were modified

#### 3. Error Cases
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

After `git pull` completes, check if items changed:

```bash
git diff --quiet HEAD@{1} HEAD -- items/
```

- Exit code 0: No changes in items/
- Exit code 1: Changes detected in items/

#### Integration Point

Modify `SyncPullWorkflow` to:
1. Record HEAD before pull (or use `HEAD@{1}` after pull)
2. Execute pull
3. If pull succeeded, check for item changes via git diff
4. If items changed, run existing `rebuildIndex()` logic
5. Return combined result (pull result + rebuild status)

#### Reuse Existing Code

- Use existing `IndexRebuilder.rebuildFromItems()` for the rebuild
- Use existing `WorkspaceScanner.scanAllItems()` for scanning
- No new indexing logic required

---

### Completed Work Summary
Not yet started.

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- [List what the developer manually verified]
- [Note any observations or findings]

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- **Complexity concern**: Avoided incremental update logic by reusing existing full rebuild

#### Remaining
- **Performance for large workspaces**: Full rebuild on every pull with changes. Acceptable for typical workspaces, but may need optimization if users report slow syncs with 10K+ items.
