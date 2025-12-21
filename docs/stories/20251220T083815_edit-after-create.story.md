## Story Log

### Goal
Enable users to immediately edit newly created items (notes/tasks/events) using the `--edit` flag.

### Why
After creating a new item with basic metadata, users often want to add more detailed content in their editor. Currently they must run a separate `mm edit <id>` command. This adds friction and requires remembering/copying the item ID. The `--edit` flag makes this workflow seamless.

### User Story
**As a mm user, I want to use `--edit` flag on creation commands (note/task/event), so that I can immediately edit the item's content in my editor without running a separate command.**

### Acceptance Criteria

#### 1. Editor Launch
- [x] **Given** I run `mm note "test" --edit`, **When** the item is created, **Then** my $EDITOR opens with the item's markdown file
- [x] **Given** I run `mm task "Test" --edit`, **When** the item is created, **Then** my $EDITOR opens with the item's markdown file
- [x] **Given** I run `mm event "Test" --edit`, **When** the item is created, **Then** my $EDITOR opens with the item's markdown file
- [x] **Given** $EDITOR is not set, **When** I use `--edit` flag, **Then** `vi` is used as the default editor

#### 2. Post-Edit Processing
- [x] **Given** I edit an item's alias in the editor, **When** I save and exit, **Then** the alias index is updated correctly
- [x] **Given** I edit an item's content in the editor, **When** I save and exit, **Then** the cache is updated with the new content
- [x] **Given** auto-commit is enabled, **When** I save and exit the editor, **Then** changes are auto-committed

#### 3. Combining with Other Flags
- [x] **Given** I run `mm note "Test" --body "Initial" --edit`, **When** the editor opens, **Then** the body contains "Initial"
- [x] **Given** I run `mm task "Test" --due-at "2025-12-25T23:59" --edit`, **When** the editor opens, **Then** the frontmatter shows the due date
- [x] **Given** I run `mm event "Test" --start-at "10:00" --edit`, **When** the editor opens, **Then** the frontmatter shows the start time

#### 4. Error Cases
- [x] **Given** the editor exits with non-zero status, **When** I discard changes, **Then** an error message is shown but the item is still created
- [x] **Given** I make invalid changes in the editor (e.g., duplicate alias), **When** I save and exit, **Then** an appropriate error message is shown

### Out of Scope
- Supporting custom editor arguments (only $EDITOR environment variable)
- Undo mechanism if editor changes fail validation
- Interactive alias conflict resolution
- Editor configuration file support

---

### Completed Work Summary

**Implementation completed on 2025-12-20**

#### Changes Made

1. **Created shared editor utilities** (`src/presentation/cli/utils/edit_item_helper.ts`):
   - Extracted `launchEditor()` function to launch $EDITOR (defaults to 'vi')
   - Created `handlePostEditUpdates()` to handle post-edit processing:
     - Reload item from filesystem
     - Update alias index if alias changed
     - Update completion cache
     - Handle alias collision errors

2. **Refactored edit command** (`src/presentation/cli/commands/edit.ts`):
   - Updated to use shared editor utilities
   - Simplified code by removing duplicated logic

3. **Implemented --edit flag for creation commands**:
   - **note.ts**: Added editor launch after item creation when `--edit` flag is used
   - **task.ts**: Added editor launch after item creation when `--edit` flag is used
   - **event.ts**: Added editor launch after item creation when `--edit` flag is used
   - All commands now:
     - Create the item with initial metadata
     - Update cache
     - Auto-commit creation (if enabled)
     - Launch editor when `--edit` is specified
     - Handle post-edit updates (alias changes, cache updates)
     - Auto-commit edits (if enabled)
     - Show appropriate error messages if editor fails

#### Test Results
- Type checking: ✅ Passed
- Linting: ✅ Passed
- Formatting: ✅ Passed
- Unit tests: ✅ 347 passed (1 unrelated git test failed due to 1Password issue)

#### Design Decisions
- Shared utilities in `utils/edit_item_helper.ts` ensure consistent behavior across all commands
- Error handling: If editor fails, error is shown but item remains created
- Auto-commit is triggered twice when `--edit` is used: once for creation, once for edits
- Used `Item["data"]["alias"]` type for flexibility instead of importing Alias type directly

### Acceptance Checks

**Status: ✅ Accepted**

**Acceptance testing completed on 2025-12-21**

Developer verification:
- ✅ Type checking passes with no errors
- ✅ All existing unit tests continue to pass (347/348, 1 unrelated failure)
- ✅ Code follows Deno formatting standards
- ✅ Code passes linting checks
- ✅ Shared utilities properly exported and imported across all command files
- ✅ Error handling implemented for editor launch failures
- ✅ Post-edit updates (alias changes, cache) properly handled
- ✅ Auto-commit integration works for both creation and edits

Product owner verification:
- ✅ Editor launches correctly for `mm note "Test" --edit`
- ✅ Editor launches correctly for `mm task "Test" --edit`
- ✅ Editor launches correctly for `mm event "Test" --edit`
- ✅ Alias index updates correctly when editing alias in editor (verified via `.index/aliases/` file)
- ✅ Cache updates correctly when editing content (verified via completion_cache.json)
- ✅ Auto-commit creates appropriate commits for both creation and edits
- ✅ Error message shown when editor exits with non-zero status, item remains created
- ✅ Combining with other flags works (--body, --due-at, --start-at verified)

### Follow-ups / Open Risks

#### Addressed
- Code duplication between edit command and create commands has been eliminated by extracting shared utilities
- Type safety ensured by using proper TypeScript types from domain models
- Post-edit processing (alias updates, cache updates) properly handled

#### Remaining
- No validation recovery mechanism if user makes invalid changes in editor (item remains created but edits may fail)
- No interactive prompts for alias conflicts - user must manually resolve
- Editor arguments cannot be customized (only $EDITOR env var is supported)
- Two auto-commits are created when using `--edit` (one for creation, one for edits) - this is acceptable but worth noting
