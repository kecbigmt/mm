# mm ls (range-aware) – DESIGN

Status: Proposed  
Target version: mm v1.x  
Reference: docs/specs/001_redesign/design.md, mm-prototype `mm list`

---

## 0. Scope & Non‑Scope

In scope:

* Re-spec `mm ls` to match the mm-prototype list UX: spans multiple dates, groups by date head, and uses colored, icon-rich lines.
* Default time window when no locator is given; accepts explicit path/range expressions (dates, sections, aliases, IDs) per 001_redesign.
* Filtering for status and item icon (`note` | `task` | `event`); machine-friendly `--print` mode.
* Deterministic ordering: date partitions newest→oldest, items by rank with stable tie-breakers.
* Pager integration for long output (env/config driven with CLI opt-out).
* Clarify that date-head numeric sections are being phased out; prefer item-head sectioning.
* Event placement is date-head only; item-head events are discouraged and may be invalidated.

Out of scope:

* New persistence/index formats.
* Changes to physical storage layout or placement semantics (001_redesign stands).

---

## 1. Goals

1) Make `mm ls` the primary “what’s on my plate” view: shows items across a date window with clear grouping.  
2) Preserve path-first navigation from 001_redesign: `ls` still respects CWD and path/range expressions.  
3) Provide readable defaults (colors/icons/relative date headers) with a non-colored `--print` option for scripts.  
4) Integrated pager by default so large listings stay usable; allow opting out.  
5) Keep index-driven performance: leverage existing `PlacementRange` + graph index; avoid full scans.
6) Prefer item-head sectioning; date-head numeric sections are being phased out. Events are expected under date heads.

---

## 2. Behavior Overview

* Invocation: `mm ls [<locator>] [options]`
* Locator grammar: same as 001_redesign path/range expressions (dates, aliases/UUIDs, numeric sections, final-segment ranges). Resolved by `PathResolver` → `PlacementRange`.
* Default locator when omitted: **date window** `today-7d .. today+7d` in workspace TZ (matches mm-prototype). Use `mm ls .` to list only CWD.
* Output:
  * Grouped by **placement head date** (current placement, not birthplace), newest date first.
  * Within a date group: sorted by `rank` ascending; ties break by `createdAt` then `id`.
  * Formatting aligned with mm-prototype: emoji-prefixed lines, alias-first labels (no short IDs), relative date headers (today/tomorrow/yesterday, up to +7d).
* Filters:
  * Default shows open items; `--all` includes closed.
  * `--type`: `note` | `task` | `event` (mapped from `ItemIcon`).
* `--print`: plain, no colors, includes ISO date per line for piping/grep.
* Events are expected under date heads; item-head events are discouraged and may be warned/invalidated later.

---

## 3. CLI Surface

```
mm ls [<locator>] [--type <note|task|event>] [--all] [--print] [--no-pager] [--workspace <name>]
```

Examples:

* `mm ls` → last 7 days through next 7 days, grouped by date.
* `mm ls today` → only today’s placement head (still grouped, single header).
* `mm ls today..+3d --all` → 4-day window, includes closed.
* `mm ls book/2` → items under that placement (one group, head date from each item’s placement head if it is a date).
* `mm ls 2025-05-01/1..5 --type task` → numeric range under a date head, tasks only.
* `mm ls . --print` → current CWD only, plain lines with date column.

Flags:

* `--type` (optional; validates against `ItemIcon`)
* `--all` (include closed)
* `--print` (plain)
* `--no-pager` (send directly to stdout)
* `--workspace` (existing override passthrough)

---

## 4. Resolution & Querying Semantics

* Use existing `PathResolver` to map locator → `PlacementRange`.
  * Date keywords/relative ops resolved in workspace TZ.
  * Ranges remain **final segment only**; date ranges remain **head-only** (001_redesign rules).
* Default locator logic:
  * When locator is absent, build `PlacementRange.dateRange` from `today-7d` to `today+7d`.
  * When locator is present:
    * `single` → query that placement (one group).
    * `dateRange` → query range (multi-group).
    * `numericRange` → query siblings under resolved parent/section (one group keyed by parent head’s date when present).
* Repository query: continue using `itemRepository.listByPlacement(range)` (index-backed). Post-process in workflow to enforce ordering and filtering.

---

## 5. Filtering Rules

Applied in `ListItemsWorkflow` after loading items:

* Status:
  * Default: `ItemStatus` open only.
  * `--all`: no status filter (open + closed).
* Type: match `item.data.icon` against `note` | `task` | `event`.
* (Future-friendly) Filters are pure functions over in-memory items to keep repository contract unchanged.

---

## 6. Ordering & Grouping

* Partition key: `CalendarDay` derived from `item.data.placement.head` **when it is a date head**. Items whose placement head is an item UUID (non-date) appear in a single “(no-date head)” partition; locator expressions that resolve to item heads will typically produce that single partition. When a numeric range is requested under an item head (preferred; date-head numeric sections are being phased out), split into **one partition per section prefix** (e.g., `some-book/1..3` yields headers `[some-book/1]`, `[some-book/2]`, `[some-book/3]`). Each partition shows its own items/stubs; ordering still keys off rank within that partition. Partition headers use the item’s alias if available, otherwise the UUID (plus section prefix if applicable). Partitioning is a presentation concern; the domain workflow returns a flat, filtered, sorted item list. Partition builder inputs: `items: Item[]` (sorted), `range: PlacementRange`, `sections: SectionSummary[]` (direct children only, may be empty but not undefined).
* Partition order: descending by date string (ISO).
* Item order inside a partition:
  1. `rank` ascending.
  2. `createdAt` ascending (stable tie-break).
  3. `id` ascending (final tie-break).
* Workflow returns partitions to presentation so UI formatting is deterministic and testable.

---

## 7. Output Formatting

### 7.1 Date headers

* Format: `[YYYY-MM-DD] <relative>` where `<relative>` is `today|tomorrow|yesterday|+Nd|-Nd|+weekday|~weekday` shown only for -1..+7 days relative to now.
* Style: bold header when relative label is `today`; otherwise normal. Colors use `@std/fmt/colors`.

### 7.2 Item lines

Base template (colored mode, align with mm-prototype):

```
<icon> <alias-or-id> <title> <time?> <context?> <due?>
```

* `alias-or-id`: alias if present (canonical string), else full UUID (short-id is abolished); cyan (no brackets).
* `icon` (placed first for visual alignment):
  * `note`: `📝` (open) / `🗞️` (closed)
  * `task`: `✔️` (open) / `✅` (closed)
  * `event`: `🕒(HH:MM[-HH:MM])` when `startAt` (and `duration`) exist; plain `🕒` otherwise. Events are expected to live under date heads; item-head placement is discouraged and may be invalidated in future cleanup.
* `title`: plain text.
* `context` tag (if present): dim.
* `due` (if `dueAt` exists): dim `→YYYY-MM-DD`.
* `time`: computed in workspace TZ (from deps.timezone); duration parsed from `Item.duration`.

`--print` mode:

* No colors/emojis; line includes ISO date column:
  * `YYYY-MM-DD <icon?> <alias-or-id> <title> <context?> <due?>` (icon may be omitted or plain text token; ordering stays icon-first for consistency)

### 7.3 Nested sections within ranges (summaries only)

When a numeric range target contains nested sections that are not expanded (e.g., listing `some-book/1..3` where `1/2` has children under `some-book/1/2/...`):

* Show a **section stub line** to indicate deeper content without expansion.
* Stub format (colored mode):
  ```
  📁 <section-prefix>/ (items: <count>, sections: <count>)
  ```
  * Section path rendered relative to the range head.
  * Counts derived from index metadata for that subsection (no file scans).
  * Icon first for alignment; keep it minimal.
* Stub appears **after the items of that section prefix** within the partition (not interleaved between sibling items of other prefixes). Emit a stub only when that section has at least one item or subsection; omit empty sections.
* `--print` mode uses the same text without colors/emojis.

### 7.4 Event placement policy

* Events are expected under date heads (or date sections). Item-head placement is discouraged and may be invalidated; doctor should warn and future workflows may error.
* Display logic assumes date-head placement; item-head events are excluded from `mm ls` output and emit a warning.

### 7.5 Range expansion limits

* Section prefix expansion (e.g., `some-book/1..N`): cap at **100** prefixes. If the requested range exceeds the cap, truncate to the first 100 prefixes and emit a warning on stderr (same in `--print`).
* Date ranges: cap expansion at **100** partitions. If a date range expands beyond 100 days, truncate to the earliest 100 and warn.

Empty states:

* Only emit `(empty)` once when there are no items or section stubs at all.
* Do not emit empty partitions/headers.

---

## 8. Architecture & Changes

* **ListItemsWorkflow**
  * Extend input: `status?: "open" | "closed" | "all"` (default `open`), `icon?: ItemIcon`, `locator?: string`.
  * When `locator` is absent, construct default date range before calling `PathResolver`.
  * After repository load: apply filters and return a flat, sorted list of items (rank, then createdAt, then id). No presentation partitioning in the workflow.
* **Presentation (CLI)**
  * Update `createLsCommand` to parse options, build default range, and render partitions with a new `ListFormatter` (colored + print modes).
  * Keep `--workspace` passthrough and existing error handling.
  * Add pager integration: if `--no-pager` is not set and `--print` is false, pipe rendered text to pager. Default pager resolution order: `PAGER` env → `less -R`. Fallback to plain stdout on pager spawn failure (warn).
  * Use a partition builder utility (pure function) in `src/presentation/cli/partitioning/build_partitions.ts` to group sorted items into partitions and generate stubs/warnings (inputs: `items`, `range`, `sections`, `limit`).
* **Presentation utilities (structure)**
  * `src/presentation/cli/partitioning/build_partitions.ts` (+ tests): pure partition builder; applies range expansion limits, skips empty prefixes, generates stubs, omits item-head events, returns DTO + warnings.
  * `src/presentation/cli/formatters/list_formatter.ts` (+ tests): string formatting (icon-first, alias-first, headers, colors/print mode, date headers, event times in workspace TZ).
  * `src/presentation/cli/commands/ls.ts`: wiring only (deps, resolver, repo/query calls, warning emission, pager/print/no-pager handling, formatter invocation).
* **Limits & warnings**
  * Range expansion caps (100 for section prefixes, 100 for dates) are presentation constants (not configurable via env). Truncation emits a stderr warning; output is truncated accordingly (same behavior in `--print`).
  * Item-head events are excluded from output and emit a warning.
  * SectionQueryService errors: fail the command (no partial output) since stub generation depends on section metadata.
  * Print mode shows stubs (same text, no colors).
  * Warning examples (stderr):
    * Range cap (section): `warning: section range capped at 100 prefixes (requested 250)`
    * Range cap (date): `warning: date range capped at 100 days (requested 180)`
    * Item-head events: `warning: skipped 2 event(s) not under a date head`
    * Section query failure: (command fails; error message reflects underlying cause)
* **Query services**
  * Introduce a read-only section query service in domain/services (implemented in infrastructure) to list section summaries under a parent placement.
  * Proposed interface:
    ```ts
    export type SectionSummary = Readonly<{
      placement: Placement;                // head + section path identifying this section
      itemCount: number;                   // direct children under this section
      sectionCount: number;                // direct child sections under this section
    }>;

    export interface SectionQueryService {
      listSections(
        parent: Placement,
      ): Promise<Result<ReadonlyArray<SectionSummary>, InfrastructureError>>;
    }
    ```
  * Keep `ItemRepository` focused on item CRUD/list; use the query service to drive section stubs without loading item bodies.
* **Tests**
  * Workflow tests: type filter, `--all` inclusion, default range construction, ordering.
  * CLI tests: snapshot of colored mode (strip ANSI in assertions) and `--print` output; default (no locator) uses windowed date range. Pager path: unit-test helper resolves pager command and falls back without throwing when pager is unavailable (mocked).
  * E2E scenarios (fixtures with workspace TZ fixed):
    - `mm ls` (no locator): shows today±7d date partitions; icon-first; alias shown; empty overall → single `(empty)`.
    - `mm ls some-book/1..3`: emits partitions for 1,2,3 (skip empty prefixes); shows section stub for non-empty child prefix; honors cap=100 if exceeded (truncation + warning).
    - `mm ls today..+2d --type task --all --print`: prints plain lines with dates, includes closed tasks, no colors.
    - `mm ls today --type event`: events render with times in workspace TZ.
    - Item-head events in fixtures are omitted from output and produce a warning.
    - `mm ls .`: lists only current placement; if no items/stubs, emits single `(empty)`.
    - E2E runs with pager disabled (`--no-pager` or `--print`) to avoid TTY/pager dependency.
  * Unit tests cover pager toggle/command resolution (with process spawn mocked), truncation warnings for large ranges (section/date), and alias/UUID header fallback.

---

## 9. Open Questions / Decisions

* Non-date heads: keep single “(no-date head)” partition or show raw placement head? Initial implementation: single unlabeled group to avoid leaking UUID-only headers.
* Window size: prototype uses ±7d; configurable later via env/flag if needed.

---

## 10. Acceptance Criteria

* Running `mm ls` with test data spanning multiple dates shows date headers in descending order with correct relative labels; items are colored and ordered by rank.
* `mm ls today..+2d --type task` filters to tasks only and includes closed tasks only when `--all`.
* `mm ls . --print` emits plain lines with ISO dates, no ANSI codes.
* When a numeric range includes nested sections, a stub line appears showing child section/item counts without expanding them.
* Listing uses placement (current location), not physical storage date; items moved to another date appear under the new date head.
* Default run invokes pager (unless `--no-pager` or `--print`); if pager command is missing, gracefully falls back to stdout with a warning.
* Item-head range `some-book/1..3` emits a partition per section prefix present in the range; partitions with no items or stubs are omitted; headers use alias when available (UUID fallback).
* Section stubs (📁) appear only for prefixes that contain items or subsections; icon-first ordering applies consistently; aliases are used when present (no short-id).
* When there are no items or stubs at all, emit a single `(empty)`; otherwise do not emit `(empty)`.
* Event placement is date-head only; item-head events are omitted from `mm ls` output and emit a warning (doctor should also warn; future workflows may reject).

---

## 11. Worked Examples (input → output)

Assume workspace TZ is Asia/Tokyo; aliases exist for all items shown.

1) Command: `mm ls`

Output:
```
[2025-02-10] today
📝 book-ch2 Fix chapter structure @project/novel
✔️ errands Buy groceries →2025-02-11

[2025-02-09] yesterday
📝 meet-notes Sprint retro
```

2) Command: `mm ls today..+2d --type task`

Output:
```
[2025-02-10] today
✔️ errands Buy groceries →2025-02-11

[2025-02-11]
✔️ home Clean kitchen
```

3) Command: `mm ls some-book/1..3 --print --all`

Output:
```
some-book 📝 chapter-1 Draft outline
some-book 📝 chapter-2 Fix structure
some-book 📝 chapter-3 Add citations
```

4) Command: `mm ls today --type event`

Output:
```
[2025-02-10] today
🕒(09:30-10:00) team-sync Sprint planning @team/eng
🕒(15:00) launch Launch checklist review
```
Notes:
* `team-sync` shows start/end time (workspace TZ) because both `startAt` and `duration` exist.
* `launch` shows start time only (no duration).

5) Command: `mm ls some-book/1..3` (status defaults to open)

Output:
```
[some-book/1]
📝 chapter-1 Draft outline

[some-book/2]
📝 chapter-2 Fix structure
📁 1/ (items: 1, sections: 0)
```
Notes:
* Numeric range under an item head yields one partition per section prefix in the range (1, 2, 3).
* Empty prefixes are omitted; only prefixes with items or subsections are shown.
* Ordering uses rank, then createdAt, then id. Closed items are omitted unless `--all`.

6) Command: `mm ls 019a85fc-67c4-7a54-be8e-305bae009f9e/2` (listing under an item head)

Output:
```
[parent-alias/2]
📝 subnote-1 Details for subsection 2
✔️ task-1 Finish subsection work
📁 1/ (items: 2, sections: 1)
```
Notes:
* Partition header shows the parent item alias (fallback to UUID) and section prefix.
* Stub line indicates deeper children under `1/` (relative to the head `.../2/`), i.e., actual path `parent-alias/2/1`, without expansion.
* Items are ordered by rank, then createdAt, then id; closed items appear only with `--all`. Empty sibling sections are omitted.
