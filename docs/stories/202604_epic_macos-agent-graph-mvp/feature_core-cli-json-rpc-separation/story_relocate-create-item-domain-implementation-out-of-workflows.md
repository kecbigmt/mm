---
status: draft
depends:
  - story_define-create-item-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Relocate Create Item Domain Implementation Out Of Workflows

**Role**: This story defines the removal of `domain/workflows` as the implementation home for a
migrated adapter flow.

## Story Log

### Goal

Move the create-item domain implementation out of `src/domain/workflows/create_item.ts` and retire
that module once `application/use_cases/create_item.ts` is established as the public entry point.

### Why

The previous story moved adapter-facing imports to `application/use_cases/create_item.ts`, but the
actual implementation still lives in `domain/workflows/create_item.ts`. That leaves `workflows` as
an internal-but-still-real architectural layer with an outdated name and unclear responsibility. If
`application/use_cases` is the shared adapter boundary, migrated flows should not keep their core
implementation under `domain/workflows`.

### User Story

**As a core maintainer, I want migrated create-item logic to live outside `domain/workflows`, so
that the architecture has one clear adapter boundary and domain implementation modules reflect their
real responsibility.**

### Acceptance Criteria

#### 1. Implementation Relocation

- [ ] **Given** `create_item` has already been migrated to `application/use_cases`, **When** this
      story is completed, **Then** the reusable create-item implementation no longer lives in
      `src/domain/workflows/create_item.ts`
- [ ] **Given** the implementation is moved, **When** application code calls create-item, **Then**
      behavior remains unchanged for note, task, and event creation

#### 2. Workflow Removal For Migrated Flow

- [ ] **Given** CLI and future JSON-RPC clients use the application boundary, **When** create-item
      imports are inspected, **Then** no adapter-facing code imports
      `domain/workflows/create_item.ts`
- [ ] **Given** create-item has a replacement implementation module, **When** the migration is
      complete, **Then** `src/domain/workflows/create_item.ts` is deleted or reduced to zero
      production callers and removed in the same story

#### 3. Test And Module Clarity

- [ ] **Given** create-item tests currently reference the workflow module, **When** the
      implementation is relocated, **Then** tests move with the implementation or are rewritten
      against the new module without losing current coverage
- [ ] **Given** the new implementation home is introduced, **When** a maintainer reads the module
      layout, **Then** it is clear which code is application boundary, which code is domain
      implementation, and which code remains presentation-specific

### Out Of Scope

- Removing every other file under `src/domain/workflows` in the same story
- Changing create-item behavior or DTO shape beyond what relocation requires
- Reworking CLI-side parsing and post-create side effects

---

### Completed Work Summary

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Moved the create-item implementation from `src/domain/workflows/create_item.ts` to
`src/domain/services/create_item.ts` and renamed the execution entry to `CreateItemService`.
Updated the application layer and domain tests to consume the new module, and removed the old
workflow file and colocated workflow test.
**Design:** `application/use_cases/create_item.ts` remains the shared adapter boundary. Domain
orchestration for create-item now sits beside other domain services instead of under `workflows`,
which removes the stale public-layer implication from the module layout.
**Quality:** Targeted service/application/workflow tests passing, lint clean, docs check passed
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Acceptance:** 2026-04-04
- Criterion 1 (Implementation Relocation): PASS - reusable create-item implementation now lives in
  `src/domain/services/create_item.ts`; `src/domain/workflows/create_item.ts` and its test were
  removed
- Criterion 2 (Workflow Removal For Migrated Flow): PASS - application code imports the service
  module; adapter-facing code continues to enter through `application/use_cases/create_item.ts`;
  remaining production callers to the removed workflow module are zero
- Criterion 3 (Test And Module Clarity): PASS - create-item domain tests moved to
  `src/domain/services/create_item_test.ts`, `move_item_test.ts` now imports the new service, and
  `docs/steering/development-workflow.md` points to the new test path

**Tests:** `deno task test:file src/domain/services/create_item_test.ts`,
`deno task test:file src/application/use_cases/create_item_test.ts`,
`deno task test:file src/domain/workflows/move_item_test.ts`, `deno lint`,
`deno task check-docs`
**Notes:** `deno task test` still fails on the existing ANSI-color assertion in
`src/presentation/cli/formatters/list_formatter_test.ts`, unchanged by this story
**Next:** Code Review

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

- targeted verification completed on 2026-04-04; full suite still blocked by the pre-existing
  `list_formatter_test.ts` color assertion failure

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

- choosing the durable home for domain orchestration logic after `workflows` is retired
- deciding whether remaining workflow files should follow the same migration pattern one by one or
  via a broader cleanup story
