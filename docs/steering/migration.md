# Schema & Data Migration

**Role**: Design of the workspace migration system — versioning model, step framework, and
operational constraints.

---

## Version Model

`workspace.json` has two version fields:

- **`schema`** (string): File format version of `workspace.json` itself (e.g., `mm.workspace/1`).
  Changes only when the shape of `workspace.json` changes.
- **`migration`** (integer): Data migration gate. Tracks which data transformations have been applied
  to items. Missing field defaults to `1`.

All commands except `mm doctor migrate` are blocked when `migration < CURRENT_MIGRATION_VERSION`.

## Step Framework

Migration steps are chained by version number (1->2->3->...). Each step:

- **Scans** all items to determine what needs transformation
- **Collects external references** that must be resolved before transform (e.g., alias strings that
  need permanent items created)
- **Transforms** each item's frontmatter, given a resolution map of external references

The runner applies steps sequentially. The `migration` field is updated only after all items are
transformed successfully.

## Current Steps

| Step | Description |
|------|-------------|
| 1->2 | Convert alias strings in `project`/`contexts` to permanent item UUIDs; bump item schema `/3` to `/4` |

## Idempotency

Migration is safe to re-run after partial failure:

- Transform passes through already-migrated values (e.g., UUIDs kept as-is)
- External reference creation (permanent items) skips existing aliases
- Migration version updated only on full success

## Multi-device Safety

Workspaces sync via Git. Migration must run on **one device** after all changes are committed and
pushed. Other devices pull the migrated data and are unblocked automatically. The CLI warns about
this in the confirmation prompt.

## Adding a New Step

1. Create `src/infrastructure/fileSystem/migration/steps/v<N>_to_v<N+1>.ts`
2. Register in `steps/mod.ts`
3. Bump `CURRENT_MIGRATION_VERSION` in `workspace_schema.ts`
