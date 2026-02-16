# Project Design

**Role**: This document defines the **product design, domain model, and architecture**—the
foundational knowledge about what mm is, how it works, and core design decisions. This is a
stock-type document maintained throughout the project lifecycle.

---

## 1) Overview

mm is a personal knowledge operating system with a built-in MCP server.

It provides a Unix-like path interface (cd, ls, pwd) over a knowledge graph while keeping
human-editable content in plain text with Git-friendly diffs. The system is built from two
primitives: **Item** (an addressable entity like note, task, or event) and **Section** (a numbered
or dated shelf under a parent). Items can have children. Each Item has exactly one active
placement. Items are created under date sections, never moved physically; moves update frontmatter
(placement, rank) which serves as the single source of truth.

## 2) Goals / Non-Goals

**Goals**

- **Simple diffs, conflict-resistant Git workflow**: UUID v7-based file names (timestamp-embedded)
  and date-partitioned directories minimize merge conflicts. Frontmatter as single source of truth
  (placement, rank) allows conflict-free moves. Git-ignored rebuildable `.index/` eliminates index
  conflicts. Optional Git sync supports offline-first workflow with rebase-based synchronization.
- One mental model: Items placed under Items, split by Sections; single active placement per Item.
- Fast navigation by date, numbering paths, or aliases.
- Deterministic ordering via ranks (LexoRank).

**Non-Goals**

- Multi-placement (no simultaneous presence in multiple parents).
- Cross-platform symlinks.
- Timezone migrations (workspace TZ is fixed).

## 3) Core Concepts

### Item

- **Identity**: UUID v7 (timestamp-embedded).
- **Content**: Single `.md` file with **YAML Frontmatter + Markdown body**.
- **Frontmatter fields**: `id`, `kind`, `status`, `placement`, `rank`, `created_at`, `updated_at`,
  optional `alias`, `tags`, `schema`, `extra`.
- **Body**: Markdown content; title is the first H1.
- Exactly **one active placement** in the logical graph.
- Created under the **date section** matching its creation date.
- Can be **moved** to another placement; the physical file location remains under its original date;
  frontmatter (`placement`, `rank`) is updated. After move, it is excluded from the original date's
  listing.
- Has **rank (LexoRank)** for ordering within its placement.
- May also act as a parent (can have children).
- State transitions: `close`, `reopen`.
- Kinds: `note`, `task`, `event`.

### Section

- A **hierarchical numeric path** under a parent Item: `.../1`, `.../1/2`, `.../3/2/1`, etc.
- A **date section** exists **only at the head of a path**: `YYYY-MM-DD`, `today`, `tomorrow`, etc.
- Relative date forms are **always evaluated from "today"** in the workspace timezone.
- **Top level of the graph is Calendar (year/month/day)**; Items are initially placed under their
  creation date section.

### Path vs Placement

- **Path**: User-facing expression that may contain syntactic sugar (relative dates like `today`,
  aliases, navigation tokens like `.` or `..`). Used for CLI input.
- **Placement**: Normalized, absolute logical position stored in Item's frontmatter. Contains only
  absolute dates (`YYYY-MM-DD`) and UUIDs (no aliases, no relative tokens). This is the canonical
  representation in the domain model.

All user-provided paths are resolved to placement before being stored in frontmatter.

### Workspace

- Holds one graph of Items plus alias/context metadata.
- Fixed timezone for date partitioning (e.g., `"Asia/Tokyo"`). Changing TZ would require full
  re-partition; **not supported**.
- Optional Git sync configuration (`sync.vcs`, `sync.enabled`, `sync.mode`,
  `sync.git.remote`, `sync.git.branch`):
  - `mode="auto-commit"`: auto-commit after state changes (local only).
  - `mode="auto-sync"`: auto-commit + pull(rebase) + push after state changes.

## 4) On-Disk Layout

```
/<workspace-root>/
  workspace.json                          # { schema, migration, timezone, sync }
  items/
    YYYY/MM/DD/
      <uuidv7>.md                         # Single file: YAML Frontmatter + Markdown body
                                          # Frontmatter: id, kind, status, placement, rank,
                                          #              created_at, updated_at, alias?, tags?, schema, ...
                                          # Body: Markdown content
  .index/                                 # Cache/index (Git-ignored, rebuildable)
    graph/
      dates/
        YYYY-MM-DD/
          <child-uuid>.edge.json          # { schema, to, rank }
      parents/
        <parent-uuid>/
          <child-uuid>.edge.json          # Direct child
          1/                              # Numbering section "1"
            <child-uuid>.edge.json
            3/                            # Nested section "1/3"
              <child-uuid>.edge.json
    aliases/
      <hh>/
        <hash>.alias.json                 # { schema, raw, canonical_key, created_at }
    completion_aliases.txt                # Shell completion cache: recently used aliases
    completion_context_tags.txt           # Shell completion cache: recently used tags
  tags/
    <hash>.tag.json                       # { schema, raw, canonical_key, created_at, description? }
```

**Key points**

- **Single file per Item**: `<uuid>.md` contains both metadata (Frontmatter) and content (Markdown
  body).
- **Frontmatter is authoritative**: The Item's `placement` and `rank` in Frontmatter are the single
  source of truth.
- **`.index/graph` is rebuildable cache**: Edge files mirror Frontmatter placement for efficient
  traversal; regenerated via `mm doctor rebuild-index`.
- **Git-ignored index**: `.index/` directory is not committed; each machine rebuilds it locally.

## 5) Ordering & Ranks

- **Frontmatter `rank`**: ordering within the Item's current placement (stored in `placement`
  field).
- **Edge files**: mirror the `rank` from Frontmatter for efficient traversal.
- LexoRank (string) supports stable insertions (`head`, `tail`, `before:<id>`, `after:<id>`).
  Periodic rebalancing may be performed by maintenance (`mm doctor rebalance-rank <paths...>`).

## 6) Movement & Placement

- Items have **one active placement** at a time.
- Move updates **Frontmatter `placement` and `rank`** fields so that:
  - the item **disappears** from its original day listing,
  - appears in the new placement.
- Physical path stays under original `YYYY/MM/DD/<uuidv7>.md`.
- Edge files in `.index/graph` are rebuilt to reflect the new placement.

## 7) Aliases & Contexts

- **Alias**: human-friendly slug → `item_id` mapping (ASCII slug recommended).
- **Context**: metadata for filtering (e.g., `github.context.json`).
- Aliases use canonical key (NFKC + casefold) for uniqueness and lookups.

## 8) Time & Ranges

- All date math uses **workspace timezone**.
- Relative tokens: `today|td`, `tomorrow|tm`, `next-monday|mon+`, `1d+|1d-`, etc.
- Ranges use `A..B` (inclusive): `2025-09-01..2025-09-07`, `7d-..7d+`, `this-week` (ISO week),
  `this-month`.

## 9) Identifiers & Resolution

- Item IDs: full UUID v7 (no short IDs in current implementation).
- Path notation:
  - Dates: `2025-09-20`, `today`, `tm`, etc.
  - By item/alias: `theme-focus-control`, with optional numeric sections:
    - Slash: `theme-focus-control/1/2`
- Priority when parsing path segments: **date/relative > id > alias**.

## 10) Listing & Sorting

- `list` default sort: **rank asc**, tie-break by `created_at` asc.
- Calendar listings exclude items that have been moved to another placement.

## 11) Validation (pre-save / doctor)

**Frontmatter validation:**

- Required fields present: `id`, `kind`, `status`, `placement`, `rank`, `created_at`, `updated_at`,
  `schema`.
- `id` matches filename `<uuid>.md` and is valid UUID v7.
- `kind` is one of allowed values (e.g., `note`, `task`, `event`).
- `status` is one of allowed values (e.g., `open`, `closed`).
- `placement` is normalized (no relative tokens like `today`, no aliases; only absolute dates and
  UUIDs).
- `rank` is valid LexoRank format.
- `created_at`, `updated_at` are valid ISO-8601 timestamps.
- `schema` is present (e.g., `mm.item.frontmatter/4`).
- `alias` (if present) follows alias rules (no reserved tokens, unique canonical_key).
- YAML is valid and parseable; UTF-8 (NFC), LF newlines.

**Graph validation:**

- Every `*.edge.json` points to an existing **Item** (no edge→edge).
- No duplicate edges (same container + same target).
- No cycles (an Item cannot be a descendant of itself).
- Edge files are consistent with Frontmatter `placement` and `rank`.

**Maintenance:**

- `mm doctor check`: Validate workspace integrity (inspection only, no modifications).
- `mm doctor migrate`: Migrate workspace data to the latest version. See [migration.md](migration.md).
- `mm doctor rebuild-index`: Rebuild `.index/graph` and `.index/aliases` from all Frontmatter data.
- `mm doctor rebalance-rank <paths...>`: Rebalance LexoRank values for items in specified paths to
  restore insertion headroom.

## 12) Git Workflow & Conflict Strategy

- **Git-managed files**:
  - `items/**/*.md` — Item files (Frontmatter + Markdown body; includes authoritative `placement`,
    `rank`, and all metadata)
  - `workspace.json`, `tags/*.tag.json`
- **Git-ignored files** (`.gitignore` includes `.index/`):
  - `.index/graph/**` — Graph index (edge files)
  - `.state.json` — Local session state
  - Edge files are **rebuildable** from Frontmatter via `mm doctor rebuild-index`
- **Conflict resolution**:
  - Changes to Frontmatter are typically line-local (placement, rank, status fields).
  - Frontmatter conflicts surface as YAML diffs and are resolved by reindexing.
  - After `git pull`, if `.index/graph` is out-of-sync, run `mm doctor rebuild-index` to regenerate
    the index from merged Frontmatter.

## 13) Error Handling (CLI)

- Unknown path token → show parse help with examples.
- Move to invalid position (e.g., before id in another parent/section) → explain required context
  (use path-qualified placement).

## 14) Future Work (optional)

- Background index for full-text/tag search (not stored in Git).
- Optional `mm doctor --fix` for safe autofixes.
