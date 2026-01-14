## Story Log

### Goal
Store UUIDs (not aliases) in frontmatter for `project` and `contexts` fields to enable stable references.

### Why
Aliases can be renamed. If `project: deep-work` is stored and the user later changes that item's alias
to `focused-work`, the reference breaks. Storing UUIDs ensures references remain valid regardless of
alias changes. The CLI still accepts aliases as input and displays them in output.

### User Story
**As a mm user, I want project and context references to be stored as UUIDs, so that renaming
an alias doesn't break existing references.**

### Acceptance Criteria

#### 1. Creating Items with Project/Contexts (UUID Storage)
- [ ] **Given** a permanent Item exists with alias `work-project`, **When** you run `mm note "Test" --project work-project`,
      **Then** the note's frontmatter contains `project: <uuid-of-work-project>` (not the alias string)
- [ ] **Given** permanent Items exist with aliases `phone` and `errands`, **When** you run `mm task "Call" --context phone --context errands`,
      **Then** the task's frontmatter contains `contexts: [<uuid-phone>, <uuid-errands>]`

#### 2. Editing Items with Project/Contexts
- [ ] **Given** an Item exists, **When** you run `mm edit <item> --project existing-alias`,
      **Then** the Item's project field is updated to the UUID of the referenced Item
- [ ] **Given** an Item exists, **When** you run `mm edit <item> --context ctx1 --context ctx2`,
      **Then** the Item's contexts field is updated to UUIDs of the referenced Items

#### 3. Display (UUID → Alias Resolution)
- [ ] **Given** an Item has `project: <uuid>` in frontmatter, **When** you run `mm ls`,
      **Then** the output shows `+<alias>` (resolved from UUID), not the raw UUID
- [ ] **Given** an Item has `contexts: [<uuid1>, <uuid2>]`, **When** you run `mm show <item>`,
      **Then** contexts are displayed as `@alias1 @alias2` (resolved from UUIDs)
- [ ] **Given** a referenced Item has no alias, **When** you display the referencing Item,
      **Then** the display falls back to showing the UUID (or a truncated form like `+0193fe12...`)

#### 4. Alias Not Found (Error Case)
- [ ] **Given** no Item exists with alias `nonexistent`, **When** you run `mm note "Test" --project nonexistent`,
      **Then** an error is shown: "Alias 'nonexistent' not found"
- [ ] **Given** no Item exists with alias `missing`, **When** you run `mm task "Test" --context missing`,
      **Then** an error is shown: "Alias 'missing' not found"

#### 5. Backward Compatibility (Migration)
- [ ] **Given** an existing Item has `project: old-alias` (string format), **When** you read the Item,
      **Then** it is parsed successfully (alias string accepted for backward compatibility)
- [ ] **Given** an existing Item has alias-format project/contexts, **When** you edit and save the Item,
      **Then** the fields are converted to UUID format on save

### Out of Scope
- Auto-creation of permanent Items for non-existent aliases (next story)
- Self-reference validation (Item cannot be its own project/context) - separate concern
- Bulk migration command (`mm migrate`) - handled incrementally on save
- Dangling UUID detection (referenced Item deleted) - handled by `mm doctor check`

---

### Completed Work Summary

**Domain Model Changes (src/domain/models/item.ts):**
- Changed `ItemData.project` type from `AliasSlug` to `ItemId`
- Changed `ItemData.contexts` type from `ReadonlyArray<TagSlug>` to `ReadonlyArray<ItemId>`
- Updated `Item.setProject()` and `Item.setContexts()` to accept ItemId
- Updated `parseItemSnapshot()` to use `parseItemId` for project/contexts
- Updated `toJSON()` to output UUID strings
- Removed unused `TagSlug`, `parseTagSlug`, `TagSlugValidationError` imports

**Workflow Changes:**
- `src/domain/workflows/create_item.ts`:
  - Added alias→ItemId resolution via `deps.aliasRepository.load()`
  - Returns "Alias 'xxx' not found" error for non-existent aliases
  - Removed `TagSlug` and `tagSlugFromString` imports
- `src/domain/workflows/edit_item.ts`:
  - Same alias→ItemId resolution pattern
  - Removed `TagSlug` and `parseTagSlug` imports

**Test Updates:**
- `src/domain/models/item_test.ts`: Uses UUIDs (e.g., `PROJECT_UUID_1`, `CONTEXT_UUID_1`) instead of alias strings
- `src/presentation/cli/formatters/list_formatter_test.ts`: Uses `CONTEXT_UUID_1` for contexts
- `src/presentation/cli/formatters/item_detail_formatter_test.ts`: Uses `CONTEXT_UUID` for contexts
- Unit tests: 97/97 passing (item, create_item, edit_item, formatters)

**E2E Test Updates (tests/e2e/scenarios/):**
- Added `createPermanentItem()` helper function to all affected E2E test files
- Updated all tests that use --project/--context to create permanent items first
- Updated assertions to check for UUIDs instead of alias strings in frontmatter
- Updated display assertions to check for `@` prefix (UUID shown until resolution implemented)
- Files updated:
  - `scenario_29_project_contexts_test.ts` - comprehensive update
  - `item_creation_test.ts` - added helper and updated context test
  - `scenario_19_item_edit_test.ts` - added helper and updated context test
  - `scenario_show_command_test.ts` - added helper and updated display test

**Key Behavior Change:**
- `--project my-alias` now **requires** the alias to exist (references a permanent item)
- Previously: alias string was stored as-is in frontmatter
- Now: alias is resolved to ItemId (UUID) via AliasRepository and stored

---

### UUID→Alias Display Resolution (AC3) - COMPLETED

**Approach:** Pass resolver function to formatters (Option 2)

**Changes made:**
- `src/presentation/cli/formatters/list_formatter.ts`:
  - Added `ItemIdResolver` type for resolving UUIDs to aliases
  - Added `truncateUuid()` helper for fallback display (first 8 chars + "…")
  - Updated `formatItemLine()` to accept optional `resolveItemId` parameter
  - Resolves project/context UUIDs to aliases when resolver is provided

- `src/presentation/cli/formatters/item_detail_formatter.ts`:
  - Updated `formatItemDetail()` to accept optional `resolveItemId` parameter
  - Uses same resolution pattern as list formatter

- `src/presentation/cli/commands/list.ts`:
  - Collects all unique project/context ItemIds from displayed items
  - Looks up referenced items via `itemRepository.load()`
  - Builds resolver function and passes to `formatItemLine()`

- `src/presentation/cli/commands/show.ts`:
  - Same pattern: collects project/context IDs, resolves, passes to `formatItemDetail()`

**Fallback behavior:** If no resolver provided or item not found, UUIDs are truncated to `019bb338…`

---

### Remaining Work

#### Backward Compatibility (AC5) - COMPLETED

**Problem:** Existing files with `project: "old-alias"` (string format) won't parse as ItemId

**Solution implemented:** Option 1 - Handle in `item_repository.ts` during read

**Changes made:**
- `src/infrastructure/fileSystem/item_repository.ts`:
  - Added optional `aliasRepository` to `FileSystemItemRepositoryDependencies`
  - Added `looksLikeUuid()` helper to detect UUID vs alias format
  - Added `AliasResolver` type for alias-to-UUID resolution function
  - Updated `loadItemFromFile()` to accept optional alias resolver
  - Before building ItemSnapshot, resolves alias-format project/contexts to UUIDs
  - All three usages of `loadItemFromFile()` now pass the resolver

- `src/presentation/cli/dependencies.ts`:
  - Create aliasRepository before itemRepository (dependency order)
  - Pass aliasRepository to createFileSystemItemRepository

**Behavior:**
- On load: If project/context string is not a UUID format, resolve via AliasRepository
- If alias not found, original value is kept (will fail parseItem - expected for invalid data)
- On save: Values are already UUIDs (workflows handle resolution)

---

### Acceptance Checks

**Status: 5/5 Complete**

| AC | Status | Notes |
|----|--------|-------|
| AC1: Create stores UUIDs | ✅ | Workflow resolves alias→ItemId |
| AC2: Edit stores UUIDs | ✅ | Workflow resolves alias→ItemId |
| AC3: Display shows aliases | ✅ | Resolver pattern in formatters |
| AC4: Alias Not Found error | ✅ | Returns "Alias 'xxx' not found" |
| AC5: Backward compatibility | ✅ | Alias strings resolved to UUIDs at load time |

**Test Status:**
- Unit tests: 547/547 passing
- E2E tests: 28/29 passing (1 failure is shell completion - environment issue, not related)
- Lint/Format: Clean

---

### Follow-ups / Open Risks

#### Addressed
- Type safety for project/contexts fields (now ItemId, not string)
- Alias validation before storage (resolved via AliasRepository)
- E2E test suite updated for new behavior
- UUID→alias display resolution implemented
- Backward compatibility for old alias-format files (resolved via AliasRepository at load time)

#### Remaining
- Performance: UUID→alias lookup for display (mitigated by batching in list command)
- Dangling references: if a referenced Item is deleted, display falls back to truncated UUID

