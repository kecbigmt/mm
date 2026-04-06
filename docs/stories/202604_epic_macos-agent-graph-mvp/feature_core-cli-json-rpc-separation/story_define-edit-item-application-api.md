---
status: completed
depends:
  - story_define-create-item-application-api
  - story_relocate-create-item-domain-implementation-out-of-workflows
  - story_define-list-items-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Edit Item Application API

**Role**: This story defines the primary mutation lane for migrating `edit_item` into
`application/use_cases`, establishing it as a shared use case instead of a CLI import of
`domain/workflows`.

## Story Log

### Goal

Define a shared edit-item application API and migrate CLI `edit` to call
`src/application/use_cases/edit_item.ts` instead of importing `src/domain/workflows/edit_item.ts`
directly.

### Why

After reviewing the remaining `src/domain/workflows/*` modules, the adapter-facing migration targets
were grouped into lanes:

- lane 1: `edit_item`
- lane 2: `change_item_status` + `remove_item`
- later lane: `move_item`
- later lane: `snooze_item`

The following modules are not the next migration targets for this line because they are closer to
runtime, Git, or workspace bootstrap orchestration than to shared item use cases:

- `sync.ts`
- `sync_init.ts`
- `sync_pull.ts`
- `sync_push.ts`
- `workspace_init_remote.ts`

Among these lanes, `edit_item` stands alone because it is the heaviest shared mutation and is the
best place to set the application-layer contract for typed field updates, schedule parsing inputs,
alias/project/context handling, topic auto-creation, and adapter-agnostic error mapping. Keeping it
separate from the thinner batch-mutation lane avoids turning one implementation story into a broad
multi-command refactor.

### User Story

**As a client adapter developer, I want a shared edit-item application API, so that CLI and
JSON-RPC can update item fields through the same structured contract without depending on
`domain/workflows/edit_item.ts`, while thinner batch mutations progress on a separate lane.**

### Acceptance Criteria

#### 1. Shared Edit API

- [ ] **Given** a client wants to edit an item, **When** it calls the shared edit-item API,
      **Then** it can submit typed input DTOs for supported field updates and receive a structured
      result DTO without using CLI-only parsing or output modules
- [ ] **Given** item editing succeeds, **When** adapters consume the result, **Then** they receive
      presentation-free data for the updated item and any auto-created topics

#### 2. Boundary Clarification

- [ ] **Given** `application/use_cases` is the adapter-facing boundary, **When** `edit_item` is
      migrated, **Then** CLI and future JSON-RPC code import the application use case rather than
      `src/domain/workflows/edit_item.ts`
- [ ] **Given** the migration is complete, **When** implementation ownership is inspected, **Then**
      the reusable edit-item orchestration lives in `src/application/use_cases/edit_item.ts`
      instead of a coarse-grained `domain/workflows` module

#### 3. Behavior Preservation

- [ ] **Given** current edit semantics, **When** the application API is introduced, **Then** title,
      icon, body, due/start scheduling inputs, alias changes, project/context updates, and topic
      auto-creation remain compatible
- [ ] **Given** validation, locator, or repository failures occur, **When** the shared API
      executes, **Then** it returns structured errors that CLI and JSON-RPC can map independently

### Out Of Scope

- Migrating `change_item_status` / `remove_item` from the thin batch-mutation lane in the same story
- Migrating `move_item` or `snooze_item` in the same story
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

- deciding whether topic auto-creation preparation should stay inline in the application use case or
  be split into smaller domain helpers during migration
- choosing whether `move_item` or `snooze_item` should follow after the first two lanes land
