## Story Log

### Goal
Fix `mm pwd` to properly display permanent placements instead of crashing.

### Why
When cwd is set to `permanent` via `mm cd permanent`, running `mm pwd` crashes because `placementToResolvedGraphPath` doesn't properly handle permanent placements. The current workaround uses a fake "section" segment, but `createResolvedGraphPath` validates that the first segment must be a "date", causing the function to fail. This prevents users from seeing their current working directory when working with permanent items.

### User Story
**As a mm user, I want `mm pwd` to correctly display "permanent" when I'm in the permanent placement, so that I can see my current working directory.**

### Acceptance Criteria

#### 1. Display Permanent Placement
- [x] **Given** cwd is set to `permanent`, **When** you run `mm pwd`, **Then** it displays `/permanent`

#### 2. Permanent Items with Parent Chain
- [x] **Given** an item exists under permanent placement with alias `my-topic`, **When** you run `mm pwd` from that item's placement, **Then** it displays `/permanent/my-topic`
- [x] **Given** an item exists under permanent placement without alias, **When** you run `mm pwd` from that item's placement, **Then** it displays `/permanent/<uuid>`

#### 3. No Regression for Date Placements
- [x] **Given** cwd is set to a date (e.g., `2026-01-21`), **When** you run `mm pwd`, **Then** it displays the date path correctly (e.g., `/2026-01-21`)

### Out of Scope
- Modifying how permanent items are stored
- Adding new CLI commands
- Changes to `mm cd` behavior (already working correctly)
- Section support directly under permanent (`permanent/1`) - future story

---

### Completed Work Summary

#### Implementation (Red-Green)

**Status: Complete - Ready for Verify**

**Implemented:**
- Added `kind: "permanent"` to `ResolvedSegment` union type in `resolved_graph_path.ts`
- Updated `createResolvedGraphPath()` validation to accept both "date" and "permanent" as root
- Updated `formatResolvedGraphPath()` to render "permanent" segment as `/permanent`
- Fixed `placementToResolvedGraphPath()` in `placement_display_service.ts` to use proper permanent segment instead of fake section workaround

**New Files:**
- `src/domain/primitives/resolved_graph_path_test.ts` - Unit tests for permanent segment
- `src/domain/services/placement_display_service_test.ts` - Unit tests for placement display

**Modified Files:**
- `src/domain/primitives/resolved_graph_path.ts` - Added permanent segment type and handling
- `src/domain/services/placement_display_service.ts` - Fixed permanent placement conversion

**Decisions:**
- Kept implementation minimal: only added "permanent" kind to existing discriminated union
- Removed the temporary workaround (fake section with index 0) that was causing the crash

**Tests:**
- 7 new unit tests (2 in resolved_graph_path_test.ts, 5 in placement_display_service_test.ts)
- All 567 unit tests pass
- All 30 E2E tests pass (shell completion tests excluded due to environment)

**Technical debt:**
- None identified - implementation is clean and minimal

#### Refactoring

**Status: Complete - Ready for Verify**

**Applied:** No changes needed - code is already clean

**Review findings:**
- Discriminated union pattern is properly applied
- Single responsibility maintained in both files
- Loose coupling via dependency injection (ItemRepository)
- Minor duplication of section-adding loop (4 lines) is acceptable - extracting would add indirection without improving readability
- Clear naming and good documentation comments
- Tests well-structured with clear section organization

**Quality:** Tests passing (7 new tests), Linting clean, Formatting clean

**Next:** Verify

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance Tests:** 2026-01-21

#### Criterion 1: Display Permanent Placement
- **PASS** - Given cwd is set to `permanent`, When you run `mm pwd`, Then it displays `/permanent`
- Evidence: Manual test confirmed output is exactly `/permanent`

#### Criterion 2: Permanent Items with Alias
- **PASS** - Given an item exists under permanent placement with alias `my-topic`, When you run `mm pwd` from that item's placement, Then it displays `/permanent/my-topic`
- Evidence: Created permanent item with alias, cd to it, pwd returned `/permanent/my-topic`

#### Criterion 3: Permanent Items without Alias
- **PASS** - Given an item exists under permanent placement without alias, When you run `mm pwd` from that item's placement, Then it displays `/permanent/<uuid>`
- Evidence: Created permanent item without alias (ID: tafe-h37), cd to it, pwd returned `/permanent/tafe-h37`

#### Criterion 4: No Regression for Date Placements
- **PASS** - Given cwd is set to a date (e.g., `2026-01-21`), When you run `mm pwd`, Then it displays the date path correctly (e.g., `/2026-01-21`)
- Evidence: Manual test confirmed pwd from date placement returns correct date path

**Test Suite:** All passing (597 tests total)
- Unit tests: All 567 unit tests pass, including 7 new tests for permanent segment handling
- E2E tests: 30 E2E scenarios pass (1 shell completion test expected failure in CI environment)

**Quality Checks:**
- Linting: Clean - no issues found (238 files checked)
- Debug code: None found - all console.log statements are legitimate output
- TODOs: All properly contextualized with TODO: prefix

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- None yet

#### Remaining
- None identified yet
