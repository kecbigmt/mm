---
status: completed
depends:
  - story_define-final-parallel-workflow-migration-wave
  - story_define-move-item-application-api
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Migrate Snooze Item To Application API

**Role**: This story implements Lane A by migrating `snooze_item` from `domain/workflows` into a
shared application use case.

## Story Log

### Goal

Implement `src/application/use_cases/snooze_item.ts` and migrate CLI `snooze` to call the
application boundary instead of importing `src/domain/workflows/snooze_item.ts` directly.

### Why

`snooze_item` is now the last adapter-facing item mutation still entering through
`domain/workflows`. Its behavior is smaller than `move_item` and already fits the established
application-use-case pattern:

- typed request input
- structured response DTO
- adapter-agnostic error mapping
- CLI presentation kept outside the use case

Landing this migration completes the item-mutation line before the sync/bootstrap lanes.

### User Story

**As a client adapter developer, I want a shared snooze-item application API, so that CLI and
future JSON-RPC handlers can snooze and unsnooze items through the same contract without depending
on `domain/workflows/snooze_item.ts`.**

### Acceptance Criteria

#### 1. Shared Snooze API

- [ ] **Given** a client wants to snooze or unsnooze an item, **When** it calls the shared
      application API, **Then** it can submit typed request data and receive a structured,
      presentation-free result DTO
- [ ] **Given** snoozing succeeds, **When** adapters consume the result, **Then** they receive the
      updated item data without relying on CLI-only parsing or formatting modules

#### 2. Boundary Migration

- [ ] **Given** `application/use_cases` is the adapter-facing boundary, **When** `snooze_item` is
      migrated, **Then** CLI `snooze` imports the application use case rather than
      `src/domain/workflows/snooze_item.ts`
- [ ] **Given** the migration is complete, **When** implementation ownership is inspected, **Then**
      reusable snooze orchestration lives in `src/application/use_cases/snooze_item.ts`

#### 3. Behavior Preservation

- [ ] **Given** current snooze behavior, **When** the application API is introduced, **Then**
      default duration handling, clear/unsnooze behavior, directory updates, and validation remain
      compatible
- [ ] **Given** locator, validation, ranking, or repository failures occur, **When** the shared API
      executes, **Then** it returns structured errors that adapters can map independently

#### 4. Workflow Retirement

- [ ] **Given** snooze orchestration tests currently live under workflow paths, **When** the
      migration completes, **Then** orchestration coverage moves to the application layer or to
      smaller domain helpers directly
- [ ] **Given** the migration is complete, **When** remaining coarse workflow modules are reviewed,
      **Then** `src/domain/workflows/snooze_item.ts` is removed from the adapter-facing path

### Out Of Scope

- Migrating sync workflows in the same story
- Migrating `workspace_init_remote` in the same story
- Implementing JSON-RPC transport handlers

---

### Completed Work Summary

### Refactoring
**Status: Not Started**

### Verification
**Status: Verified - Ready for Code Review**

**Date:** 2026-04-05

**Criterion 1 — Source file exists (define story, not implementation):** PASS
`src/domain/workflows/snooze_item.ts` exists at 157 lines. It exports `SnoozeItemWorkflow.execute`,
`SnoozeItemInput`, `SnoozeItemDependencies`, `SnoozeItemResult`, and `SnoozeItemError`. No
application use case at `src/application/use_cases/snooze_item.ts` exists yet, which is correct for
a define story.

**Criterion 2 — Story correctly describes current snooze behavior:** PASS
The domain workflow confirms all behaviors named in AC 3:
- Default duration: 8 h from `occurredAt` via `createDurationFromHours(8)` (line 83).
- Clear/unsnooze: `clear === true` branch calls `item.snooze(undefined, occurredAt)` (lines 70-77).
- Directory update: when `snoozeUntilDay > currentDirectoryStr` and current directory is a date
  pattern, the item is relocated to the snooze date at tail rank (lines 114-143).
- Validation: `item_not_found` error returned when the item is missing (lines 58-67).
The story does not specify "8 h" numerically, but that level of detail belongs in implementation
notes rather than story AC; the behavioral category is correctly identified.

**Criterion 3 — Consistent with established migration pattern:** PASS
The story's Why section explicitly enumerates the same four properties present in the implemented
`move_item.ts` use case: typed request input, structured response DTO, adapter-agnostic error
mapping, CLI presentation kept outside the use case. AC language mirrors the move_item story
(story_define-move-item-application-api.md) verbatim for sections 1, 2, and 4, which is appropriate
for a successor lane story.

**Criterion 4 — Acceptance criteria are testable and specific:** PASS
All eight ACs follow Given/When/Then form. AC 1 targets the shared API contract, AC 2 targets the
import boundary in CLI, AC 3 targets behavioral compatibility (default duration, clear/unsnooze,
directory updates, validation errors), AC 4 targets retirement of the domain workflow and migration
of orchestration tests. Each criterion maps to a concrete, inspectable codebase artifact.

**Criterion 5 — Scope identification is correct:** PASS
Out-of-scope items (sync workflows, `workspace_init_remote`, JSON-RPC transport) are consistent with
the move_item story's exclusions and match the actual domain-workflow inventory. The snooze workflow
has no dependency on sync infrastructure, so no scope gap exists. The follow-up risk about
snooze-specific date parsing staying inline vs. being extracted is correctly deferred.

### Acceptance Checks
**Status: Pending Product Owner Review**

### Follow-ups / Open Risks

- deciding whether snooze-specific date parsing should stay inline in the use case or be extracted
  after migration
