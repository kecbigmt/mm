---
status: completed
depends:
  - story_define-remaining-workflow-migration-plan
  - story_define-edit-item-application-api
  - story_define-item-status-and-remove-application-apis
  - story_define-move-item-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Final Parallel Workflow Migration Wave

**Role**: This story defines the final migration wave for the remaining `domain/workflows` modules
now that the adapter-facing application API pattern has stabilized.

## Story Log

### Goal

Define how the remaining coarse workflow modules should be migrated in parallel, including which
ones move into `application/use_cases`, which ones should target another application/runtime
boundary, and how the work should be split into independently shippable lanes.

### Why

The earlier migration plan intentionally kept `move_item`, `snooze_item`, `sync*`, and
`workspace_init_remote` separate because the boundary shape was still emerging. That uncertainty is
now lower:

- `create_item`, `list_items`, `edit_item`, `change_item_status`, `remove_item`, and `move_item`
  established the shared application-use-case pattern
- adapter-facing CLI commands now have a repeatable migration target
- the remaining workflows are few enough that a final parallel wave can be planned explicitly

Without a new plan, the last workflows risk being migrated ad hoc, with inconsistent destination
boundaries or uneven story sizing.

### User Story

**As a core maintainer, I want the final remaining workflow migrations defined as a small set of
parallel lanes, so that the team can finish the CLI/core separation without reopening the boundary
decision on every remaining module.**

### Acceptance Criteria

#### 1. Final Inventory

- [ ] **Given** the current repository state, **When** remaining `src/domain/workflows/*` modules
      are reviewed, **Then** the story names the exact modules still left in that directory after
      the completed item-mutation migrations
- [ ] **Given** completed migrations already removed some adapter-facing workflows, **When** the
      final inventory is written, **Then** it excludes `create_item`, `list_items`, `edit_item`,
      `change_item_status`, `remove_item`, and `move_item`

#### 2. Destination Boundary Per Workflow

- [ ] **Given** not all remaining workflows have the same character, **When** each one is
      classified, **Then** the story records its intended destination boundary, such as
      `application/use_cases`, another application/runtime module, or explicit non-migration
      rationale
- [ ] **Given** `snooze_item` is still adapter-facing item behavior, **When** the target boundary
      is defined, **Then** the story records it as part of the shared application-use-case line
- [ ] **Given** `sync*` and `workspace_init_remote` include repository/runtime orchestration,
      **When** they are classified, **Then** the story records whether they should migrate in this
      final wave and, if so, which non-CLI boundary they should converge on

#### 3. Parallel Lanes

- [ ] **Given** the remaining workflows are small enough to finish in one coordinated wave,
      **When** the plan is finalized, **Then** it defines concrete implementation lanes that can
      proceed in parallel with minimal file overlap
- [ ] **Given** multiple contributors or agents may implement the lanes simultaneously, **When**
      the plan is documented, **Then** it records the expected write scope and verification surface
      for each lane

#### 4. Independent Story Sizing

- [ ] **Given** the final wave should preserve reviewability, **When** each lane is described,
      **Then** it is small enough to verify independently and does not require a monolithic
      migration PR
- [ ] **Given** the migration pattern is already established, **When** follow-up implementation
      stories are named, **Then** they can be opened immediately without further architecture
      discovery

### Out Of Scope

- Implementing the remaining migrations in this story
- Designing the JSON-RPC transport itself
- Refactoring domain services beyond what is needed to define migration boundaries

---

### Completed Work Summary

### Planning Outcome

**Status: Complete - Ready for Verify**

**Applied:** Reviewed all remaining `src/domain/workflows/*` modules and produced the final
migration plan.

#### Final Inventory

Six workflow modules remain after the completed item-mutation migrations:

| Module | Character |
|---|---|
| `snooze_item.ts` | adapter-facing item mutation |
| `sync_pull.ts` | adapter-facing sync operation |
| `sync_push.ts` | adapter-facing sync operation |
| `sync.ts` | thin composition of pull + push |
| `sync_init.ts` | adapter-facing sync bootstrap |
| `workspace_init_remote.ts` | adapter-facing workspace bootstrap |

Excluded from inventory (already migrated): `create_item`, `list_items`, `edit_item`,
`change_item_status`, `remove_item`, `move_item`.

#### Destination Boundary Per Workflow

All six modules are adapter-facing: the CLI imports them directly, violating the boundary rule in
`src/CLAUDE.md`. A future JSON-RPC adapter would also need each of these operations. Therefore all
six converge on `application/use_cases/` — the established adapter-facing entry layer.

- **`snooze_item`** → `application/use_cases/snooze_item.ts`. Follows the item-mutation pattern
  exactly (ItemRepository + RankService deps, typed request/response, Result-based errors).
- **`sync_pull`** → `application/use_cases/sync_pull.ts`. Coordinates WorkspaceRepository +
  VersionControlService; returns structured validation errors.
- **`sync_push`** → `application/use_cases/sync_push.ts`. Same shape as sync_pull.
- **`sync_init`** → `application/use_cases/sync_init.ts`. Heavier bootstrap flow but still
  adapter-facing with typed input and Result errors.
- **`sync.ts`** → drop. The CLI default sync action already composes pull + push directly with
  index rebuild in between. The thin `SyncWorkflow` composition adds no reusable value as a use
  case and should not be migrated as a first-class application API.
- **`workspace_init_remote`** → `application/use_cases/init_remote_workspace.ts`. Bootstrap flow
  that coordinates clone, config, and cleanup.

No separate `application/orchestration` module is needed. The use-case abstraction is broad enough
to accommodate both item mutations and sync/bootstrap flows without forcing a premature split.

#### Parallel Lanes

Three lanes with zero file overlap:

**Lane A — snooze_item** (independent)
- Write scope: `application/use_cases/snooze_item.ts` (new), `presentation/cli/commands/snooze.ts`
  (update import), `domain/workflows/snooze_item.ts` (remove after migration)
- Verification: `application/use_cases/snooze_item_test.ts`, existing snooze e2e tests
- Character: identical to the move_item migration; smallest lane

**Lane B — sync operations** (independent)
- Write scope: `application/use_cases/sync_pull.ts`, `sync_push.ts`, `sync_init.ts` (all new),
  `presentation/cli/commands/sync.ts` (update imports), `domain/workflows/sync*.ts` (remove after
  migration)
- Verification: `application/use_cases/sync_*_test.ts`, existing sync e2e tests
- Note: the CLI command retains infrastructure-specific logic (index rebuild after pull, sync state
  reset, temp dir cleanup) — those stay in presentation, not in the use case
- Note: the thin `domain/workflows/sync.ts` composition is dropped; the CLI already calls pull and
  push separately with index rebuild in between

**Lane C — workspace_init_remote** (independent)
- Write scope: `application/use_cases/init_remote_workspace.ts` (new),
  `presentation/cli/commands/workspace.ts` (update import),
  `domain/workflows/workspace_init_remote.ts` (remove after migration)
- Verification: `application/use_cases/init_remote_workspace_test.ts`, existing workspace e2e tests
- Note: the CLI command also has local-mode init (no workflow involved) — that path is unaffected

All three lanes touch disjoint sets of files and can proceed fully in parallel.

#### Follow-up Implementation Stories

| Story | Lane | Size |
|---|---|---|
| `story_migrate-snooze-item-to-application-api` | A | small — single item mutation, pattern established |
| `story_migrate-sync-operations-to-application-api` | B | medium — 3 workflows + CLI command with infra logic |
| `story_migrate-workspace-init-remote-to-application-api` | C | small — single bootstrap flow |

Each story can be opened and implemented immediately without further architecture discovery. The
established request/response, DTO, and error-mapping patterns from `edit_item`, `move_item`, etc.
apply directly.

### Refactoring
**Status: Complete - Ready for Verify**

### Verification
**Status: Verified - Ready for Code Review** **Acceptance:** 2026-04-05
- Criterion 1 (Final Inventory): PASS - six remaining workflow modules were inventoried explicitly
  after the completed item-mutation migrations
- Criterion 2 (Destination Boundary Per Workflow): PASS - all remaining adapter-facing workflows
  were assigned to `application/use_cases`, with `sync.ts` explicitly classified for removal rather
  than migration
- Criterion 3 (Parallel Lanes): PASS - three independent lanes were defined with disjoint write
  scopes
- Criterion 4 (Independent Story Sizing): PASS - follow-up implementation stories are small enough
  to open immediately without further architecture discovery

**Next:** Code Review

### Acceptance Checks
**Status: Pending Product Owner Review**

### Follow-ups / Open Risks

- whether `sync_pull` and `sync_push` use cases should accept `workspaceRoot: string` (matching
  current workflow input) or a typed workspace identifier — can be decided in the Lane B
  implementation story
- coordinating export wiring in `src/application/mod.ts` and `src/application/use_cases/mod.ts`
  when the three lanes land in parallel
