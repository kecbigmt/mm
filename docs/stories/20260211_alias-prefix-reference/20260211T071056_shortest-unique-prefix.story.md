## Story Log

### Goal
Implement the core algorithm for calculating shortest unique prefixes and resolving alias prefixes.

### Why
The Alias Prefix Reference epic requires a pure domain service that computes the minimum prefix needed to uniquely identify an alias within a set, and resolves user-input prefixes back to items. This is the foundational building block for all prefix-related features (display, resolution, error handling).

### User Story
**As a mm user, I want to reference items by typing only the shortest unique prefix of their alias, so that I can work faster with less typing.**

### Acceptance Criteria

#### 1. Alias Normalization
- [x] **Given** an alias `bace-x7q`, **When** normalized, **Then** the result is `bacex7q` (hyphens removed, lowercase)
- [x] **Given** an alias `BACE-X7Q`, **When** normalized, **Then** the result is `bacex7q` (case-insensitive)
- [x] **Given** an alias `bace`, **When** normalized, **Then** the result is `bace` (no hyphen, unchanged)

#### 2. Shortest Unique Prefix Calculation
- [x] **Given** a single alias `bacex7q` in a set, **When** calculating its shortest prefix, **Then** the result is `b` (length 1, minimum)
- [x] **Given** aliases `[bacex7q, bacey2m, kunop3r, mizep2r]` sorted alphabetically, **When** calculating prefix for `kunop3r`, **Then** the result is `k` (no common prefix with neighbors)
- [x] **Given** aliases `[bacex7q, bacey2m, kunop3r, mizep2r]` sorted alphabetically, **When** calculating prefix for `bacex7q`, **Then** the result is `bacex` (4 chars common with `bacey2m`, need 5)
- [x] **Given** aliases `[bacex7q, bacey2m, kunop3r, mizep2r]` sorted alphabetically, **When** calculating prefix for `bacey2m`, **Then** the result is `bacey` (4 chars common with `bacex7q`, need 5)

#### 3. Prefix Resolution
- [x] **Given** priority set `[bacex7q, kunop3r]` and all items `[bacex7q, bacey2m, kunop3r, mizep2r]`, **When** resolving prefix `k`, **Then** return SingleMatch for `kunop3r`
- [x] **Given** priority set `[bacex7q, kunop3r]` and all items `[bacex7q, bacey2m, kunop3r, mizep2r]`, **When** resolving prefix `m`, **Then** return SingleMatch for `mizep2r` (not in priority set, found in all items)
- [x] **Given** priority set `[bacex7q, bacey2m]` and all items `[bacex7q, bacey2m, kunop3r]`, **When** resolving prefix `bace`, **Then** return AmbiguousMatch with candidates `[bacex7q, bacey2m]` (ambiguous within priority set — do NOT fall back)
- [x] **Given** priority set `[kunop3r]` and all items `[bacex7q, bacey2m, kunop3r]`, **When** resolving prefix `bace`, **Then** return AmbiguousMatch with candidates `[bacex7q, bacey2m]` (ambiguous in all items)
- [x] **Given** any sets, **When** resolving prefix `xyz`, **Then** return NoMatch error
- [x] **Given** priority set with alias `bacex7q`, **When** resolving exact full alias `bacex7q`, **Then** return SingleMatch (exact match takes priority)

#### 4. Error Cases
- [x] **Given** empty prefix input, **When** resolving, **Then** return NoMatch error
- [x] **Given** empty alias set, **When** calculating shortest prefix for any alias, **Then** return minimum prefix length 1

### Out of Scope
- Display formatting (brackets/colors for prefix highlighting) — separate story
- Integration with `mm list` command — separate story
- Priority set loading from repository — this story uses in-memory sets
- Changes to PathResolver or existing alias resolution — separate story

---

### Implementation (Red-Green)

**Status: Complete**

**Implemented:**
- Alias normalization: `normalizeAlias()` — removes hyphens and lowercases
- Shortest unique prefix: `shortestUniquePrefix()` — finds minimum prefix via neighbor comparison in sorted list
- Prefix resolution: `resolvePrefix()` — priority set → all items fallback with exact match shortcut

**Decisions:**
- Pure functions operating on normalized strings (not AliasSlug branded types) — keeps the algorithm independent of domain primitives, integration will wrap later
- `resolvePrefix` normalizes input internally via `normalizeAlias` — consistent with epic spec section 4.1
- Linear scan for prefix matching — simple for now, binary search optimization deferred

**Tests:**
- `src/domain/services/alias_prefix_service_test.ts`: 15 tests covering all acceptance criteria
- Status: All passing (15/15)

**Technical debt:**
- Linear scan in prefix matching could use binary search for large sets
- No integration with AliasSlug/CanonicalKey branded types yet

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Extract `resolvePrefixInSet` helper: Eliminates duplicated exact-match and prefix-match logic between priority set and all-items tiers (Single Responsibility, Remove Duplication)
**Design:** `resolvePrefix` now composes two calls to the single-tier resolver, making the fallback strategy explicit and the per-tier logic testable in isolation. Removed the standalone `findPrefixMatches` function — its logic is now unified with exact-match checking inside `resolvePrefixInSet`, improving cohesion.
**Quality:** Tests passing (15/15), Linting clean, Formatting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**

**Date:** 2026-02-11

**Acceptance Criteria: ALL PASS**

1. **Alias Normalization (3/3 PASS)**
   - AC 1.1: `bace-x7q` → `bacex7q` - PASS (test line 6-8)
   - AC 1.2: `BACE-X7Q` → `bacex7q` - PASS (test line 10-12)
   - AC 1.3: `bace` → `bace` - PASS (test line 14-16)

2. **Shortest Unique Prefix Calculation (4/4 PASS)**
   - AC 2.1: Single alias → length 1 - PASS (test line 20-22)
   - AC 2.2: `kunop3r` → `k` - PASS (test line 24-27)
   - AC 2.3: `bacex7q` → `bacex` - PASS (test line 29-32)
   - AC 2.4: `bacey2m` → `bacey` - PASS (test line 34-37)

3. **Prefix Resolution (6/6 PASS)**
   - AC 3.1: Priority set match `k` → `kunop3r` - PASS (test line 45-50)
   - AC 3.2: Fallback to all items `m` → `mizep2r` - PASS (test line 52-57)
   - AC 3.3: Ambiguous in priority set - PASS (test line 59-67)
   - AC 3.4: Ambiguous in all items - PASS (test line 69-77)
   - AC 3.5: No match `xyz` - PASS (test line 79-84)
   - AC 3.6: Exact match priority - PASS (test line 86-91)

4. **Error Cases (2/2 PASS)**
   - AC 4.1: Empty prefix → NoMatch - PASS (test line 93-98)
   - AC 4.2: Empty set → minimum length 1 - PASS (test line 39-41)

**Tests:** All passing
- Targeted tests: 15/15 passed
- Full unit test suite: 600/600 passed
- No regressions introduced

**Quality Checks:**
- Linting: Clean (252 files checked)
- Formatting: Clean (254 files checked)
- Debug code: None found
- TODOs: None requiring action

**Note:** Pre-existing E2E completions test failures (2 steps) are unrelated to this story and do not block verification.

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- All core algorithm behaviors verified with unit tests

#### Remaining
- Integration with existing PathResolver for prefix resolution
- Performance with large alias sets (>10k items) — linear scan may be slow
