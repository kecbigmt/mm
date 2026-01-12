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
- [ ] **Given** mm is initialized, **When** you run `mm note "Meeting notes" --project work-project`,
      **Then** a note is created with `project: work-project` in frontmatter
- [ ] **Given** mm is initialized, **When** you run `mm task "Call John" --context phone`,
      **Then** a task is created with `contexts: [phone]` in frontmatter (YAML block format)
- [ ] **Given** mm is initialized, **When** you run `mm task "Buy supplies" --context errands --context shopping`,
      **Then** a task is created with `contexts: [errands, shopping]` in frontmatter
- [ ] **Given** mm is initialized, **When** you run `mm event "Team standup" --project team-sync --context work`,
      **Then** an event is created with both project and contexts fields

#### 2. Editing Project/Contexts
- [ ] **Given** an Item exists, **When** you run `mm edit <item> --project new-project`,
      **Then** the Item's project field is updated
- [ ] **Given** an Item exists with a project, **When** you open the editor with `mm edit <item>`,
      **Then** you can manually remove the project line from frontmatter to clear it
- [ ] **Given** an Item exists, **When** you run `mm edit <item> --context office`,
      **Then** the Item's contexts field is set to `[office]`
- [ ] **Given** an Item exists, **When** you run `mm edit <item> --context a --context b`,
      **Then** the Item's contexts field is set to `[a, b]` (replaces existing)

#### 3. Display Format
- [ ] **Given** an Item has project and contexts, **When** you run `mm ls`,
      **Then** the output shows `+project` and `@context` suffixes (todo.txt format)
- [ ] **Given** an Item has multiple contexts, **When** you run `mm show <item>`,
      **Then** all contexts are displayed with `@` prefix

#### 4. Migration from Singular Context
- [ ] **Given** an Item exists with old `context: value` field, **When** you read the Item,
      **Then** it is automatically parsed as `contexts: [value]`

#### 5. Error Cases
- [ ] **Given** an invalid alias format, **When** you run `mm note "Test" --project "has spaces"`,
      **Then** an error is shown indicating invalid alias format
- [ ] **Given** an invalid alias format, **When** you run `mm note "Test" --context "bad!char"`,
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

**PR**: #82 (draft)

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- All unit tests pass (439 tests)
- All E2E tests pass (scenario_29_project_contexts_test.ts covers all acceptance criteria)
- CI quality checks pass
- Frontmatter serialization verified (project as string, contexts as YAML array)
- Display format verified (`+project` and `@context` suffixes in todo.txt style)
- Migration from singular `context` to `contexts` array works correctly

**Note**: Current implementation stores alias/tag strings in frontmatter. UUID storage deferred to next increment (see "Remaining" section).

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- [Items that were concerns but have been resolved]

#### Remaining
- **UUID storage for project/contexts** - Frontmatter should store UUIDs (not aliases) for stable references; requires alias→UUID resolution during save
- Auto-creation of permanent Items for non-existent aliases (next story)
- Self-reference validation (Item cannot be its own project/context)

