## Story Log

### Goal
Automatically rebuild index after `mm sync` (combined pull+push) when items have changed.

### Why
The `mm sync pull` command already rebuilds the index automatically when items change, but `mm sync` (which internally calls pull + push) does not. This inconsistency causes users to have stale indexes when using the more convenient combined command.

### User Story
**As a user syncing across multiple devices, I want the index to update automatically after `mm sync`, so that I get the same behavior as `mm sync pull` without having to run separate commands.**

### Acceptance Criteria

#### 1. Automatic Index Rebuild After Combined Sync
- [x] **Given** sync is enabled and `mm sync` succeeds with pull bringing new items, **When** items were added/modified/deleted by the pull, **Then** full index rebuild is executed automatically
- [x] **Given** sync is enabled and `mm sync` succeeds, **When** no items changed during pull, **Then** no index rebuild is performed (skip for efficiency)

#### 2. Output Display
- [x] **Given** index rebuild occurs, **When** sync completes, **Then** display rebuild summary (items processed, edges created, aliases created) after sync output

#### 3. Error Cases
- [x] **Given** index rebuild fails, **When** error is detected, **Then** display warning but do not fail the sync command (sync itself succeeded)

### Verification Approach
CLI commands with actual Git repository:
1. Set up workspace with `mm sync init`
2. Push changes from another clone
3. Run `mm sync` and verify index is rebuilt
4. Verify edge files exist after sync

### Out of Scope
- Automatic index update for auto-sync mode (separate concern)
- Incremental/differential index updates (full rebuild is acceptable)

---

### Completed Work Summary

**Implementation complete.**

#### Files Modified
- `src/presentation/cli/commands/sync.ts`: Added `rebuildIndexIfNeeded()` call to the default `mm sync` action (combined pull+push command)
- `tests/e2e/scenarios/scenario_24_sync_commands_test.ts`: Added E2E test "rebuilds index when items changed during sync"

#### Implementation Details
- Reused existing `rebuildIndexIfNeeded()` function already implemented for `mm sync pull`
- Added rebuild logic after `SyncWorkflow.execute()` succeeds
- Same behavior as `mm sync pull`: rebuilds only when items changed, shows summary, warns on failures

### Acceptance Checks

**Status: ✅ ACCEPTED**

All acceptance criteria verified and passing.
Tested on: 2025-12-23

Developer verification:
- Unit tests pass (490 passed, 0 failed)
- E2E tests pass (shell completion test failure is pre-existing, unrelated)
- Type checking passes
- Lint passes

Product owner acceptance testing:
- AC1: Verified with real Git repository - "Index rebuilt: 2 items, 2 edges, 2 aliases" displayed after pull with changes
- AC2: Verified - No rebuild message when "Already up to date"
- AC3: Verified - Summary displayed after sync output
- AC4: Verified - Warning displayed on rebuild failure, sync still succeeds

### Follow-ups / Open Risks

#### Addressed
- Reused existing `rebuildIndexIfNeeded()` function to maintain consistency with `mm sync pull`

#### Remaining
- Performance for large workspaces: Full rebuild on every sync with changes. Acceptable for typical workspaces.
