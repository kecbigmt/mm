---
status: draft
depends:
  - story_define-list-items-application-api
  - story_define-create-item-application-api
  - story_relocate-create-item-domain-implementation-out-of-workflows
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Remaining Workflow Migration Plan

**Role**: This story defines which remaining `domain/workflows` modules should migrate into
`application/use_cases`, in what order, and which ones should stay outside that migration path.

## Story Log

### Goal

Define the migration policy, parallel lanes, and priority order for remaining
`src/domain/workflows/*` modules after `list_items` and `create_item` established
`application/use_cases` as the adapter-facing boundary.

### Why

The direction is now clear for adapter-facing flows: CLI and future JSON-RPC clients should call
`application/use_cases`, and coarse orchestration should not remain under `domain` for migrated
flows. But the remaining workflow modules are mixed in character. Some are natural shared use cases
(`edit_item`, `move_item`, `change_item_status`, `remove_item`, `snooze_item`), while others are
closer to sync/runtime orchestration (`sync*`, `workspace_init_remote`). Trying to migrate all
remaining item workflows in one batch would be too broad, but the adapter-facing set can still be
split into a small number of parallel lanes.

### User Story

**As a core maintainer, I want an explicit plan for the remaining workflow migrations, so that the
next stories can move adapter-facing flows into `application/use_cases` in a few parallel lanes
without mixing in sync or runtime-specific orchestration.**

### Acceptance Criteria

#### 1. Migration Policy

- [ ] **Given** the current architecture direction, **When** the remaining workflow modules are
      reviewed, **Then** the story records a clear rule for which workflows must migrate into
      `application/use_cases`
- [ ] **Given** some workflow modules are not ordinary shared use cases, **When** they are
      classified, **Then** the story records why they should stay out of the current migration track

#### 2. Inventory And Classification

- [ ] **Given** the current `src/domain/workflows/*` modules, **When** they are inventoried,
      **Then** each remaining module is classified at least as one of: migrate next, migrate later,
      or not part of this migration line
- [ ] **Given** the existing migrated flows, **When** the inventory is written, **Then** it does
      not include `list_items` or `create_item` as remaining coarse workflow modules

#### 3. Sequenced Next Stories

- [ ] **Given** the remaining adapter-facing workflows, **When** the plan is finalized, **Then** it
      names the next concrete migration stories and which ones can run in parallel
- [ ] **Given** the migration sequence is documented, **When** future implementation starts,
      **Then** each story can stay small enough to verify independently

### Out Of Scope

- Implementing the remaining workflow migrations
- Moving sync or workspace bootstrap orchestration unless a later story explicitly chooses to
- Refactoring domain helpers that are not part of a workflow-to-use-case boundary change

---

### Completed Work Summary

### Planning Outcome

**Status: Complete - Ready for Verify** **Applied:** Reviewed the remaining `src/domain/workflows/*`
modules and classified them into adapter-facing item mutations versus runtime/sync orchestration.
Defined the next migration lanes as:

- lane 1: `edit_item`
- lane 2: `change_item_status` + `remove_item`
- later lane: `move_item`
- later lane: `snooze_item`
- not part of this migration line: `sync.ts`, `sync_init.ts`, `sync_pull.ts`, `sync_push.ts`,
  `workspace_init_remote.ts`

**Design:** `edit_item` stands alone because it is the heaviest mutation and will set the shape for
typed update DTOs and structured mutation errors. `change_item_status` and `remove_item` are
lighter, batch-oriented mutations and can be advanced in parallel without forcing the more complex
directory/date/rank decisions that still exist in `move_item` and `snooze_item`. **Next:** Verify

### Refactoring
**Status: Complete - Ready for Verify**

### Verification
**Status: Verified - Ready for Code Review** **Acceptance:** 2026-04-04
- Criterion 1 (Migration Policy): PASS - adapter-facing item workflows were separated from
  runtime/sync workflows, and the latter were explicitly excluded from this migration line
- Criterion 2 (Inventory And Classification): PASS - remaining workflow modules were classified as
  migrate now, migrate later, or not part of this line; `list_items` and `create_item` are no
  longer treated as remaining coarse workflows
- Criterion 3 (Sequenced Next Stories): PASS - the next parallel lanes are now defined as
  `edit_item` and `change_item_status` + `remove_item`

**Next:** Code Review

### Acceptance Checks

**Status: Pending Product Owner Review**

### Follow-ups / Open Risks

- deciding whether `move_item` and `snooze_item` should each stay single-story because of their
  directory/date/rank-specific behavior
