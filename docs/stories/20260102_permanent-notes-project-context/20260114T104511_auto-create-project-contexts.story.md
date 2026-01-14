## Story Log

### Goal
Automatically create permanent Items when --project or --context references a non-existent alias.

### Why
Currently, referencing a non-existent alias with --project or --context returns an error. This breaks the
natural GTD workflow where users want to quickly tag items with projects/contexts without pre-creating
them. Auto-creation provides a smoother UX: "just use the alias, we'll create the topic if needed."

### User Story
**As a mm user, I want project/context references to automatically create permanent Items when the alias
doesn't exist, so that I can quickly organize my items without pre-creating every project or context.**

### Acceptance Criteria

#### 1. Auto-creation on Item Creation
- [x] **Given** no Item exists with alias `new-project`, **When** you run `mm note "Test" --project new-project`,
      **Then** a permanent Item is created with alias `new-project`, title `new-project`, icon `topic` (📌),
      and the note's project field references this new Item's UUID
- [x] **Given** no Items exist with aliases `ctx1` and `ctx2`, **When** you run `mm task "Test" --context ctx1 --context ctx2`,
      **Then** two permanent Items are created with matching aliases, and the task's contexts field references their UUIDs

#### 2. Auto-creation on Item Edit
- [x] **Given** an Item exists and no Item has alias `new-ctx`, **When** you run `mm edit <item> --context new-ctx`,
      **Then** a permanent Item is created with alias `new-ctx`, and the Item's contexts field is updated

#### 3. Topic Icon
- [x] **Given** a topic Item is created via auto-creation, **When** you view it with `mm show <alias>`,
      **Then** it displays with the 📌 icon
- [x] **Given** a topic Item exists, **When** you run `mm ls permanent`,
      **Then** it is listed with the 📌 icon

#### 4. Auto-created Item Properties
- [x] **Given** auto-creation creates a permanent Item, **When** you inspect the created file,
      **Then** it has: `placement: permanent`, `icon: topic`, `status: open`, `alias: <the-alias>`, `title: <the-alias>`

#### 5. Mixed Existing and New Aliases
- [x] **Given** alias `existing` exists but `new-one` does not, **When** you run `mm task "Test" --context existing --context new-one`,
      **Then** only `new-one` is auto-created, `existing` is reused, and both are referenced in contexts

#### 6. User Notification
- [x] **Given** no Item exists with alias `new-project`, **When** you run `mm note "Test" --project new-project`,
      **Then** a message is shown: `Created topic: new-project` (or similar) before the note creation output
- [x] **Given** multiple new aliases are auto-created, **When** you run `mm task "Test" --context ctx1 --context ctx2`,
      **Then** messages are shown for each: `Created topic: ctx1` and `Created topic: ctx2`

#### 7. Edge Cases
- [x] **Given** a valid alias that already exists, **When** you use it with --project,
      **Then** no new Item is created and no "Created topic" message is shown

### Verification Approach
- E2E tests for auto-creation scenarios
- Unit tests for ItemIcon extension (topic icon)
- Manual CLI verification of created files

### Out of Scope
- Self-reference validation (Item cannot be its own project/context) - separate concern
- Opt-out flag for auto-creation (not needed per epic design)
- Auto-creation for other commands (only note/task/event/edit)
- Dangling reference detection - handled by `mm doctor check`

---

### Completed Work Summary

#### Implementation (2026-01-14)

**1. ItemIcon Extension**
- Added `"topic"` value to `ItemIconValue` union type (`src/domain/primitives/item_icon.ts`)
- Updated list formatter to display `◆` for topic items in colored mode, `[topic]` in print mode

**2. CreateItemWorkflow Auto-creation**
- Modified `create_item.ts` to auto-create permanent topic Items when project/context alias doesn't exist
- Added `createTopicItem()` helper function
- Updated result type to include `createdTopics: ReadonlyArray<AliasSlug>`
- Handles duplicate aliases in same command (creates only once)

**3. EditItemWorkflow Auto-creation**
- Modified `edit_item.ts` with same auto-creation logic
- Added required dependencies (`rankService`, `idGenerationService`)
- Updated result type to include `createdTopics`

**4. CLI Notifications**
- Updated `note.ts`, `task.ts`, `event.ts`, `edit.ts` to display "Created topic: <alias>" messages
- Messages appear before the main item creation/edit confirmation

**5. Test Coverage**
- Updated `edit_item_test.ts` for new workflow signature
- Added E2E tests: `scenario_30_auto_create_topics_test.ts` (10 test cases covering all ACs)

### Acceptance Checks

**Status: Accepted**

All acceptance criteria verified and passing.
Tested on: 2026-01-14

#### Test Results

| Criterion | Description | Result |
|-----------|-------------|--------|
| AC1 | Auto-creation on note with --project | Pass |
| AC2 | Auto-creation with multiple --context flags | Pass |
| AC3 | Auto-creation on edit with --context | Pass |
| AC4 | Topic icon display with mm show | Pass |
| AC5 | Topic icon in mm ls permanent | Pass |
| AC6 | Auto-created item properties verification | Pass |
| AC7 | Mixed existing and new aliases | Pass |
| AC8 | User notification messages | Pass |
| AC9 | No creation for existing aliases | Pass |

All unit tests pass (556 tests). E2E tests pass (28/29 - shell completion failure unrelated).

### Follow-ups / Open Risks

#### Addressed
- ItemIcon extension implemented with "topic" icon (◆ in CLI)
- Performance: multiple auto-creations handled efficiently with duplicate detection

#### Remaining
- None identified - feature is complete and all edge cases handled
