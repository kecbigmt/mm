# Schema & Data Migration

**Role**: Versioning and migration design for workspace data files.

---

## Per-file Schema Versioning

Every persisted JSON/YAML file carries a `schema` field identifying its format version:

| File | Schema prefix | Example |
|------|---------------|---------|
| `workspace.json` | `mm.workspace/` | `mm.workspace/1` |
| Item frontmatter (YAML) | `mm.item.frontmatter/` | `mm.item.frontmatter/4` |
| `.index/**/*.edge.json` | `mm.edge/` | `mm.edge/1` |
| `.index/**/aliases/*.alias.json` | `mm.alias/` | `mm.alias/2` |
| `tags/*.tag.json` | `mm.tag/` | `mm.tag/1` |

This allows each file type to evolve independently. Parsers can reject unknown versions early.

## Workspace Migration Gate

`workspace.json` has a separate **`migration`** integer field (distinct from `schema`):

- **`schema`**: format version of `workspace.json` itself. Changes when its shape changes.
- **`migration`**: data migration gate. Tracks which bulk transformations have been applied across
  items. Missing field defaults to `1`.

All commands except `mm doctor migrate` are blocked when `migration < CURRENT_MIGRATION_VERSION`.
This ensures users run migration before operating on stale data.

## Step Framework

Migration steps are chained by version number (1->2->3->...). Each step:

- **Scans** all items to determine what needs transformation
- **Collects external references** that must be resolved before transform (e.g., alias strings that
  need permanent items created)
- **Transforms** each item's frontmatter, given a resolution map of external references

The runner applies steps sequentially. The `migration` field is updated only after all items are
transformed successfully. Each step is idempotent — transform passes through already-migrated values,
and external reference creation skips duplicates.

## Adding a New Step

1. Create `src/infrastructure/fileSystem/migration/steps/v<N>_to_v<N+1>.ts`
2. Register in `steps/mod.ts`
3. Bump `CURRENT_MIGRATION_VERSION` in `workspace_schema.ts`
