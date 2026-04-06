---
status: completed
depends:
  - story_define-remaining-workflow-migration-plan
  - story_define-create-item-application-api
  - story_define-list-items-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Item Status And Remove Application APIs

**Role**: This story defines the thin batch-mutation lane for migrating `change_item_status` and
`remove_item` into `application/use_cases`.

## Story Log

### Goal

Define shared application APIs for status changes and item removal, and migrate CLI
`close`/`reopen`/`remove` to call `application/use_cases` instead of importing
`src/domain/workflows/change_item_status.ts` and `src/domain/workflows/remove_item.ts` directly.

### Why

After classifying the remaining adapter-facing workflows, `change_item_status` and `remove_item`
form a natural parallel lane next to `edit_item`:

- both are adapter-facing shared mutations
- both are batch-oriented and structurally thinner than `edit_item`
- both already return partial-success results that fit a structured application contract well
- neither requires the deeper directory/date/rank decisions that still make `move_item` and
  `snooze_item` better follow-up stories

### User Story

**As a client adapter developer, I want shared application APIs for status changes and item
removal, so that CLI and JSON-RPC can perform these batch mutations through structured contracts
without depending on `domain/workflows`.**

### Acceptance Criteria

#### 1. Shared Batch Mutation APIs

- [ ] **Given** a client wants to close, reopen, or remove items, **When** it calls the shared
      application APIs, **Then** it can submit typed requests and receive structured partial-success
      results without using CLI-only parsing or output modules
- [ ] **Given** some item locators resolve and others fail, **When** the APIs return, **Then**
      adapters receive a structured `succeeded` / `failed` shape they can map independently

#### 2. Boundary Clarification

- [ ] **Given** `application/use_cases` is the adapter-facing boundary, **When**
      `change_item_status` and `remove_item` are migrated, **Then** CLI `close`, `reopen`, and
      `remove` import the application APIs rather than the workflow modules
- [ ] **Given** the migration is complete, **When** implementation ownership is inspected, **Then**
      the reusable orchestration lives in `application/use_cases`, not coarse `domain/workflows`
      modules

#### 3. Behavior Preservation

- [ ] **Given** current close/reopen/remove semantics, **When** the application APIs are
      introduced, **Then** batch execution, idempotent status changes, locator resolution, and
      not-found/ambiguous-prefix handling remain compatible
- [ ] **Given** validation or repository failures occur, **When** the shared APIs execute, **Then**
      they return structured errors that CLI and JSON-RPC can map independently

### Out Of Scope

- Migrating `edit_item`, `move_item`, or `snooze_item` in the same story
- Refactoring sync or workspace bootstrap workflows
- Implementing the full JSON-RPC transport

---

### Completed Work Summary

### Refactoring
**Status: Not Started**

### Verification
**Status: Pending**

### Acceptance Checks

**Status: Pending Product Owner Review**

### Follow-ups / Open Risks

- deciding whether `change_item_status` and `remove_item` should remain in one story through
  implementation or split again if the application API shapes diverge more than expected
