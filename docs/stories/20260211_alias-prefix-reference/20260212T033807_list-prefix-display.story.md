## Story Log

### Goal
Show the shortest unique prefix visually highlighted in `mm list` alias output.

### Why
Users need to see which portion of an alias is sufficient to uniquely reference an item. Highlighting the shortest unique prefix in list output teaches users the minimum they need to type, reducing friction. This is the display counterpart to the prefix resolution already implemented in Stories 1-3.

### User Story
**As a user viewing `mm list` output, I want each alias to visually indicate its shortest unique prefix, so that I know the minimum I need to type to reference that item.**

### Acceptance Criteria

#### 1. Prefix Calculation for Displayed Items
- [x] **Given** items in the default `mm ls` range (priority set), **When** you run `mm ls`, **Then** each alias's shortest prefix is calculated within the priority set only
- [x] **Given** items outside the default range (e.g., `mm ls 2025-01-01..2025-01-07`), **When** you run `mm ls` with a custom range, **Then** each alias's shortest prefix is calculated against all aliases

#### 2. Colored Mode Display
- [x] **Given** an item with alias `bace-x7q` and shortest prefix `b`, **When** you run `mm ls` (colored mode), **Then** the alias displays with the prefix portion bold+cyan and the remainder in regular cyan (e.g., bold `b` followed by regular `ace-x7q`)
- [x] **Given** an item without an alias, **When** you run `mm ls`, **Then** the truncated UUID displays as before (no prefix highlighting)

#### 3. Edge Cases
- [x] **Given** a single item in the list, **When** you run `mm ls`, **Then** its shortest prefix is 1 character
- [x] **Given** the list is empty, **When** you run `mm ls`, **Then** output shows `(empty)` as before

### Out of Scope
- Print mode prefix display — not needed for this story
- Prefix display for project/context references (the `+proj` and `@ctx` suffixes) — those keep full aliases
- Prefix display in item-head partition headers (e.g., `[some-book/1]`)
- Changes to the `shortestUniquePrefix` algorithm itself (already implemented in Story 1)
- Error message formatting for ambiguous prefixes (Story 5)

---

### Implementation (Red-Green)

**Status: Complete - Ready for Refactor**

**Implemented:**
- Prefix calculation: default range uses displayed items' aliases as the set; custom range loads all aliases from repository
- Colored mode: bold+cyan for prefix portion, regular cyan for remainder
- No-alias items: full UUID in cyan, no prefix highlighting
- Print mode: ignores prefixLength, unchanged behavior

**Decisions:**
- `prefixLength` passed as optional parameter to `formatItemLine` to keep backward compatibility
- Default range detection: `locatorArg` absent → priority set (displayed items); present → all aliases
- Prefix computed on original alias strings (not normalized) — normalization only needed for user input resolution

**Tests:**
- `list_formatter_test.ts`: 6 new tests for prefix highlighting (bold+cyan, longer prefix, no prefix, no alias, single item, print mode)
- Status: All passing (625 unit tests)

**Next:** Refactor

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Introduced `ItemLineContext` type to bundle per-item optional parameters (`dateStr`, `resolveItemId`, `prefixLength`) into a single object, reducing `formatItemLine` from 5 positional parameters to 3. Internal helpers (`formatItemLinePrintMode`, `formatItemLineColoredMode`) similarly simplified. Principle: single responsibility and clarity -- the function signature now clearly separates shared options from per-item context.
**Design:** Coupling reduced by eliminating positional parameter ordering dependency; cohesion improved by grouping related per-item display concerns into `ItemLineContext`.
**Quality:** Tests passing (75 unit, 31/32 e2e -- 1 pre-existing shell completion failure), Linting clean, Formatting clean.
**Next:** Verify

### Verification

**Status: Verified - Ready for Code Review**

**Acceptance Criteria:**

**AC 1-1: Default range prefix calculation within priority set** - PASS
- Evidence: list.ts lines 390-395 compute prefix within `displayedAliases` when `locatorArg` is undefined
- Test: All list_formatter_test.ts prefix tests passing

**AC 1-2: Custom range prefix calculation against all aliases** - PASS
- Evidence: list.ts lines 380-389 load all aliases via `aliasRepository.list()` when `locatorArg` is present
- Test: Implementation correctly uses `allAliasStrings` as the sorted set

**AC 2-1: Bold+cyan prefix, regular cyan remainder in colored mode** - PASS
- Evidence: list_formatter.ts lines 256-260 apply `bold(cyan(prefix))` + `cyan(rest)`
- Test: "formatItemLine - colored mode highlights prefix portion bold+cyan" passing

**AC 2-2: No alias items show UUID without prefix highlighting** - PASS
- Evidence: list_formatter.ts line 262 shows full UUID in cyan when alias is undefined
- Test: "formatItemLine - colored mode no alias uses full UUID without prefix highlight" passing

**AC 3-1: Single item gets 1-char prefix** - PASS
- Evidence: alias_prefix_service.ts lines 28-29 return 1-char prefix when `sortedAliases.length <= 1`
- Test: "formatItemLine - colored mode single item prefix is 1 char" passing

**AC 3-2: Empty list shows (empty)** - PASS
- Evidence: list.ts lines 439-442 output "(empty)" when `partitions.length === 0`
- Test: Verified by code inspection (existing behavior)

**Tests:** All passing (625 unit tests, 31/32 e2e tests - 1 pre-existing shell completion failure in NixOS)

**Quality:**
- Linting clean (254 files checked)
- Formatting clean (256 files checked)
- No debug code found
- No uncontextualized TODOs

**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed
- Priority set loading: resolved by using displayed items as the priority set for default range, and loading all aliases for custom range
- (Addressed in Refactoring) The `formatItemLine` parameter list was consolidated via `ItemLineContext`
