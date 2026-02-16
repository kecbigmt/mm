## Story Log

### Goal
Add schema migration command that auto-creates permanent items for alias strings in item frontmatter and updates workspace to the latest schema version.

### Why
The permanent-notes-project-context feature introduced a breaking change: `project` and `contexts` fields must now reference permanent item UUIDs instead of alias/tag strings. This requires:
1. Creating new permanent items for all unique aliases found in item `contexts`/`project` fields
2. Updating all item frontmatter to use UUIDs instead of aliases, bumping schema to `mm.item.frontmatter/4`
3. Bumping workspace schema from `mm.workspace/1` to `/2` to track migration completion

Unlike simple data format changes, this migration involves **creating new entities**, which cannot be handled by Repository-layer implicit migration. An explicit migration workflow is required.

Additionally, since mm is used across multiple devices with Git sync, we must ensure users migrate on only one device after syncing all changes, to avoid conflicts.

### User Story
**As a mm user, I want to be blocked from using an outdated workspace and safely execute migration, so that I can upgrade to the latest schema version without data conflicts.**

### Acceptance Criteria

#### 1. Workspace Schema Version Tracking
- [ ] **Given** a workspace exists, **When** you check workspace.json, **Then** it contains `schema: "mm.workspace/2"` after migration
- [ ] **Given** a new workspace is created, **When** initialization completes, **Then** workspace.json has `schema: "mm.workspace/2"`
- [ ] **Given** migration completes successfully, **When** workspace.json is updated, **Then** `schema` is set to `"mm.workspace/2"`

#### 2. Workspace-level Schema Detection
- [ ] **Given** workspace.json has `schema: "mm.workspace/1"`, **When** you run any mm command (e.g., `mm ls`), **Then** command is blocked with error: "Outdated workspace schema (mm.workspace/1). Run: mm doctor migrate"
- [ ] **Given** workspace.json has `schema: "mm.workspace/2"`, **When** you run mm commands, **Then** no error is raised
- [ ] **Given** workspace schema is outdated, **When** you run `mm doctor migrate`, **Then** the command is NOT blocked (exception to the rule)

#### 3. Item-level Schema Detection
- [ ] **Given** an item has `mm.item.frontmatter/3` with alias strings in `contexts` or `project`, **When** Repository tries to load it, **Then** an error is returned: "Outdated item schema detected. Run: mm doctor migrate"
- [ ] **Given** workspace schema is `mm.workspace/2` but an old-format item is found, **When** loading that item, **Then** error is returned (catches files that were missed or added from old branches)

#### 4. Migration Command - Pre-checks
- [ ] **Given** you run `mm doctor migrate`, **When** command starts, **Then** it scans all items and reports: "Found X items requiring migration"
- [ ] **Given** Git repository exists, **When** migration command runs, **Then** it checks for uncommitted changes and unpushed commits
- [ ] **Given** uncommitted changes exist, **When** migration starts, **Then** error is shown: "Uncommitted changes detected. Commit them before migrating." and migration aborts
- [ ] **Given** unpushed commits exist, **When** migration starts, **Then** error is shown: "Unpushed commits detected. Push them before migrating." and migration aborts
- [ ] **Given** workspace is clean, **When** pre-checks complete, **Then** message is shown: "Git working directory clean"

#### 5. Migration Command - Confirmation
- [ ] **Given** pre-checks pass, **When** migration is about to start, **Then** user is prompted: "This will: 1) Create X permanent items for aliases, 2) Update Y item frontmatter, 3) Update workspace schema. Run on ONE device only. Continue? [y/N]"
- [ ] **Given** user inputs 'N' or anything other than 'y', **When** prompt is answered, **Then** migration is cancelled
- [ ] **Given** user inputs 'y', **When** prompt is answered, **Then** migration proceeds

#### 6. Permanent Item Creation
- [ ] **Given** items have `contexts: [alpha, beta]` or `project: gamma` as alias strings, **When** migration scans items, **Then** it collects all unique aliases from `contexts` and `project` fields
- [ ] **Given** aliases are collected, **When** migration creates permanent items, **Then** each alias becomes a permanent item with icon "topic" and placement "permanent:"
- [ ] **Given** an alias already has a permanent item with that alias, **When** checking for creation, **Then** it is skipped (not created again)
- [ ] **Given** permanent items are being created, **When** progress is shown, **Then** it displays: "Creating permanent items... (X/Y)"

#### 7. Frontmatter Update
- [ ] **Given** an item has `project: alpha` (alias string), **When** migration updates it, **Then** `project` is replaced with the UUID of the permanent item with alias "alpha"
- [ ] **Given** an item has `contexts: [alpha, beta]`, **When** migration updates it, **Then** `contexts` is replaced with `[<uuid-alpha>, <uuid-beta>]`
- [ ] **Given** an item has `project: <uuid>` (already UUID), **When** migration processes it, **Then** it is unchanged
- [ ] **Given** items are being updated, **When** progress is shown, **Then** it displays: "Updating item frontmatter... (X/Y)"
- [ ] **Given** any item (with or without contexts/project), **When** migration processes it, **Then** `schema` is set to `mm.item.frontmatter/4`

#### 8. Dry-run Mode
- [ ] **Given** you want to preview changes, **When** you run `mm doctor migrate --dry-run`, **Then** all checks and scans are performed without making changes
- [ ] **Given** dry-run mode, **When** showing results, **Then** output includes: "Will create X permanent items", "Will update Y items", "Run without --dry-run to apply"
- [ ] **Given** dry-run mode, **When** command completes, **Then** workspace.json and item files are unchanged

#### 9. Error Handling
- [ ] **Given** an alias cannot be resolved to a permanent item, **When** migration runs, **Then** an error is reported with the item path and alias name
- [ ] **Given** some items have errors, **When** migration completes, **Then** detailed errors are shown for the first 10, with summary if more exist
- [ ] **Given** errors occurred, **When** migration ends, **Then** exit code is 1 and workspace.json schema is NOT updated
- [ ] **Given** migration fails partway, **When** resuming, **Then** already-created permanent items are skipped (idempotent)

#### 10. Multi-device Safety
- [ ] **Given** migration prompt is shown, **When** user sees the message, **Then** it includes: "Before migrating: Commit all local changes, Push to remote (if using Git sync), Run on ONE device only to avoid conflicts"

### Example Output

#### Workspace-level Error
```bash
$ mm ls
Error: Outdated workspace schema (mm.workspace/1)
Migration required. Run: mm doctor migrate
```

#### Item-level Error
```bash
$ mm ls today
Error: Outdated item schema detected
  File: items/2024/01/15/abc123.md
  Issue: Item has mm.item.frontmatter/3 with alias strings in contexts field

Run: mm doctor migrate
```

#### Migration Command - Dry Run
```bash
$ mm doctor migrate --dry-run
Running in dry-run mode (no changes will be made)

Scanning items...
Found 1,234 items (50 with alias strings requiring conversion)

Analysis Results:
  - Will create 50 permanent items for aliases:
    • alpha-project
    • beta-context
    • gamma-task
    ... (47 more)

  - Will update 1,234 item frontmatter files (schema /3 → /4)
    • 50 items with alias string conversion
    • 1,184 items with schema bump only

Run without --dry-run to apply the migration.
```

#### Migration Command - Full Execution
```bash
$ mm doctor migrate
Scanning items...
Found 1,234 items (50 with alias strings requiring conversion)

Checking Git status...
✓ No uncommitted changes
✓ No unpushed commits
✓ Working directory clean

This will:
  1. Create 50 permanent items for aliases
  2. Update 1,234 item frontmatter files (schema /3 → /4)
  3. Update workspace schema: mm.workspace/1 → /2

⚠️  Before migrating:
  - Commit all local changes
  - Push to remote (if using Git sync)
  - Run on ONE device only to avoid conflicts

Continue? [y/N] y

Creating permanent items... (50/50)
✓ Created permanent items

Updating item frontmatter... (1,234/1,234)
✓ Updated item frontmatter

Updating workspace schema: mm.workspace/1 → /2
✓ Updated workspace schema

✓ Migration completed successfully

Next steps:
  - Commit the changes: git add -A && git commit -m "chore: migrate to schema v4"
  - Push to remote: git push
```

#### Migration Command - With Git Errors
```bash
$ mm doctor migrate
Scanning items...
Found 150 items (20 with alias strings requiring conversion)

Checking Git status...
✗ Uncommitted changes detected:
  modified:   items/2024/01/15/abc123.md
  modified:   items/2024/01/16/def456.md

✗ Unpushed commits detected:
  Your branch is ahead of 'origin/main' by 3 commits

Please commit and push your changes before migrating.
This ensures no conflicts occur during multi-device sync.

Aborting migration.
```

### Verification Approach
- CLI command execution with test workspace
- Create fixtures with old-format items (mm.item.frontmatter/3 with alias strings)
- Test Git status checks with temporary git repo
- Verify permanent items are created correctly
- Verify `mm ls` works after migration
- Verify commands are blocked before migration
- E2E test scenario covering main criteria

### Out of Scope
- Backward migration (new → old format) - users should use Git to revert if needed
- Automatic migration without user confirmation - too risky for multi-device setups
- Migration of other schema types beyond `mm.item.frontmatter` - will be added when needed
- Handling of merge conflicts during migration - users must ensure clean state before migrating
- `--force` flag to bypass Git checks - safety first
- Deletion or migration of `tags/*.tag.json` files - separate story
- Removal of Repository-layer backward compatibility code - separate cleanup after migration is stable

---

### Completed Work Summary

#### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- AC#1 (Workspace Schema Version Tracking): New workspaces get `mm.workspace/2`, migration updates from `/1` to `/2`
- AC#2 (Workspace-level Schema Detection): Commands blocked when schema is `mm.workspace/1`, except `mm doctor migrate`
- AC#3 (Item-level Schema Detection): Old-format items with alias strings fail domain `parseItem` validation
- AC#4 (Pre-checks): Scans items, checks Git for uncommitted/unpushed changes
- AC#5 (Confirmation): Interactive y/N prompt before migration
- AC#6 (Permanent Item Creation): Creates permanent items for unique aliases using `buildTopicItem`/`persistPreparedTopic`
- AC#7 (Frontmatter Update): Replaces alias strings with UUIDs, bumps schema to `mm.item.frontmatter/4`
- AC#8 (Dry-run Mode): `--dry-run` flag performs analysis without changes
- AC#9 (Error Handling): Reports errors with item paths and alias names
- AC#10 (Multi-device Safety): Warning message in confirmation prompt

**Files Created:**
- `src/domain/models/workspace_schema.ts` - Schema version constants
- `src/infrastructure/fileSystem/workspace_schema_reader.ts` - Raw schema reading/writing
- `src/infrastructure/fileSystem/migration_scanner.ts` - Raw item scanning for migration
- `src/domain/workflows/migrate_schema.ts` - Migration workflow logic
- `src/presentation/cli/commands/doctor/migrate.ts` - CLI migrate command
- `tests/e2e/scenarios/scenario_31_schema_migration_test.ts` - E2E tests

**Files Modified:**
- `src/infrastructure/fileSystem/workspace_repository.ts` - Use CURRENT_WORKSPACE_SCHEMA constant
- `src/infrastructure/fileSystem/item_repository.ts` - Use CURRENT_ITEM_SCHEMA constant
- `src/presentation/cli/commands/doctor/mod.ts` - Register migrate command
- `src/domain/services/version_control_service.ts` - Added hasUnpushedCommits
- `src/infrastructure/git/git_client.ts` - Implemented hasUnpushedCommits
- `src/presentation/cli/dependencies.ts` - Added schema check with skipSchemaCheck option
- `src/presentation/cli/commands/list.ts` - Fixed error handling to Deno.exit(1)
- Multiple test files updated for schema /3→/4 and hasUnpushedCommits mock

**Tests:**
- `tests/e2e/scenarios/scenario_31_schema_migration_test.ts`: AC#1, AC#2, AC#7, AC#8, AC#6+7 full migration
- Status: All passing (34 passed, 1 pre-existing failure in completions_test)

**Decisions:**
- Used raw frontmatter scanning (migration_scanner.ts) to read old-format items without domain parsing
- Leveraged existing `buildTopicItem`/`persistPreparedTopic` for permanent item creation
- Schema blocking in `loadCliDependencies` with `skipSchemaCheck` option for migrate command
- Changed `Deno.exit(1)` in list command error path for proper exit codes

**Technical debt:**
- migration_scanner.ts has manual YAML parsing that could use the existing frontmatter module
- migrate.ts CLI command is large (~300 lines) and could be split into smaller functions
- Some duplication between migration_scanner and existing workspace_scanner patterns

**Next:** Refactor

#### Refactoring
**Status: Complete - Ready for Verify**
**Applied:**
- Fix domain/infrastructure layering: Moved pure types (RawItemFrontmatter, RawItemFile, MigrationScanError) and pure functions (looksLikeUuid, itemNeedsAliasMigration, collectAliasStrings, itemNeedsSchemaBump) from infrastructure/migration_scanner.ts to domain/workflows/migrate_schema.ts. Domain no longer imports from infrastructure (loose coupling).
- Eliminate UUID regex duplication: Extracted shared `looksLikeUuid` function and `resolveAliasValue` helper to replace three inline UUID regex patterns in migrateItemFrontmatter (single responsibility, DRY).
- Decompose monolithic CLI command: Split migrate.ts action handler (~300 lines) into focused functions: scanItems, findExistingAliases, buildExistingAliasMap, createPermanentItems, updateItemFrontmatter, reportMigrationErrors (single responsibility).
- Replace ReturnType<typeof ...> with named types (MigrationPlan, MigrationScanResult) in function signatures for clarity.
- Replace complex extracted type for deps parameter in performGitChecks with explicit VersionControlService and CliDependencies types (coupling reduction).
- Extract shared file_walker.ts: Eliminated duplicated walkMarkdownFiles/walkEdgeFiles/walkAliasFiles from workspace_scanner.ts and migration_scanner.ts into a single `walkFiles(dir, suffix)` function (DRY, cohesion).
- Remove unused parseYaml import from E2E test file (lint cleanup).
**Design:** Domain types now live in domain layer; infrastructure imports from domain (correct dependency direction). CLI command decomposed into phases matching workflow structure.
**Quality:** Tests passing (34), Linting clean, Formatting clean
**Next:** Verify

### Verification

**Status: Verified - Ready for Code Review**

**Date:** 2026-02-16

**Test Suite:** All passing (690 passed, 1 pre-existing failure in completions_test.ts)
- New E2E tests: 12 test steps in scenario_31_schema_migration_test.ts - ALL PASS

**Quality Checks:**
- Linting: Clean (269 files checked)
- Formatting: Clean (271 files checked)
- Debug statements: None (all console output is legitimate presentation layer)
- TODOs: All contextualized

**Acceptance Criteria Verification:**

**AC#1 (Workspace Schema Version Tracking): PASS**
- E2E test confirms new workspaces get `mm.workspace/2`
- Migration updates workspace.json from /1 to /2
- Evidence: scenario_31_schema_migration_test.ts lines 35-52

**AC#2 (Workspace-level Schema Detection): PASS**
- Commands blocked when schema is /1 with correct error message
- `mm doctor migrate` NOT blocked (skipSchemaCheck option)
- Commands work when schema is /2
- Evidence: dependencies.ts lines 236-247, E2E tests lines 54-78

**AC#3 (Item-level Schema Detection): PASS**
- parseItemId() validates UUID format, rejects alias strings
- Domain parsing fails for old-format items
- Evidence: item_id.ts lines 46-52, item.ts lines 519-524

**AC#4 (Migration Pre-checks): PASS**
- Scans items and reports count
- Checks Git uncommitted changes and unpushed commits
- Shows appropriate messages
- Evidence: migrate.ts performGitChecks() lines 282-332

**AC#5 (Confirmation Prompt): PASS**
- Proper confirmation message with multi-device warning
- Only 'y' proceeds, any other input cancels
- Evidence: migrate.ts lines 334-372

**AC#6 (Permanent Item Creation): PASS**
- E2E test confirms topic items created
- Collects unique aliases, skips existing
- Progress messages shown
- Evidence: E2E test lines 143-185, migrate.ts lines 127-182

**AC#7 (Frontmatter Update): PASS**
- E2E test confirms schema /3 → /4
- Alias strings replaced with UUIDs
- UUIDs unchanged when already present
- Evidence: E2E test lines 80-115, migrate.ts lines 190-226

**AC#8 (Dry-run Mode): PASS**
- --dry-run performs analysis without changes
- Shows "Will create/update" messages
- Evidence: E2E test lines 117-141, migrate.ts lines 252-279

**AC#9 (Error Handling): PASS**
- Errors reported with path and alias name
- First 10 errors shown, summary for more
- Exit code 1 on errors, schema NOT updated
- Idempotency: buildMigrationPlan filters existing aliases
- Evidence: migrate.ts lines 233-248, migrate_schema.ts line 123

**AC#10 (Multi-device Safety): PASS**
- Warning message includes all required text
- Evidence: migrate.ts lines 353-356

**Observations:**
- All 10 acceptance criteria groups verified through E2E tests and code review
- Pre-existing completions_test.ts failure unrelated to this work (bash/zsh unavailable in NixOS)
- Implementation follows domain-driven design principles with proper layering
- Error handling is comprehensive with proper exit codes

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- Schema version bump to `/4` is now in-scope (AC#7)
- Workspace version tracking uses existing `schema` field pattern (`mm.workspace/1` → `/2`) instead of separate `mm_version`
- AC#2 and AC#3 are now consistent (both error, not warning vs error)
- Tag source clarified: only item `contexts`/`project` fields, not `tags/*.tag.json`
- Command name: `mm doctor migrate` (consistent with existing doctor subcommand style)

#### Remaining
- Consider adding `mm doctor check` integration to show current workspace version and schema status
- Consider automatic backup before migration
- If a user runs migration on device A, then pulls on device B and runs mm commands, device B should detect the updated workspace.json schema and work normally
- Plan for `tags/*.tag.json` deprecation/removal in a future story
