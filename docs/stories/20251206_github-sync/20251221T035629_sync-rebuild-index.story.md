## Story Log

### Goal
Implement efficient incremental index rebuild after `mm sync pull` using Git diff to identify changed items.

### Why
Currently, after `mm sync pull`, users must manually run `mm doctor --rebuild-index` to update the index. This is:
1. Easy to forget, leading to stale indexes
2. Inefficient - full rebuild scans all items O(n) even when only a few items changed

An incremental approach using Git diff can achieve O(m) where m = changed items, making it practical to run automatically after every pull.

### User Story
**As a user syncing across multiple devices, I want the index to update automatically after pull, so that I don't need to manually rebuild and my queries reflect the latest synced state.**

### Acceptance Criteria

#### 1. Automatic Index Update After Pull
- [ ] **Given** sync is enabled and `mm sync pull` succeeds, **When** items were added/modified/deleted by the pull, **Then** the index is updated to reflect those changes automatically
- [ ] **Given** sync is enabled and `mm sync pull` succeeds, **When** no items changed, **Then** no index update is performed (skip for efficiency)

#### 2. Incremental Update Logic
- [ ] **Given** items were added by pull, **When** index update runs, **Then** new edge files are created in `.index/graph/` based on each item's placement
- [ ] **Given** items were modified by pull (placement/rank changed), **When** index update runs, **Then** old edge files are removed and new ones created at correct locations
- [ ] **Given** items were deleted by pull, **When** index update runs, **Then** corresponding edge files and alias files are removed
- [ ] **Given** items with aliases were added/modified, **When** index update runs, **Then** alias files in `.index/aliases/` are updated accordingly

#### 3. Git Diff Detection
- [ ] **Given** `mm sync pull` just completed, **When** detecting changes, **Then** use `git diff --name-status HEAD@{1} HEAD -- items/` to identify added/modified/deleted item files
- [ ] **Given** git diff output contains non-item files, **When** processing changes, **Then** ignore files outside `items/**/*.md`

#### 4. Error Cases
- [ ] **Given** an item file has parse errors, **When** index update runs, **Then** log a warning for that item but continue processing other items
- [ ] **Given** incremental update fails catastrophically, **When** error is detected, **Then** suggest user run `mm doctor --rebuild-index` as fallback
- [ ] **Given** git diff command fails, **When** detecting changes, **Then** fall back to full rebuild with a warning message

### Out of Scope
- Automatic index update for `mm sync` (the combined pull+push command) - will be added later
- Automatic index update for auto-sync mode - will be added later
- Conflict resolution during rebase - remains manual per Epic design
- Optimizing the full rebuild itself - separate concern

---

### Technical Design

#### Change Detection

After `git pull` completes, detect changed items:

```bash
git diff --name-status HEAD@{1} HEAD -- items/
```

Output format:
```
A       items/2025/01/15/uuid1.md    # Added
M       items/2025/01/15/uuid2.md    # Modified
D       items/2025/01/15/uuid3.md    # Deleted
```

#### Handling Each Change Type

**Added (A):**
1. Parse item frontmatter
2. Create edge file at placement path
3. Create alias file if alias exists

**Modified (M):**
1. Parse item frontmatter to get current placement/rank/alias
2. Scan `.index/graph/` for existing edge with this item ID (expensive but necessary since old placement unknown)
3. Remove old edge file
4. Create new edge file at current placement path
5. Update alias (remove old if changed, create new)

**Deleted (D):**
1. Extract item ID from filename
2. Scan `.index/graph/` for edge with this item ID
3. Remove edge file
4. Scan `.index/aliases/` for alias pointing to this item ID
5. Remove alias file if found

#### Edge Lookup Optimization

For modified/deleted items, we need to find existing edges. Options:
1. **Scan all edge files** - O(total edges), simple but slow
2. **Maintain reverse index** - item ID → edge path mapping, faster but more complexity
3. **Store previous placement in edge file** - requires schema change

Recommended: Start with option 1 (scan), optimize later if performance becomes an issue. For typical workspaces (< 10K items), scanning is acceptable.

#### Integration Point

Modify `SyncPullWorkflow` to:
1. Record HEAD before pull
2. Execute pull
3. If pull succeeded, run incremental index update
4. Return combined result

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
- (none yet)

#### Remaining
- **Performance for large change sets**: If a pull brings in thousands of items, incremental update may be slower than full rebuild due to edge scanning. Consider adding threshold to switch to full rebuild.
- **Edge scanning efficiency**: Current design scans all edges to find item's existing edge. May need reverse index if this becomes a bottleneck.
- **Alias cleanup for modified items**: Need to handle case where alias was removed (not just changed) from an item.
