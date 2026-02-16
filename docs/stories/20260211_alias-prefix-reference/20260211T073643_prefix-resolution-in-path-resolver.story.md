## Story Log

### Goal
Integrate alias prefix resolution into PathResolver so users can reference items by typing a short prefix instead of the full alias.

### Why
Story 1 implemented the pure prefix resolution algorithm (`resolvePrefix`), but it isn't wired into the CLI path resolution pipeline. Currently, PathResolver performs exact alias lookup only — if a user types `b` and no alias with slug `b` exists, it fails with "alias not found". This story connects the prefix service to PathResolver so that `b` resolves to the item whose alias starts with `b` (if unambiguous).

### User Story
**As a mm user, I want to type a short alias prefix (e.g., `b`) in any command that accepts a path, so that I can reference items without typing the full alias.**

### Acceptance Criteria

#### 1. Prefix Resolution Fallback in PathResolver
- [x] **Given** aliases `[bace-x7q, kuno-p3r]` exist, **When** resolving path `bacex` (not an exact alias), **Then** return the item for `bace-x7q` (prefix match)
- [x] **Given** aliases `[bace-x7q, kuno-p3r]` exist, **When** resolving path `k`, **Then** return the item for `kuno-p3r` (single-char prefix)
- [x] **Given** alias `bace-x7q` exists, **When** resolving path `bace-x7q` (exact full alias), **Then** return the item for `bace-x7q` (exact match still works)

#### 2. Ambiguous Prefix Error
- [x] **Given** aliases `[bace-x7q, bace-y2m]` exist, **When** resolving path `bace`, **Then** return an error indicating ambiguous prefix with both candidates listed
- [x] **Given** aliases `[bace-x7q, bace-y2m]` exist, **When** resolving path `bacex`, **Then** return the item for `bace-x7q` (longer prefix disambiguates)

#### 3. No Match Falls Through
- [x] **Given** aliases `[bace-x7q]` exist, **When** resolving path `xyz`, **Then** return "alias not found" error (no prefix match either)

#### 4. Input Normalization
- [x] **Given** alias `bace-x7q` exists, **When** resolving path `BACE`, **Then** return the item (case-insensitive prefix matching)

### Out of Scope
- Priority set integration (loading recent items for shorter prefixes) — separate story
- Display of shortest unique prefix in `mm list` output — separate story
- Ambiguous prefix error formatting with hint text — separate story (presentation concern)
- Changes to the alias prefix service algorithm itself

---

### Implementation (Red-Green)

**Status: Complete**

**Implemented:**
- Modified `PathResolver.resolveToken` case `"idOrAlias"`: when exact alias lookup returns `undefined`, falls back to prefix resolution via `resolvePrefix()` from alias prefix service
- New error code `ambiguous_alias_prefix` when multiple aliases match a prefix
- Prefix resolution uses `aliasRepository.list()` to get all aliases, then delegates to `resolvePrefix()` with empty priority set

**Decisions:**
- Empty priority set `[]` passed to `resolvePrefix`: priority set loading is out of scope for this story, so all aliases are in the "all items" tier
- Reuses existing `alias_not_found` error code when prefix yields no match — same user-facing behavior
- `resolvePrefix` handles normalization internally, so raw `token.value` is passed directly

**Tests:**
- `src/domain/services/path_resolver_prefix_test.ts`: 7 tests covering all acceptance criteria
- Status: All passing (7/7)
- Existing PathResolver tests: All passing (33/33)
- Full unit test suite: All passing

**Technical debt:**
- `aliasRepository.list()` is called on every prefix fallback — could be cached or lazily loaded
- Priority set is always empty — needs separate story to populate from recent items

**Next:** Verify

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Extract `resolveAliasByPrefix` helper: the `idOrAlias` case in `resolveToken` grew to ~97 lines mixing exact-lookup and prefix-fallback concerns. Extracted prefix resolution into a standalone `resolveAliasByPrefix` function (single responsibility, high cohesion). The `idOrAlias` case is now a clear pipeline: try UUID, try exact alias, fall back to prefix.
**Design:** Improved cohesion by grouping all prefix-resolution logic (list aliases, call `resolvePrefix`, map results to errors/placements) in one function. Reduced coupling by making the helper a module-level function that takes only the two values it needs (`token` string and `aliasRepository`), rather than closing over the entire `dependencies` object.
**Quality:** Tests passing (7 prefix + 33 existing = 40 total), Linting clean, Formatting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**

**Date:** 2026-02-11

**Acceptance Criteria:**
- Criterion 1.1 (prefix `bacex` → `bace-x7q`): PASS - Test "resolves prefix match when exact alias not found"
- Criterion 1.2 (prefix `k` → `kuno-p3r`): PASS - Test "resolves single-char prefix"
- Criterion 1.3 (exact `bace-x7q` → `bace-x7q`): PASS - Test "exact alias match still works"
- Criterion 2.1 (ambiguous `bace`): PASS - Test "returns error for ambiguous prefix"
- Criterion 2.2 (disambiguate `bacex` → `bace-x7q`): PASS - Test "longer prefix disambiguates"
- Criterion 3 (no match `xyz`): PASS - Test "returns alias not found when no prefix match"
- Criterion 4 (case-insensitive `BACE`): PASS - Test "case-insensitive prefix matching"

**Tests:**
- All prefix tests passing (7/7)
- All existing PathResolver tests passing (33/33)
- Full unit test suite passing

**Quality:**
- Linting clean (253 files checked)
- Formatting clean (255 files checked)
- No debug code found
- No uncontextualized TODOs

**Implementation Quality:**
- Helper function `resolveAliasByPrefix` extracted for single responsibility
- Clear error codes: `ambiguous_alias_prefix`, `alias_not_found`
- Proper error messages with candidate lists for ambiguous cases
- Input normalization handled internally by `resolvePrefix`

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- [Items that were concerns but have been resolved]

#### Remaining
- Priority set not yet used — all aliases treated as one flat set for now
- Performance: `aliasRepository.list()` loads all aliases for prefix search; may need optimization for large repos
