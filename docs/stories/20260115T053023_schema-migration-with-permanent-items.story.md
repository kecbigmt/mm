## Story Log

### Goal
Add a schema migration command that auto-creates permanent items for alias strings in item frontmatter and updates the workspace to the latest migration version.

### Why
The permanent-notes-project-context feature requires `project` and `contexts` fields to reference permanent item UUIDs instead of alias strings. This migration:
1. Creates permanent items for all unique aliases found in item frontmatter
2. Updates all item frontmatter to use UUIDs, bumping item schema to `mm.item.frontmatter/4`
3. Bumps workspace `migration` version from 1 to 2

Since mm syncs across devices via Git, migration must run on one device after all changes are committed and pushed.

### User Story
**As a mm user, I want to be blocked from using an outdated workspace and safely execute migration, so that I can upgrade without data conflicts.**

### Acceptance Criteria

#### 1. Workspace Migration Version Tracking
- **Given** a new workspace, **Then** workspace.json has `schema: "mm.workspace/1"` and `migration: 2`
- **Given** migration completes, **Then** workspace.json `migration` is set to `2`

#### 2. Workspace-level Migration Detection
- **Given** workspace.json has no `migration` field (defaults to 1), **When** any command runs, **Then** blocked with "Outdated workspace ... Run: mm doctor migrate"
- **Given** `migration: 2`, **Then** commands work normally
- **Given** migration is outdated, **When** `mm doctor migrate` runs, **Then** it is NOT blocked

#### 3. Item-level Schema Detection
- **Given** an item has `mm.item.frontmatter/3` with alias strings, **When** domain parsing loads it, **Then** validation fails

#### 4-5. Pre-checks and Confirmation
- Scans items, checks Git for uncommitted/unpushed changes, prompts y/N before proceeding

#### 6. Permanent Item Creation
- Collects unique aliases from `project`/`contexts` fields, creates permanent items (icon: topic, placement: permanent), skips existing

#### 7. Frontmatter Update
- Replaces alias strings with UUIDs, bumps item schema to `/4`

#### 8. Dry-run Mode
- `--dry-run` performs analysis without changes

#### 9. Error Handling
- Reports errors with item path and alias, exit 1 if errors, migration version NOT updated

#### 10. Multi-device Safety
- Warning in confirmation prompt about single-device migration

### Out of Scope
- Backward migration (use Git revert)
- Automatic migration without confirmation
- `--force` flag to bypass Git checks
- `tags/*.tag.json` cleanup (separate story)

---

### Architecture

**Migration version model:** `workspace.json` has two fields:
- `schema: "mm.workspace/1"` — file format version (unchanged)
- `migration: N` — data migration gate (missing defaults to 1)

Commands are blocked when `migration < CURRENT_MIGRATION_VERSION`. The `mm doctor migrate` command uses `skipSchemaCheck` to bypass this.

**Migration step framework** (`src/infrastructure/fileSystem/migration/`):
- `MigrationStep` interface with `fromMigration`/`toMigration` numbers
- `runner.ts`: `findApplicableSteps` chains steps from current version forward
- `steps/v1_to_v2.ts`: Converts alias strings to UUIDs, bumps item schema /3 to /4

**Key files:**
- `src/infrastructure/fileSystem/workspace_schema.ts` — Schema/migration constants
- `src/infrastructure/fileSystem/workspace_schema_reader.ts` — Read/write migration version
- `src/infrastructure/fileSystem/migration/` — Step framework, scanner, runner
- `src/presentation/cli/commands/doctor/migrate.ts` — CLI command
- `src/presentation/cli/dependencies.ts` — Migration version gate
- `tests/e2e/scenarios/scenario_31_schema_migration_test.ts` — E2E tests

### Completed Work

All 10 acceptance criteria implemented and verified. Tests: 655 unit + 34 E2E passing (1 pre-existing completions_test failure on NixOS).

### Follow-ups
- Consider `mm doctor check` to show current migration status
- Plan `tags/*.tag.json` deprecation in a future story
- Future migrations (e.g., `placement` to `directory` rename) add new steps to the framework
