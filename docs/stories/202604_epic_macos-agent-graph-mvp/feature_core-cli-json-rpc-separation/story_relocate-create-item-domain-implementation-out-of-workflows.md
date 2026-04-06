---
status: completed
depends:
  - story_define-create-item-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Relocate Create Item Implementation Into Application Use Case

**Role**: This story defines the corrected target for a migrated create-item flow: the orchestration
should live in `application/use_cases`, while `domain` keeps only smaller business rules and helper
functions.

## Story Log

### Goal

Move the create-item orchestration logic into `src/application/use_cases/create_item.ts` and retire
`src/domain/workflows/create_item.ts` without replacing it with another coarse-grained domain
orchestration module.

### Why

The previous story moved adapter-facing imports to `application/use_cases/create_item.ts`, but the
actual implementation still lived in `domain/workflows/create_item.ts`. A follow-up relocation into
`domain/services/create_item.ts` improved naming, but the responsibility is still orchestration of
repositories, ID generation, rank assignment, topic auto-creation, and persistence. That is use case
logic, not a narrowly scoped domain service. If `application/use_cases` is the shared adapter
boundary, the create-item orchestration should live there, while `domain` keeps only smaller
business rules and helper functions.

### User Story

**As a core maintainer, I want migrated create-item orchestration to live in the application layer,
so that the architecture has one clear adapter boundary and domain modules only contain genuinely
domain-specific logic.**

### Acceptance Criteria

#### 1. Application-Layer Ownership

- [ ] **Given** `create_item` has already been migrated to `application/use_cases`, **When** this
      story is completed, **Then** the reusable create-item orchestration lives in
      `src/application/use_cases/create_item.ts`
- [ ] **Given** the orchestration is moved, **When** application code calls create-item, **Then**
      behavior remains unchanged for note, task, and event creation

#### 2. Workflow Removal For Migrated Flow

- [ ] **Given** CLI and future JSON-RPC clients use the application boundary, **When** create-item
      imports are inspected, **Then** no adapter-facing code imports
      `domain/workflows/create_item.ts`
- [ ] **Given** create-item no longer needs a workflow module, **When** the migration is complete,
      **Then** `src/domain/workflows/create_item.ts` is deleted and not replaced by another
      coarse-grained `domain/services/create_item.ts`

#### 3. Domain Boundary Clarity

- [ ] **Given** create-item tests currently reference the workflow module, **When** the
      implementation is relocated, **Then** tests move to the application layer or are rewritten
      against smaller domain helpers without losing current coverage
- [ ] **Given** domain logic is still needed for create-item, **When** a maintainer reads the module
      layout, **Then** only small domain-specific helpers remain under `domain`, while use case
      orchestration is clearly owned by `application/use_cases`

### Out Of Scope

- Removing every other file under `src/domain/workflows` in the same story
- Changing create-item behavior or DTO shape beyond what relocation requires
- Reworking CLI-side parsing and post-create side effects

---

### Completed Work Summary

### Direction Correction

**Status: Applied** **Correction:** The earlier relocation from `domain/workflows/create_item.ts` to
`domain/services/create_item.ts` is no longer considered the target design. It removes the
`workflow` name, but it still leaves create-item orchestration in `domain` even though the module
coordinates repositories, ID generation, ranking, topic auto-creation, and persistence. **Updated
intent:** This story now targets moving the orchestration into
`src/application/use_cases/create_item.ts`, leaving only smaller domain-specific helpers in
`domain`.

### Refactoring

**Status: Complete - Ready for Verify** **Applied:** Folded create-item orchestration into
`src/application/use_cases/create_item.ts`, deleted the intermediate
`src/domain/services/create_item.ts` and its test, and updated `move_item_test.ts` to construct
fixtures directly instead of depending on create-item orchestration. Expanded the application-layer
tests so orchestration behavior is exercised there. **Design:**
`application/use_cases/create_item.ts` is now both the public adapter boundary and the owner of
create-item orchestration. `domain` no longer contains a coarse-grained create-item workflow/service
module. **Quality:** Targeted tests passing, lint clean, docs check passed **Next:** Verify

### Verification

**Status: Verified - Ready for Code Review** **Acceptance:** 2026-04-04

- Criterion 1 (Application-Layer Ownership): PASS - create-item orchestration now lives in
  `src/application/use_cases/create_item.ts`, and targeted note/task/event creation behavior remains
  intact
- Criterion 2 (Workflow Removal For Migrated Flow): PASS - `src/domain/workflows/create_item.ts` is
  gone, and there is no replacement `src/domain/services/create_item.ts`; adapter-facing code
  continues through the application layer
- Criterion 3 (Domain Boundary Clarity): PASS - orchestration tests now live in
  `src/application/use_cases/create_item_test.ts`; `move_item_test.ts` no longer depends on
  create-item orchestration; the development workflow doc references the application-layer test path

**Tests:** `deno task test:file src/application/use_cases/create_item_test.ts`,
`deno task test:file src/domain/workflows/move_item_test.ts`, `deno lint`, `deno task check-docs`
**Notes:** `deno task test` still fails on the existing ANSI-color assertion in
`src/presentation/cli/formatters/list_formatter_test.ts`, unchanged by this story **Next:** Code
Review

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

- revised implementation completed and verified on 2026-04-04; full suite still blocked by the
  pre-existing `list_formatter_test.ts` color assertion failure

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

- deciding which helper functions should remain in `domain` once orchestration moves up
- deciding whether remaining workflow files should move directly into `application/use_cases` or be
  retired through a broader cleanup pass
