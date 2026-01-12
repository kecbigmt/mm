## Story Log

### Goal
Add `project` and `contexts` fields to Items for GTD-style organization.

### Why
GTD workflows require associating tasks with projects and contexts. By adding these fields,
users can organize Items by project (single reference) and contexts (multiple references).
This follows the todo.txt convention: `+project` and `@context`.

### User Story
**As a mm user, I want to assign a project and contexts to my notes and tasks, so that I can
organize my work using GTD-style project and context references.**

### Acceptance Criteria

#### 1. Creating Items with Project/Contexts
- [x] **Given** mm is initialized, **When** you run `mm note "Meeting notes" --project work-project`,
      **Then** a note is created with `project: work-project` in frontmatter
- [x] **Given** mm is initialized, **When** you run `mm task "Call John" --context phone`,
      **Then** a task is created with `contexts: [phone]` in frontmatter (YAML block format)
- [x] **Given** mm is initialized, **When** you run `mm task "Buy supplies" --context errands --context shopping`,
      **Then** a task is created with `contexts: [errands, shopping]` in frontmatter
- [x] **Given** mm is initialized, **When** you run `mm event "Team standup" --project team-sync --context work`,
      **Then** an event is created with both project and contexts fields

#### 2. Editing Project/Contexts
- [x] **Given** an Item exists, **When** you run `mm edit <item> --project new-project`,
      **Then** the Item's project field is updated
- [x] **Given** an Item exists with a project, **When** you open the editor with `mm edit <item>`,
      **Then** you can manually remove the project line from frontmatter to clear it
- [x] **Given** an Item exists, **When** you run `mm edit <item> --context office`,
      **Then** the Item's contexts field is set to `[office]`
- [x] **Given** an Item exists, **When** you run `mm edit <item> --context a --context b`,
      **Then** the Item's contexts field is set to `[a, b]` (replaces existing)

#### 3. Display Format
- [x] **Given** an Item has project and contexts, **When** you run `mm ls`,
      **Then** the output shows `+project` and `@context` suffixes (todo.txt format)
- [x] **Given** an Item has multiple contexts, **When** you run `mm show <item>`,
      **Then** all contexts are displayed with `@` prefix

#### 4. Migration from Singular Context
- [x] **Given** an Item exists with old `context: value` field, **When** you read the Item,
      **Then** it is automatically parsed as `contexts: [value]`

#### 5. Error Cases
- [x] **Given** an invalid alias format, **When** you run `mm note "Test" --project "has spaces"`,
      **Then** an error is shown indicating invalid alias format
- [x] **Given** an invalid alias format, **When** you run `mm note "Test" --context "bad!char"`,
      **Then** an error is shown indicating invalid alias format

### Out of Scope
- **UUID storage in frontmatter** - Currently stores alias/tag strings; next story will store UUIDs for stable references
- Auto-creation of permanent Items when referencing non-existent aliases (next story)
- ItemIcon `topic` (📌) - part of auto-creation story
- Validation that project/context references exist (part of auto-creation story)
- Filtering by project/context in `mm ls` (future work)
- Circular reference detection (handled by `mm doctor check`)

---

### Completed Work Summary
Implementation completed with the following changes:

**Domain Model (`src/domain/models/item.ts`)**:
- Added `project?: AliasSlug` and `contexts?: ReadonlyArray<TagSlug>` fields to ItemData
- Added `setProject()` and `setContexts()` methods
- Migration logic for deprecated singular `context` field → `contexts` array

**Workflows**:
- Updated `create_item.ts` and `edit_item.ts` to handle project/contexts

**CLI Commands**:
- Added `--project <project>` option to note, task, event commands
- Added `-c, --context <context>` repeatable option (with `{ collect: true }`)
- Added same options to edit command

**Display Formatters**:
- Updated `list_formatter.ts` to show `+project` and `@context` suffixes
- Updated `item_detail_formatter.ts` for show command

**Tests**:
- Added E2E test suite: `scenario_29_project_contexts_test.ts` (24 test steps)
- Updated existing tests for `contexts` array format

**Schema**:
- Bumped schema version from `mm.item.frontmatter/2` to `mm.item.frontmatter/3`

**PR**: #82 (draft)

### Acceptance Checks

**Status: Accepted**

All acceptance criteria verified and passing.
Tested on: 2026-01-12

Developer verification completed:
- All unit tests pass (439 tests)
- All E2E tests pass (scenario_29_project_contexts_test.ts covers all acceptance criteria)
- CI quality checks pass
- Frontmatter serialization verified (project as string, contexts as YAML array)
- Display format verified (`+project` and `@context` suffixes in todo.txt style)
- Migration from singular `context` to `contexts` array works correctly

Product owner manual testing completed:
- All 13 acceptance criteria tested and passing
- Creating items with project/contexts works correctly
- Editing project/contexts (set/replace semantics) works correctly
- Display format shows `+project` and `@context` as expected
- Migration from singular `context` field works correctly
- Error cases properly reject invalid alias/tag formats

**Note**: Current implementation stores alias/tag strings in frontmatter. UUID storage deferred to next increment (see "Remaining" section).

### Follow-ups / Open Risks

#### Addressed
- **Schema version bumped to /3** - Updated `mm.item.frontmatter/2` to `mm.item.frontmatter/3` in `item_repository.ts`, tests, and documentation to reflect the addition of `project` and `contexts` fields

#### Remaining
- **UUID storage for project/contexts** - Frontmatter should store UUIDs (not aliases) for stable references; requires alias→UUID resolution during save
- Auto-creation of permanent Items for non-existent aliases (next story)
- Self-reference validation (Item cannot be its own project/context)
- **Add/remove context commands** - Consider `--add-context` and `--remove-context` flags for incremental context editing (current `--context` uses set/replace semantics, which is standard CLI behavior)
- **Remove singular `context` backward compatibility** - Create a migration script (`mm migrate` or similar) to convert all `context: value` fields to `contexts: [value]` in existing Items, then remove the migration logic from `item.ts`

