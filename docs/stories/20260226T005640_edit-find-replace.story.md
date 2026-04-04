## Story Log

### Goal
Add `--find`/`--replace` flags to `mm edit` for safe partial body text replacement.

### Why
Agents editing item bodies must currently read the entire body and overwrite via `--body`, risking data loss from string manipulation errors. Even with `--append`, there's no way to modify specific text within the body. A find-and-replace mechanism lets agents surgically update a known passage without touching the rest.

### User Story
**As an agent, I want to replace specific text within an item's body by specifying the old and new strings, so that I can make targeted edits without risking loss of surrounding content.**

### Acceptance Criteria

#### 1. Single Replacement
- [ ] **Given** an item with body containing "foo bar baz", **When** you run `mm edit <id> --find "bar" --replace "qux"`, **Then** the body becomes "foo qux baz"

#### 2. Replace All
- [ ] **Given** an item with body "aaa bbb aaa", **When** you run `mm edit <id> --find "aaa" --replace "ccc" --replace-all`, **Then** the body becomes "ccc bbb ccc"

#### 3. Delete (--replace with empty string)
- [ ] **Given** an item with body "hello world", **When** you run `mm edit <id> --find "world" --replace ""`, **Then** the body becomes "hello " (matched text removed)

#### 4. Combined with Other Metadata
- [ ] **Given** an item exists, **When** you run `mm edit <id> --find "old" --replace "new" --icon task`, **Then** both the body replacement and icon update are applied

#### 5. Error Cases
- [ ] **Given** the body does not contain the find text, **When** the command runs, **Then** an error is printed and the command exits non-zero (no silent no-op)
- [ ] **Given** `--replace-all` is not specified and the find text appears multiple times, **When** the command runs, **Then** an error is printed indicating ambiguous match and the command exits non-zero
- [ ] **Given** `--find` is used together with `--body`, **When** the command is parsed, **Then** an error is printed indicating mutual exclusivity
- [ ] **Given** `--find` is used together with `--append`, **When** the command is parsed, **Then** an error is printed indicating mutual exclusivity
- [ ] **Given** `--find` is specified without `--replace`, **When** the command is parsed, **Then** an error is printed indicating `--find` requires `--replace`
- [ ] **Given** `--replace` is specified without `--find`, **When** the command is parsed, **Then** an error is printed indicating `--replace` requires `--find`
- [ ] **Given** `--replace-all` is specified without `--find`, **When** the command is parsed, **Then** an error is printed indicating `--replace-all` requires `--find`

### Verification Approach
E2E tests in `tests/e2e/scenarios/scenario_19_item_edit_test.ts` using `runCommand` helper to assert stdout/stderr content and verify file body via `parseFrontmatter`.

### Out of Scope
- Regex support (literal string matching only)
- Changes to `EditItemWorkflow` domain layer (replacement logic handled in CLI command layer, same as `--append`)
- MCP server support for find/replace
- Interactive editor mode integration

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- AC 1 (single replacement): Resolves item, applies `String.prototype.replace()` for first match
- AC 2 (replace all): Uses `String.prototype.replaceAll()` when `--replace-all` flag present
- AC 3 (delete with empty string): `--replace` uses optional value syntax `[replace:string]` so `--replace=` passes empty string; test uses `--replace=` format
- AC 4 (combined with metadata): `--find/--replace` sets `updates.body` before other metadata options applied
- AC 5a (no match): `countOccurrences` checks `indexOf` before replacement; exits with error if 0 matches
- AC 5b (ambiguous match): Counts occurrences; errors if >1 match without `--replace-all`
- AC 5c-d (mutual exclusivity): Early validation guards for `--find` + `--body` and `--find` + `--append`
- AC 5e-g (orphan flags): Validation checks `--find` without `--replace`, `--replace` without `--find`, `--replace-all` without `--find`

**Decisions:**
- `--replace` option uses Cliffy optional value syntax `[replace:string]` instead of required `<replace:string>` because Cliffy rejects empty string as "missing value". Tests use `--replace=` (equals-sign) format to pass empty string
- Reused same pattern as `--append`: resolve item via `createItemLocatorService`, apply transformation, pass as `updates.body`
- `countOccurrences` helper uses non-overlapping `indexOf` loop for accurate match counting
- `hasMetadataOptions` includes `options.find`, `options.replace`, and `options.replaceAll` to prevent falling through to interactive editor mode

**Tests:**
- `tests/e2e/scenarios/scenario_19_item_edit_test.ts`: 11 new tests added (23 total)
  - 5 validation error tests (mutual exclusivity, orphan flags)
  - 4 happy path tests (single replace, replace-all, delete, combined metadata)
  - 2 runtime error tests (no match, ambiguous match)
- Status: All 23 passing

**Technical debt:**
- Item resolved twice when using `--find/--replace` (same as `--append`): once for body read, once inside workflow
- `resolveBodyForFindReplace` duplicates dependency-resolution pattern from `resolveBodyForAppend`

**Next:** Refactor

---

### Refactoring

**Status: Complete - Ready for Verify**

**Applied:**
- `resolveExistingBody` extracted: Shared item resolution and body extraction logic pulled out of both `resolveBodyForFindReplace` and `resolveBodyForAppend`, eliminating duplicated locator service creation and error handling (duplication removal, single responsibility)
- `BodyResolutionDeps` type alias: Shared dependency shape defined once instead of duplicated inline in both function signatures (DRY, loose coupling)
- `bodyResolutionDeps` local variable: Single construction of the dependency bag at the call site, shared by both `--append` and `--find/--replace` paths (duplication removal)
- `validateBodyFlags` extracted: Six inline mutual-exclusivity/pairing checks consolidated into a pure function returning `string | null`, reducing the action body's complexity (single responsibility, high cohesion)

**Design:**
- Coupling: `resolveExistingBody` and `validateBodyFlags` depend only on their explicit parameters, not on the full CLI deps bag
- Cohesion: Validation rules grouped in one function; body resolution grouped in another; transformation logic remains in `resolveBodyForFindReplace`/`resolveBodyForAppend`
- Responsibilities: The command action body delegates validation and body resolution instead of implementing them inline

**Quality:** Tests passing (23), Lint clean, Format clean

**Next:** Verify

---

### Completed Work Summary
Implementation and refactoring complete.

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance:** 2026-02-26

- AC 1 (Single Replacement): PASS - Test "replaces first occurrence of find text in body" confirms `--find "bar" --replace "qux"` transforms "foo bar baz" → "foo qux baz"
- AC 2 (Replace All): PASS - Test "replaces all occurrences when --replace-all is specified" confirms `--find "aaa" --replace "ccc" --replace-all` transforms "aaa bbb aaa" → "ccc bbb ccc"
- AC 3 (Delete): PASS - Test "deletes matched text when --replace is empty string" confirms `--find "world" --replace=` removes "world" from "hello world"
- AC 4 (Combined Metadata): PASS - Test "applies find/replace together with other metadata flags" confirms body replacement and `--icon task` both applied in one command
- AC 5a (No match error): PASS - Test "returns error when find text is not found in body" confirms non-zero exit and stderr output
- AC 5b (Ambiguous match error): PASS - Test "returns error when find text has multiple matches without --replace-all" confirms non-zero exit and stderr output
- AC 5c (--find + --body): PASS - Test "returns error when --find is used with --body" confirms stderr mentions both flags
- AC 5d (--find + --append): PASS - Test "returns error when --find is used with --append" confirms stderr mentions both flags
- AC 5e (--find without --replace): PASS - Test "returns error when --find is specified without --replace" confirms error message mentions both flags
- AC 5f (--replace without --find): PASS - Test "returns error when --replace is specified without --find" confirms error message mentions both flags
- AC 5g (--replace-all without --find): PASS - Test "returns error when --replace-all is specified without --find" confirms error mentions both flags

**Tests:** All 23 scenario_19 tests passing. Full test suite: 34 passed (339 steps). 2 pre-existing failures in `completions_test.ts` (zsh not installed in environment; bash `complete` not available) — unrelated to this feature, not introduced by this change.

**Quality:** Linting clean (`deno lint`), Formatting clean after applying `deno fmt` to test file (long lines in validation test cases needed wrapping). No debug statements. No TODOs in source code. Both README.md and README.ja.md updated with `--find`/`--replace` documentation.

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- `resolveBodyForFindReplace` and `resolveBodyForAppend` shared duplicated item resolution pattern (extracted `resolveExistingBody`)

#### Remaining
- Double item resolution (same as `--append`: item resolved once for body read, once inside workflow)
- MCP server may want similar find/replace capability in the future
