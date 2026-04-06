---
status: completed
depends:
  - story_extract-core-runtime-composition
  - story_move-path-and-range-parsing-out-of-cli
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define List Items Application API

**Role**: This story defines the first shared use-case API that adapters can call through the new
core boundary.

## Story Log

### Goal

Define a shared application-facing API for listing items, with orchestration owned by
`application/use_cases`, including DTOs and structured errors.

### Why

After runtime wiring and parsing are decoupled from CLI, the first reusable use case should be
`list items`. It is read-only, already central to the product, and exercises workspace, directory,
and filtering behavior without bringing in mutation complexity.

The initial implementation exposed an application API but still delegated orchestration to
`src/domain/workflows/list_items.ts`. That established the public boundary but not the final code
placement. Following the corrected create-item direction, `list_items` should also keep use-case
orchestration in `application/use_cases`, leaving only smaller domain-specific helpers under
`domain`.

### User Story

**As a client adapter developer, I want a shared list-items application API, so that CLI and
JSON-RPC can retrieve the same results through a structured core interface.**

### Acceptance Criteria

#### 1. Shared Use Case

- [ ] **Given** a workspace and current directory, **When** a client calls the shared list-items
      API, **Then** it can retrieve the same logical results used by the current CLI list flow
- [ ] **Given** the API returns results, **When** adapters consume them, **Then** they receive
      structured DTOs rather than CLI-formatted output
- [ ] **Given** `list_items` has a shared application API, **When** implementation ownership is
      inspected, **Then** the list-items orchestration lives in
      `src/application/use_cases/list_items.ts`

#### 2. Structured Errors

- [ ] **Given** list expression parsing or directory resolution fails, **When** the shared API
      executes, **Then** it returns typed validation errors that adapters can map independently
- [ ] **Given** repository access fails, **When** the shared API executes, **Then** it returns
      structured repository errors without CLI-specific messaging

#### 3. Boundary Clarity

- [ ] **Given** the existing list semantics, **When** the application API is introduced, **Then**
      status filtering, snooze filtering, ordering, and icon filtering remain compatible
- [ ] **Given** list-items orchestration is application-owned, **When** migration is complete,
      **Then** `src/domain/workflows/list_items.ts` is deleted and not retained as a coarse
      orchestration module
- [ ] **Given** list-items tests currently cover workflow behavior, **When** the migration is
      complete, **Then** orchestration tests live in the application layer or target smaller domain
      helpers directly

### Out Of Scope

- Rewiring every list presentation behavior in CLI
- Create/edit/move use cases
- JSON-RPC transport implementation

---

### Completed Work Summary

### Direction Correction

**Status: Applied** **Correction:** The earlier implementation established
`application/use_cases/list_items.ts` as the public API but left orchestration in
`src/domain/workflows/list_items.ts`. That is now treated as an intermediate state, not the target
design. **Updated intent:** This story now targets moving list-items orchestration into
`src/application/use_cases/list_items.ts`, leaving only smaller domain-specific helpers in `domain`.

### Refactoring

**Status: Complete - Ready for Verify** **Applied:** Folded list-items orchestration into
`src/application/use_cases/list_items.ts`, deleted `src/domain/workflows/list_items.ts` and its
test, expanded application-layer tests to cover snooze filtering behavior, and switched the CLI
list command to call the application module instead of the workflow module. **Design:**
`application/use_cases/list_items.ts` is now both the public adapter boundary and the owner of
list-items orchestration. `domain` no longer contains a coarse-grained list-items workflow module.
**Quality:** Targeted tests passing, lint clean **Next:** Verify

### Verification

**Status: Verified - Ready for Code Review** **Acceptance:** 2026-04-04
- Criterion 1 (Shared Use Case): PASS - `src/application/use_cases/list_items.ts` owns
  list-items orchestration and returns the same logical results through structured DTOs
- Criterion 2 (Structured Errors): PASS - parse, resolution, and repository failures still surface
  as `ValidationError<"ListItems"> | RepositoryError` without CLI-specific messaging
- Criterion 3 (Boundary Clarity): PASS - `src/domain/workflows/list_items.ts` and its test were
  removed, snooze-filter orchestration coverage moved to
  `src/application/use_cases/list_items_test.ts`, and the CLI list command now calls the
  application module

**Tests:** `deno task test:file src/application/use_cases/list_items_test.ts`, `deno lint`
**Notes:** full suite still has the pre-existing ANSI-color assertion failure in
`src/presentation/cli/formatters/list_formatter_test.ts`, unchanged by this story
**Next:** Code Review

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

- revised implementation completed and verified on 2026-04-04; full suite still blocked by the
  pre-existing `list_formatter_test.ts` color assertion failure

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed

- none yet

#### Remaining

- deciding the right DTO boundary between application and presentation
- avoiding accidental leakage of CLI formatting concerns into shared API shapes
