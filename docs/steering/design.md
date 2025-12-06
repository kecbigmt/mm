# Project Design

**Role**: This document defines the **product design, domain model, and architecture**—the foundational knowledge about what mm is, how it works, and core design decisions. This is a stock-type document maintained throughout the project lifecycle.

---

## 1) Overview

mm is a personal knowledgement CLI tool with built-in MCP server.

It has a local-files PKM system unifying GTD / Bullet Journal / Zettelkasten around concise
vocabulary: people interact with **Items** that live inside **Containers**, while the code models
their union as a single Node algebraic data type. Items are created under a date container
(Calendar), never moved physically; "moves" update frontmatter (placement, rank) and edge files.

## 2) Goals / Non-Goals

**Goals**

- Simple diffs, conflict-resistant Git workflow.
- One mental model: Item inside a Container, single active placement per Item.
- Fast navigation by date, numbering paths, or aliases.
- Deterministic ordering via ranks (LexoRank).

**Non-Goals**

- Multi-placement (no simultaneous presence in multiple containers).
- Cross-platform symlinks.
- Timezone migrations (workspace TZ is fixed).

## 3) Core Concepts

### Node (domain core)

- Has 0 or 1 parent Node.
- Two concrete kinds in code: `Container` and `Item`.

### Container (user vocabulary)

- No content “body”; acts as a fixed **place** to hold Nodes.
- Not movable; addressed by a **path**.
- Can contain 0+ Nodes.
- Has a **sequential number** within its level (sibling order).
- **Top level of the graph is Calendar (year/month/day)**; Items are initially stored under their
  creation date.

### Item

- Must have exactly **one current parent container**.
- Has content: single `.md` file with **YAML Frontmatter + Markdown body**.
- Identified by **UUID v7** (creation timestamp embedded).
- Created under the **date Container** matching its creation date.
- Can be **moved** to another container; the physical file location remains under its original date;
  frontmatter (`placement`, `rank`) and edge files are updated. After move, it is **excluded** from
  the original date's listing.
- Has per-container **rank (LexoRank)** for ordering.
- May also act as a container (can have children).
- Frontmatter fields: `id`, `kind`, `status`, `placement`, `rank`, `created_at`, `updated_at`,
  optional `alias`, `tags`, `schema`, `extra`.
- State transitions: `close`, `reopen`.

### Workspace

- Holds one graph of Nodes plus alias/context metadata.
- Fixed timezone for date partitioning (e.g., `"Asia/Tokyo"`). Changing TZ would require full
  re-partition; **not supported**.

## 4) On-Disk Layout

```
/<workspace-root>/
  workspace.json                          # { timezone: "Asia/Tokyo" }
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
  tags/
    <hash>.tag.json                       # { schema, raw, canonical_key, created_at, description? }
```

**Key points**

- **Single file per Item**: `<uuid>.md` contains both metadata (Frontmatter) and content (Markdown
  body).
- **Frontmatter is authoritative**: The Item's `placement` and `rank` in Frontmatter are the source
  of truth.
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

- Items have **one active container** at a time.
- Move updates **Frontmatter `placement` and `rank`** fields so that:

  - the item **disappears** from its original day listing,
  - appears in the new container in the specified position.
- Physical path stays under original `YYYY/MM/DD/<uuidv7>.md`.
- Edge files in `.index/graph` are rebuilt to reflect the new placement.

## 7) Aliases & Contexts

- **Alias**: human-friendly slug → `item_id` mapping (ASCII slug recommended).
- **Context**: metadata for filtering (e.g., `github.context.json`).

## 8) Time & Ranges

- All date math uses **workspace timezone**.
- Relative tokens: `today|td`, `tomorrow|tm`, `next-monday|mon+`, `1d+|1d-`, etc.
- Ranges use `A..B` (inclusive): `2025-09-01..2025-09-07`, `7d-..7d+`, `this-week` (ISO week),
  `this-month`.

## 9) Identifiers & Resolution

- Item IDs: full UUID v7 or **short suffix** (min 7 chars; auto-expand to uniqueness).
- Container notation:

  - Dates: `2025-09-20`, `today`, `tm`, etc.
  - By node/alias: `theme-focus-control`, and optional numbering paths:

    - Slash: `theme-focus-control/1/2`
    - Colon/Dashes: `theme-focus-control:1-2`
- Priority when parsing container tokens: **date/relative > id/short-id > alias**.

## 10) Listing & Sorting

- `list` default sort: **rank asc**, tie-break by `created_at` asc.
- Calendar listings exclude items that have been moved to another container.

## 11) CLI (current surface)

```
# create items
mm new|note|n [title] [-p <project>] [-c <context>] [-i <container>]
mm task [title] [-p ...] [-c ...] [-i ...]
mm event|ev [title] [-p ...] [-c ...] [-i ...]

# edit / view
mm edit|e <id>
mm list|ls <container|container_range> [--all|-a]

# move (relocate single active placement)
mm move|mv <ids...> <placement>

# state
mm close|cl <ids...>
mm reopen|op <ids...>

# delete
mm remove|rm <ids...>

# placement syntax
2025-09-20              # tail of that day
tail:2025-09-20         # explicit tail
head:2025-09-20         # head
head | tail             # head/tail of current container
before:<id> | after:<id>
```

## 12) Validation (pre-save / doctor)

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
- `schema` is present (e.g., `mm.item.frontmatter/2`).
- `alias` (if present) follows alias rules (no reserved tokens, unique canonical_key).
- YAML is valid and parseable; UTF-8 (NFC), LF newlines.

**Graph validation:**

- Every `*.edge.json` points to an existing **Item** (no edge→edge).
- No duplicate edges (same container + same target).
- No cycles (an Item cannot be a descendant of itself).
- Edge files are consistent with Frontmatter `placement` and `rank`.

**Maintenance:**

- `mm doctor check`: Validate workspace integrity (inspection only, no modifications).
- `mm doctor rebuild-index`: Rebuild `.index/graph` and `.index/aliases` from all Frontmatter data.
- `mm doctor rebalance-rank <paths...>`: Rebalance LexoRank values for items in specified paths to
  restore insertion headroom.

## 13) Error Handling (CLI)

- Ambiguous short id → show candidates, abort.
- Unknown container token → show parse help with examples.
- Move to invalid position (e.g., before id in another container) → explain required context (use
  container-qualified placement).

## 14) Future Work (optional)

- Background index for full-text/tag search (not stored in Git).
- Optional `mm doctor --fix` for safe autofixes.
