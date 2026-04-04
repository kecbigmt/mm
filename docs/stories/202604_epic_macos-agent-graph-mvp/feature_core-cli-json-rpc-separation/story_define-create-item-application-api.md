---
status: draft
depends:
  - story_extract-core-runtime-composition
  - story_move-path-and-range-parsing-out-of-cli
  - story_define-list-items-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Create Item Application API

**Role**: This story defines the first mutating shared use-case API and clarifies that adapter entry
points should live in `application/use_cases`, not `domain/workflows`.

## Story Log

### Goal

Define a shared create-item application API for note/task/event creation and retire
`domain/workflows/create_item.ts` as an adapter-facing entry point.

### Why

`list_items` already established `application/use_cases` as the shared adapter boundary, but
creation still enters through CLI commands that parse options, resolve directories, and call
`CreateItemWorkflow` directly. If this pattern continues, the codebase will keep two competing
entry-point layers. The next story should prove the intended architecture on a mutating use case:
adapters call application use cases, while domain code stays focused on pure business rules and
domain-level orchestration helpers.

### User Story

**As a client adapter developer, I want a shared create-item application API, so that CLI and
JSON-RPC can create notes, tasks, and events through the same structured contract without depending
on `domain/workflows`.**

### Acceptance Criteria

#### 1. Shared Create API

- [ ] **Given** a client wants to create a note, task, or event, **When** it calls the shared
      create-item API, **Then** it can submit typed input DTOs and receive structured result DTOs
      without using CLI-only parsing or output modules
- [ ] **Given** item creation succeeds, **When** adapters consume the result, **Then** they receive
      the created item identity and any created-topic information in presentation-free data

#### 2. Boundary Clarification

- [ ] **Given** `application/use_cases` now exists, **When** create-item is migrated, **Then** CLI
      and future JSON-RPC code import the application use case rather than
      `domain/workflows/create_item.ts`
- [ ] **Given** reusable domain logic is still needed, **When** the migration completes, **Then**
      that logic lives in domain services/helpers or private internals, and `domain/workflows` no
      longer acts as the public adapter boundary for migrated flows

#### 3. Behavior Preservation

- [ ] **Given** current `note`, `task`, and `event` creation semantics, **When** the application API
      is introduced, **Then** alias handling, topic auto-creation, schedule parsing inputs, and
      date-consistency validation remain compatible
- [ ] **Given** validation or repository failures occur, **When** the shared API executes, **Then**
      it returns structured errors that CLI and JSON-RPC can map independently

### Out Of Scope

- Auto-commit, pre-pull, editor launch, or other CLI-only side effects after successful creation
- Full JSON-RPC transport implementation
- Migrating every remaining mutating command in the same story

---

### Completed Work Summary

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Added `src/application/use_cases/create_item.ts` as the shared mutating adapter entry
point. Migrated CLI `note`, `task`, and `event` commands to call the application use case instead
of importing `domain/workflows/create_item.ts` directly.
**Design:** The application layer now maps workflow results into presentation-free DTOs and
normalizes errors to `ValidationError<"CreateItem"> | RepositoryError`. CLI keeps option parsing,
console output, editor launch, pre-pull, and auto-commit as adapter-only concerns.
**Quality:** Targeted application and CLI tests passing, lint clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Acceptance:** 2026-04-04
- Criterion 1 (Shared Create API): PASS - `src/application/use_cases/create_item.ts` exposes
  `createItem(request, deps)` for note/task/event creation and returns structured DTOs plus created
  topic aliases without CLI output coupling
- Criterion 2 (Boundary Clarification): PASS - CLI `note`, `task`, and `event` commands now import
  the application use case rather than `domain/workflows/create_item.ts`; migrated adapter entry is
  `application/use_cases`
- Criterion 3 (Behavior Preservation): PASS - alias handling, topic auto-creation, due/start
  scheduling inputs, and event date-consistency validation continue through the same domain logic,
  with errors exposed as shared validation/repository shapes

**Tests:** `deno task test:file src/application/use_cases/create_item_test.ts`,
`deno task test:file src/application/use_cases/list_items_test.ts`,
`deno task test:file src/presentation/cli/commands/note_test.ts src/presentation/cli/commands/task.ts src/presentation/cli/commands/event.ts`
**Quality:** `deno lint` clean on touched files, `deno fmt` applied
**Next:** Code Review

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

- targeted application and CLI verification completed on 2026-04-04

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

- deciding whether `domain/workflows` should disappear entirely or remain only for non-adapter
  internal orchestration during the transition
- deciding how much directory and schedule resolution belongs in application versus thin adapter
  input parsing
