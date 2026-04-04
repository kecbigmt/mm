---
status: draft
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

Define a shared application-facing API for listing items, including DTOs and structured errors.

### Why

After runtime wiring and parsing are decoupled from CLI, the first reusable use case should be
`list items`. It is read-only, already central to the product, and exercises workspace, directory,
and filtering behavior without bringing in mutation complexity.

### User Story

**As a client adapter developer, I want a shared list-items application API, so that CLI and
JSON-RPC can retrieve the same results through a structured core interface.**

### Acceptance Criteria

#### 1. Shared Use Case

- [ ] **Given** a workspace and current directory, **When** a client calls the shared list-items
      API, **Then** it can retrieve the same logical results used by the current CLI list flow
- [ ] **Given** the API returns results, **When** adapters consume them, **Then** they receive
      structured DTOs rather than CLI-formatted output

#### 2. Structured Errors

- [ ] **Given** list expression parsing or directory resolution fails, **When** the shared API
      executes, **Then** it returns typed validation errors that adapters can map independently
- [ ] **Given** repository access fails, **When** the shared API executes, **Then** it returns
      structured repository errors without CLI-specific messaging

#### 3. Compatibility

- [ ] **Given** the existing list semantics, **When** the application API is introduced, **Then**
      status filtering, snooze filtering, ordering, and icon filtering remain compatible

### Out Of Scope

- Rewiring every list presentation behavior in CLI
- Create/edit/move use cases
- JSON-RPC transport implementation

---

### Completed Work Summary

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Reviewed list_items.ts use case. No changes needed -- explicit field mapping between
request DTO and workflow input is the correct pattern for an application boundary layer.
**Quality:** Tests passing (703), Linting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Acceptance:** 2026-04-04
- Criterion 1 (Shared Use Case): PASS - `src/application/use_cases/list_items.ts` exposes `listItems(request, deps)` returning the same logical results as the CLI list flow via `ListItemsWorkflow.execute`; adapters receive `ListItemsResponse` with structured `ListItemDto` array, not formatted strings
- Criterion 2 (Structured Errors): PASS - `ListItemsApplicationError = ValidationError<"ListItems"> | RepositoryError`; parse and repository failures propagate as typed errors without CLI-specific messaging
- Criterion 3 (Compatibility): PASS - `ListItemsRequest` includes `status` (maps to `ListItemsStatusFilter`), `icon` (maps to `ItemIconValue`), `expression` (path/range expression), and `timezone`/`today` for snooze/ordering; all filtering semantics pass through unchanged to `ListItemsWorkflow`

**Tests:** All passing (703)
**Quality:** Linting clean, no debug output, no bare TODOs
**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed

- none yet

#### Remaining

- deciding the right DTO boundary between application and presentation
- avoiding accidental leakage of CLI formatting concerns into shared API shapes
