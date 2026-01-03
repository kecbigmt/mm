## Story Log

### Goal
Enable creating and listing Items with permanent placement (date-independent).

### Why
This is the foundation for permanent notes (Zettelkasten) and project/context tags (GTD).
Items with `placement: "permanent"` exist outside the date hierarchy and can be referenced
by other Items as projects or contexts.

### User Story
**As a mm user, I want to create notes with permanent placement, so that I can have
date-independent knowledge items that persist across time.**

### Acceptance Criteria

#### 1. Creating Permanent Items
- [ ] **Given** mm is initialized, **When** you run `mm note "Deep Work" --placement permanent`,
      **Then** a note is created with `placement: "permanent"` in frontmatter
- [ ] **Given** mm is initialized, **When** you run `mm note "My Topic" --placement permanent --alias my-topic`,
      **Then** a note is created with permanent placement and the specified alias

#### 2. Listing Permanent Items
- [ ] **Given** permanent Items exist, **When** you run `mm ls permanent`,
      **Then** all Items with permanent placement are listed
- [ ] **Given** no permanent Items exist, **When** you run `mm ls permanent`,
      **Then** an empty list is shown (no error)

#### 3. Physical File Location
- [ ] **Given** a permanent Item is created, **When** you check the file system,
      **Then** the file exists under `items/YYYY/MM/DD/<uuid>.md` based on creation date

#### 4. Error Cases
- [ ] **Given** mm is initialized, **When** you run `mm note "Test" --placement invalid`,
      **Then** an error is shown indicating invalid placement value

### Out of Scope
- ItemIcon `topic` (📌) - will be added in auto-creation story
- `mm mv <item> permanent` - separate story
- `--project` / `--context` options - separate story
- Section support under permanent (`permanent/1`) - future story

---

### Completed Work Summary

#### Phase 1: Domain Model (TDD)
- Added `kind: "permanent"` to `PlacementHead` union type
- Updated `parsePlacement()` to parse "permanent" string
- Updated `serializePlacement()` to serialize permanent placement
- Added `createPermanentPlacement()` helper function
- Added 10 unit tests for permanent placement parsing/serialization
- Fixed exhaustiveness checks in all dependent files:
  - `src/domain/services/cwd_resolution_service.ts`
  - `src/domain/services/placement_display_service.ts`
  - `src/infrastructure/fileSystem/graph_index.ts`
  - `src/infrastructure/fileSystem/index_doctor.ts`
  - `src/infrastructure/fileSystem/index_rebuilder.ts`
  - `src/infrastructure/fileSystem/item_updater.ts`
  - `src/infrastructure/fileSystem/section_query_service.ts`
  - `src/presentation/cli/commands/list.ts`
  - `src/presentation/cli/partitioning/build_partitions.ts`

#### Phase 2: CLI Support
- Added `--placement permanent` option to `mm note` command
- Added validation for invalid placement values
- Added conflict detection for `--parent` and `--placement` together
- Updated path parser to recognize "permanent" as a PathToken
- Updated path resolver to resolve "permanent" to permanent placement
- Added 5 unit tests for path parser permanent token
- Added 5 unit tests for path resolver permanent handling
- Added 3 unit tests for note command with `--placement` option

#### Phase 3: Index Infrastructure
- Added `listPermanentEdges()` function to graph_index.ts
- Added `readPermanentEdge()` function to graph_index.ts
- Updated `queryEdgeReferences()` to handle permanent placement range
- Updated `item_repository.ts` to write permanent edge files to `.index/graph/permanent/`
- Updated `item_repository.ts` to delete permanent edge files when removing items

#### Phase 4: E2E Tests
- Created `tests/e2e/scenarios/scenario_27_permanent_placement_test.ts`
- Tests cover: creating permanent items, listing, error cases, separation from date items

### Acceptance Checks

**Status: Ready for Product Owner Review**

Developer verification completed:
- `mm note "Test" --placement permanent` creates note with `placement: permanent` in frontmatter ✓
- Edge file created at `.index/graph/permanent/<uuid>.edge.json` ✓
- `mm ls permanent` lists only permanent items ✓
- `mm ls permanent` shows "(empty)" when no permanent items ✓
- `mm ls` does not show permanent items (date-based listing) ✓
- Invalid placement value shows error message ✓
- `--parent` and `--placement` together shows conflict error ✓
- All 555 unit tests pass ✓
- All 25 E2E tests pass (2 shell completion tests fail due to missing zsh/bash in CI environment) ✓

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- Index structure: `.index/graph/permanent/<uuid>.edge.json` (flat, no partitioning for now)

#### Remaining
- Pagination for large permanent Item lists (future optimization if needed)
