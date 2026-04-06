---
status: completed
depends:
  - story_define-remaining-workflow-migration-plan
  - story_define-create-item-application-api
  - story_define-list-items-application-api
  - story_define-edit-item-application-api
  - story_define-item-status-and-remove-application-apis
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Move Item Application API

**Role**: This story defines the shared move-item application API and the next adapter-facing
workflow migration after edit/status/remove.

## Story Log

### Goal

Define a shared move-item application API and migrate CLI `move` to call
`src/application/use_cases/move_item.ts` instead of importing
`src/domain/workflows/move_item.ts` directly.

### Why

After `edit_item`, `change_item_status`, and `remove_item` moved behind
`application/use_cases`, the remaining adapter-facing item mutation with the highest architectural
weight is `move_item`. Unlike the thinner batch mutations, move semantics still concentrate several
decisions in one place:

- locator resolution for the source item
- path/range interpretation for destination placement
- directory/date constraints
- sibling ordering and rank generation
- adapter-agnostic reporting of the moved item and target placement

Moving this API next keeps the CLI/JSON-RPC boundary consistent while tackling the heaviest
remaining directory/rank mutation before the lighter `snooze_item` lane.

### User Story

**As a client adapter developer, I want a shared move-item application API, so that CLI and
JSON-RPC can relocate items through the same structured contract without depending on
`domain/workflows/move_item.ts`.**

### Acceptance Criteria

#### 1. Shared Move API

- [ ] **Given** a client wants to move an item, **When** it calls the shared move-item API,
      **Then** it can submit typed source/destination input DTOs and receive a structured result DTO
      without using CLI-only parsing or output modules
- [ ] **Given** a move succeeds, **When** adapters consume the result, **Then** they receive
      presentation-free data describing the moved item and its new placement

#### 2. Boundary Clarification

- [ ] **Given** `application/use_cases` is the adapter-facing boundary, **When** `move_item` is
      migrated, **Then** CLI and future JSON-RPC code import the application use case rather than
      `src/domain/workflows/move_item.ts`
- [ ] **Given** the migration is complete, **When** implementation ownership is inspected, **Then**
      reusable move-item orchestration lives in `src/application/use_cases/move_item.ts` instead of
      a coarse `domain/workflows` module

#### 3. Behavior Preservation

- [ ] **Given** current move semantics, **When** the application API is introduced, **Then** source
      resolution, destination resolution, directory/date constraints, and rank placement remain
      compatible
- [ ] **Given** validation, locator, ranking, or repository failures occur, **When** the shared API
      executes, **Then** it returns structured errors that CLI and JSON-RPC can map independently

#### 4. Workflow Retirement

- [ ] **Given** move-item orchestration tests currently live under workflow paths, **When** the
      migration completes, **Then** orchestration coverage moves to the application layer or to
      smaller domain helpers directly
- [ ] **Given** the migration is complete, **When** remaining coarse workflow modules are reviewed,
      **Then** `src/domain/workflows/move_item.ts` is removed from the adapter-facing path

### Out Of Scope

- Migrating `snooze_item` in the same story
- Refactoring sync or workspace bootstrap workflows
- Redesigning move semantics beyond preserving current behavior
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

- deciding whether destination/path parsing should remain partly adapter-owned or move fully into
  the application request contract
- deciding how much rank-placement detail should be exposed in result DTOs versus kept as internal
  orchestration state
- confirming whether `snooze_item` should immediately follow `move_item` or wait until move-related
  placement abstractions are stable
