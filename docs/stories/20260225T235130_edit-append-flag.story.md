## Story Log

### Goal
Add `--append` flag to `mm edit` so agents can safely append text to an item's body without risking data loss.

### Why
Currently, appending to an item body requires: `mm where` to get the path, read the file, skip frontmatter, extract body, concatenate, then `mm edit --body "full text"`. This is error-prone — if the existing body extraction fails, the original content is overwritten and lost. A dedicated `--append` flag eliminates this multi-step process and the data loss risk.

### User Story
**As an agent, I want to append text to an existing item's body via a single command, so that I can safely add information without risking loss of existing content.**

### Acceptance Criteria

#### 1. Append to Existing Body
- [ ] **Given** an item exists with body "Existing content", **When** you run `mm edit <id> --append "New content"`, **Then** the item's body becomes "Existing content\nNew content" and the command outputs a success message

#### 2. Append to Empty Body
- [ ] **Given** an item exists with no body (title-only heading), **When** you run `mm edit <id> --append "First content"`, **Then** the item's body becomes the title heading followed by "\nFirst content"

#### 3. Append with Other Metadata Flags
- [ ] **Given** an item exists, **When** you run `mm edit <id> --append "Extra info" --icon task`, **Then** both the body is appended to and the icon is updated

#### 4. Error Cases
- [ ] **Given** the user specifies both `--body` and `--append`, **When** the command is parsed, **Then** an error is printed indicating the two flags are mutually exclusive and the command exits with non-zero status
- [ ] **Given** a non-existent item, **When** you run `mm edit nonexistent --append "text"`, **Then** a "not found" error is printed (existing behavior)

### Verification Approach
E2E tests in `tests/e2e/scenarios/scenario_19_item_edit_test.ts` using `runCommand` helper to assert stdout/stderr content and verify file body via `parseFrontmatter`.

### Out of Scope
- Changes to `EditItemWorkflow` domain layer (append logic handled in CLI command layer)
- `--append` for the interactive editor mode (no metadata options)
- Configurable separator (always `\n`)
- MCP server support for append

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- AC 1 (append to existing body): Resolves item, concatenates `existingBody + "\n" + appendText`, passes as `updates.body`
- AC 2 (append to empty body): When body is empty/undefined, uses append text directly (no leading newline)
- AC 3 (append with other flags): `--append` integrates with the existing metadata options path; combinable with `--icon`, `--title`, etc.
- AC 4.1 (--body + --append error): Early validation before building updates; prints message mentioning both flags
- AC 4.2 (non-existent item): Locator service resolves before workflow; not-found error propagated

**Decisions:**
- Resolve item via `createItemLocatorService` in the command handler before calling workflow, to get current body for concatenation
- Body concatenation uses empty string fallback for undefined body, so `--append` on empty body doesn't produce leading newline
- Mutual exclusivity check placed before any item resolution to fail fast

**Tests:**
- `tests/e2e/scenarios/scenario_19_item_edit_test.ts`: 4 new tests added
  - "appends text to existing body" — verifies content preserved and order
  - "appends text to item with empty body" — verifies append on no-body item
  - "appends text while also updating other metadata" — verifies combo with `--icon`
  - "returns error when both --body and --append are specified" — verifies mutual exclusivity
- Status: All passing (12 steps)

**Technical debt:**
- Item is resolved twice when using `--append` (once for body read, once inside workflow) — minor inefficiency; not addressable without domain layer changes (out of scope)

**Next:** Verify

---

### Refactoring

**Status: Complete - Ready for Verify**

**Applied:**
- `formatLocatorError` extracted: Converts `ItemLocatorError` to a user-facing string. Eliminates the duplicated if/else-if/else error formatting pattern that existed in the append path (single responsibility, duplication removal)
- `resolveBodyForAppend` extracted: Encapsulates locator service creation, item resolution, body read, and concatenation into a single named function (single responsibility, high cohesion). Reduces the inline append block from 27 lines to a clean function call
- Fixed pre-existing `deno fmt` violation in test file (long `assertEquals` line)

**Design:**
- Coupling: `resolveBodyForAppend` takes explicit typed dependencies rather than the full `deps` bag, keeping its contract narrow
- Cohesion: Body-append logic (resolve + concatenate) grouped into one function; error formatting grouped into another
- Responsibilities: The command action body no longer contains inline locator creation or error formatting for the append path

**Remaining technical debt:**
- Item is still resolved twice when using `--append` (once in `resolveBodyForAppend`, once inside `EditItemWorkflow`). Eliminating this would require domain layer changes (adding a `preResolved` option to the workflow), which is out of scope

**Quality:** Tests passing (12), Lint clean, Format clean

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance:** 2026-02-26

- AC 1 (Append to Existing Body): PASS — `resolveBodyForAppend` concatenates `existingBody + "\n" + appendText`; test "appends text to existing body" confirms both strings present in correct order
- AC 2 (Append to Empty Body): PASS — falsy-check on `existingBody` returns `appendText` directly with no leading newline; test "appends text to item with empty body" confirms content is present
- AC 3 (Append with Other Flags): PASS — `--append` sets `updates.body` before other metadata options are applied; test "appends text while also updating other metadata" confirms icon updated and body appended
- AC 4.1 (--body + --append mutual exclusivity): PASS — early guard prints "Cannot use --body and --append together. Use one or the other." containing both flag names; test "returns error when both --body and --append are specified" confirms both strings in stderr
- AC 4.2 (non-existent item): PASS — `formatLocatorError` returns "Item not found: \<ref\>" for `not_found`; existing test "returns error for non-existent item" confirms "not found" in stderr

**Tests:** All 12 passing (scenario_19_item_edit_test.ts: 12 steps)

**Quality:** Linting clean (278 files, 0 errors), formatting clean (280 files, 0 errors), no debug statements, no TODOs

**Full suite note:** 34 passed (328 steps), 1 failed (2 steps in completions_test.ts — pre-existing environment failure: `zsh` not installed and `bash complete` builtin unavailable in NixOS sandbox, unrelated to this feature)

**Next:** Code Review

---

### Follow-ups / Open Risks

#### Addressed
- Locator error handling duplication eliminated via `formatLocatorError`

#### Remaining
- MCP server may want similar append capability in the future
- Double item resolution for `--append` (requires domain layer change to fix)
