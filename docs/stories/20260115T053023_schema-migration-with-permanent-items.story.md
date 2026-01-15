## Story Log

### Goal
Add schema migration command that auto-creates permanent items for tags and updates workspace to the latest schema version.

### Why
The permanent-notes-project-context feature introduced a breaking change: `project` and `contexts` fields must now reference permanent item UUIDs instead of alias/tag strings. This requires:
1. Creating new permanent items for all existing tags
2. Updating all item frontmatter to use UUIDs instead of aliases
3. Tracking workspace schema version to detect when migration is needed

Unlike simple data format changes, this migration involves **creating new entities**, which cannot be handled by Repository-layer implicit migration. An explicit migration workflow is required.

Additionally, since mm is used across multiple devices with Git sync, we must ensure users migrate on only one device after syncing all changes, to avoid conflicts.

### User Story
**As a mm user, I want to be notified when my workspace needs migration and safely execute it, so that I can upgrade to the latest schema version without data conflicts.**

### Acceptance Criteria

#### 1. Workspace Version Tracking
- [ ] **Given** a workspace exists, **When** you check workspace.json, **Then** it contains an `mm_version` field (e.g., "0.2.0")
- [ ] **Given** a new workspace is created, **When** initialization completes, **Then** workspace.json has the current mm version
- [ ] **Given** migration completes successfully, **When** workspace.json is updated, **Then** `mm_version` is set to the current mm version

#### 2. Auto-detection on Command Execution
- [ ] **Given** workspace.json has an older `mm_version`, **When** you run any mm command (e.g., `mm ls`), **Then** a warning is displayed: "Workspace schema version is outdated (X.X.X → Y.Y.Y). Migration required. Run: mm doctor migrate schema"
- [ ] **Given** workspace.json has the current version, **When** you run mm commands, **Then** no warning is displayed
- [ ] **Given** workspace.json has no `mm_version` field, **When** you run mm commands, **Then** it is treated as outdated and warning is shown

#### 3. Repository-level Schema Detection
- [ ] **Given** an item has `mm.item.frontmatter/3` with alias strings in `contexts`, **When** Repository tries to load it, **Then** an error is returned: "Outdated item schema detected. Run: mm doctor migrate schema"
- [ ] **Given** workspace version is up-to-date but an old-format item is found, **When** loading that item, **Then** migration warning is shown (catches files that were missed or added from old branches)

#### 4. Migration Command - Pre-checks
- [ ] **Given** you run `mm doctor migrate schema`, **When** command starts, **Then** it scans all items and reports: "Found X items requiring migration"
- [ ] **Given** Git repository exists, **When** migration command runs, **Then** it checks for uncommitted changes and unpushed commits
- [ ] **Given** uncommitted changes exist, **When** migration starts, **Then** warning is shown: "⚠️  Uncommitted changes detected. Commit them before migrating."
- [ ] **Given** unpushed commits exist, **When** migration starts, **Then** warning is shown: "⚠️  Unpushed commits detected. Push them before migrating."
- [ ] **Given** workspace is clean, **When** pre-checks complete, **Then** message is shown: "✓ Git working directory clean"

#### 5. Migration Command - Confirmation
- [ ] **Given** pre-checks pass, **When** migration is about to start, **Then** user is prompted: "This will: 1) Create X permanent items for tags, 2) Update Y item frontmatter. ⚠️ Run on ONE device only. Continue? [y/N]"
- [ ] **Given** user inputs 'N' or anything other than 'y', **When** prompt is answered, **Then** migration is cancelled
- [ ] **Given** user inputs 'y', **When** prompt is answered, **Then** migration proceeds

#### 6. Permanent Item Creation
- [ ] **Given** items have `contexts: [alpha, beta]` as tag strings, **When** migration scans items, **Then** it collects all unique tags (alpha, beta, ...)
- [ ] **Given** tags are collected, **When** migration creates permanent items, **Then** each tag becomes a permanent item with icon "topic" and placement "permanent:"
- [ ] **Given** a tag already has a permanent item with that alias, **When** checking for creation, **Then** it is skipped (not created again)
- [ ] **Given** permanent items are being created, **When** progress is shown, **Then** it displays: "Creating permanent items... (X/Y)"

#### 7. Frontmatter Update
- [ ] **Given** an item has `project: alpha` (alias string), **When** migration updates it, **Then** `project` is replaced with the UUID of the permanent item with alias "alpha"
- [ ] **Given** an item has `contexts: [alpha, beta]`, **When** migration updates it, **Then** `contexts` is replaced with `[<uuid-alpha>, <uuid-beta>]`
- [ ] **Given** an item has `project: <uuid>` (already UUID), **When** migration processes it, **Then** it is unchanged
- [ ] **Given** items are being updated, **When** progress is shown, **Then** it displays: "Updating item frontmatter... (X/Y)"
- [ ] **Given** an item is updated, **When** writing to disk, **Then** `schema` is set to `mm.item.frontmatter/4` (new version)

#### 8. Dry-run Mode
- [ ] **Given** you want to preview changes, **When** you run `mm doctor migrate schema --dry-run`, **Then** all checks and scans are performed without making changes
- [ ] **Given** dry-run mode, **When** showing results, **Then** output includes: "Will create X permanent items", "Will update Y items", "Run without --dry-run to apply"
- [ ] **Given** dry-run mode, **When** command completes, **Then** workspace.json and item files are unchanged

#### 9. Error Handling
- [ ] **Given** a tag cannot be resolved to a permanent item, **When** migration runs, **Then** an error is reported with the item path and tag name
- [ ] **Given** some items have errors, **When** migration completes, **Then** detailed errors are shown for the first 10, with summary if more exist
- [ ] **Given** errors occurred, **When** migration ends, **Then** exit code is 1 and workspace.json version is NOT updated
- [ ] **Given** migration fails partway, **When** resuming, **Then** already-created permanent items are skipped (idempotent)

#### 10. Multi-device Safety
- [ ] **Given** migration prompt is shown, **When** user sees the message, **Then** it includes: "⚠️ Before migrating: Commit all local changes, Push to remote (if using Git sync), Run on ONE device only to avoid conflicts"

### Example Output

#### Auto-detection Warning
```bash
$ mm ls
Warning: Workspace schema version is outdated (0.1.0 → 0.2.0)
Migration required. Run: mm doctor migrate schema

# ... normal ls output continues ...
```

#### Migration Command - Dry Run
```bash
$ mm doctor migrate schema --dry-run
Running in dry-run mode (no changes will be made)

Checking workspace for outdated schemas...
Found 1,234 items requiring migration

Analysis Results:
  - Will create 50 permanent items for tags:
    • alpha-project
    • beta-context
    • gamma-task
    ... (47 more)

  - Will update 1,234 item frontmatter files
    • 800 items with contexts fields
    • 450 items with project fields
    • 16 items with both

Run without --dry-run to apply the migration.
```

#### Migration Command - Full Execution
```bash
$ mm doctor migrate schema
Checking workspace for outdated schemas...
Found 1,234 items requiring migration

Checking Git status...
✓ No uncommitted changes
✓ No unpushed commits
✓ Working directory clean

This will:
  1. Create 50 permanent items for tags
  2. Update 1,234 item frontmatter files
  3. Update workspace.json version: 0.1.0 → 0.2.0

⚠️  Before migrating:
  - Commit all local changes
  - Push to remote (if using Git sync)
  - Run on ONE device only to avoid conflicts

Continue? [y/N] y

Creating permanent items... (50/50)
✓ Created permanent items

Updating item frontmatter... (1,234/1,234)
✓ Updated item frontmatter

Updating workspace.json version: 0.1.0 → 0.2.0
✓ Updated workspace version

✓ Migration completed successfully

Next steps:
  - Commit the changes: git add -A && git commit -m "chore: migrate to schema v4"
  - Push to remote: git push
```

#### Migration Command - With Git Warnings
```bash
$ mm doctor migrate schema
Checking workspace for outdated schemas...
Found 150 items requiring migration

Checking Git status...
⚠️  Uncommitted changes detected:
  modified:   items/2024/01/15/abc123.md
  modified:   items/2024/01/16/def456.md

⚠️  Unpushed commits detected:
  Your branch is ahead of 'origin/main' by 3 commits

Please commit and push your changes before migrating.
This ensures no conflicts occur during multi-device sync.

Aborting migration.
```

#### Repository-level Error Detection
```bash
$ mm ls
Error: Outdated item schema detected
  File: items/2024/01/15/abc123.md
  Issue: Item has mm.item.frontmatter/3 with alias strings in contexts field

Run: mm doctor migrate schema

$ mm doctor migrate schema
# ... proceeds with migration ...
```

### Verification Approach
- CLI command execution with test workspace
- Create fixtures with old-format items
- Test Git status checks with temporary git repo
- Verify permanent items are created correctly
- Verify `mm ls` works after migration
- E2E test scenario covering main criteria

### Out of Scope
- Backward migration (new → old format) - users should use Git to revert if needed
- Automatic migration without user confirmation - too risky for multi-device setups
- Migration of other schema types beyond `mm.item.frontmatter` - will be added when needed
- Handling of merge conflicts during migration - users must ensure clean state before migrating
- `--force` flag to bypass Git checks - safety first

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
- [Items that were concerns but have been resolved]

#### Remaining
- Consider adding `mm doctor check` integration to show current workspace version and schema status
- Consider automatic backup before migration
- Schema version should be bumped to `/4` to reflect the permanent item requirement
- If a user runs migration on device A, then pulls on device B and runs mm commands, device B should detect the updated workspace.json version and not show warnings
