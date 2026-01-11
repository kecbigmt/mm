## Story Log

### Goal
Enable moving existing Items to permanent placement using `mm mv <item> permanent`.

### Why
Users need to convert date-bound Items into permanent notes after creation. For example,
a note created during a meeting might later become a permanent reference document.
The `mm mv` command should support "permanent" as a target placement.

### User Story
**As a mm user, I want to move existing Items to permanent placement, so that I can convert
date-bound notes into date-independent permanent notes.**

### Acceptance Criteria

#### 1. Moving to Permanent Placement
- [x] **Given** a date-based Item exists, **When** you run `mm mv <item-ref> permanent`,
      **Then** the Item's placement changes to `permanent` in frontmatter
- [x] **Given** a date-based Item exists, **When** you run `mm mv <item-ref> permanent`,
      **Then** the edge file moves from `.index/graph/dates/<date>/` to `.index/graph/permanent/`
- [x] **Given** a date-based Item exists, **When** you run `mm mv <alias> permanent`,
      **Then** the Item can be referenced by alias and moved successfully

#### 2. Moving from Permanent to Date
- [x] **Given** a permanent Item exists, **When** you run `mm mv <item-ref> 2025-01-15`,
      **Then** the Item's placement changes to that date
- [x] **Given** a permanent Item exists, **When** you run `mm mv <item-ref> today`,
      **Then** the Item's placement changes to today's date

#### 3. Listing After Move
- [x] **Given** an Item was moved to permanent, **When** you run `mm ls permanent`,
      **Then** the moved Item appears in the permanent list
- [x] **Given** an Item was moved to permanent, **When** you run `mm ls` (today),
      **Then** the moved Item does NOT appear in the date list

#### 4. Multiple Items
- [x] **Given** multiple date-based Items exist, **When** you run `mm mv <item1> <item2> permanent`,
      **Then** both Items are moved to permanent placement

#### 5. Error Cases
- [x] **Given** an invalid item reference, **When** you run `mm mv nonexistent permanent`,
      **Then** an error is shown indicating item not found

### Verification Approach
- E2E tests using CLI commands
- Manual verification by running `mm mv` and checking frontmatter/edge files

### Out of Scope
- Moving to permanent with section suffix (`mm mv item permanent/1`) - future story
- Bulk operations with glob patterns
- Undo/revert move operations

---

### Completed Work Summary

#### Infrastructure (already in place from permanent-placement story)
- Path parser already supports "permanent" token
- Path resolver already creates permanent placement from "permanent" path
- Move workflow uses path resolver, so `mm mv <item> permanent` works out of the box

#### Bug Fix: Cross-type Edge Cleanup
- **Issue found**: When moving items between placement types (permanent ↔ date, permanent ↔ item), the old edge file was not being deleted
- **Fix applied**: Added cleanup logic in `src/infrastructure/fileSystem/item_repository.ts`:
  - Delete permanent edge when moving FROM permanent TO date or item
  - Delete parent edge when moving FROM item TO permanent

#### E2E Tests Added
- Created `tests/e2e/scenarios/scenario_28_move_to_permanent_test.ts` with 10 test cases:
  - Moving date-based item to permanent (CLI output verification)
  - Item appears in permanent list after move
  - Edge file moves to permanent directory
  - Moving item by alias reference
  - Moving permanent item to specific date
  - Moving permanent item to today
  - Moved item appears in `mm ls permanent`
  - Moved item does not appear in date-based `mm ls`
  - Moving multiple items to permanent in one command
  - Error handling for non-existent item

### Acceptance Checks

**Status: ✅ Accepted (2026-01-04)**

Developer verification completed:
- `mm mv my-note permanent` successfully moves item to permanent placement ✓
- Item appears in `mm ls permanent` after move ✓
- Item does NOT appear in date-based `mm ls` after move ✓
- `mm mv perm-note 2025-01-15` moves permanent item to specific date ✓
- `mm mv perm-note today` moves permanent item to today ✓
- Item removed from permanent list after moving to date ✓
- `mm mv first second permanent` moves multiple items ✓
- Invalid item reference shows error message ✓
- All 555 unit tests pass ✓
- All 26 E2E tests pass (2 shell completion tests fail due to missing zsh/bash in CI environment) ✓

**Product owner acceptance testing completed. All 9 acceptance criteria verified and passing.**

### Follow-ups / Open Risks

#### Addressed
- Infrastructure from permanent-placement story handles move correctly
- Edge file cleanup when moving between placement types (bug fixed)

#### Remaining
- Moving to permanent with section suffix (`mm mv item permanent/1`) - out of scope for this story
