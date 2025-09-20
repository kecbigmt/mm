
## 1) Overview

mm is a personal knowledgement CLI tool with built-in MCP server.

It has a local-files PKM system unifying GTD / Bullet Journal / Zettelkasten via a single **Node** model, stored as plain Markdown + JSON, Git-friendly. Items are created under a date container (Calendar), never moved physically; “moves” are reference (edge) relocations.

## 2) Goals / Non-Goals

**Goals**

* Simple diffs, conflict-resistant Git workflow.
* One mental model: Node (Container/Item), single active placement per Item.
* Fast navigation by date, numbering paths, or aliases.
* Deterministic ordering via ranks (LexoRank).

**Non-Goals**

* Multi-placement (no simultaneous presence in multiple containers).
* Cross-platform symlinks.
* Timezone migrations (workspace TZ is fixed).

## 3) Core Concepts

### Node (abstract)

* Has a name and 0 or 1 parent Node.
* Two concrete kinds: **ContainerNode**, **ItemNode**.

### ContainerNode

* No content “body”; acts as a fixed **place** to hold Nodes.
* Not movable; addressed by a **path**.
* Can contain 0+ Nodes.
* Has a **sequential number** within its level (sibling order).
* **Top level of the graph is Calendar (year/month/day)**; Items are initially stored under their creation date.

### ItemNode

* Must have exactly **one current parent container**.
* Has content: `content.md` and `meta.json`.
* Identified by **UUID v7** (creation timestamp embedded).
* Created under the **date Container** matching its creation date.
* Can be **moved** to another container; the physical file remains under its original date; only **edges** (references) change. After move, it is **excluded** from the original date’s listing.
* Has per-container **rank (LexoRank)** for ordering.
* May also act as a container (can have children).
* Data fields (subset, deferred exact schema): title, status (open|closed), body, icons (open/closed for note/task/event), start\_at, duration, due\_at, context tags, optional alias slug.
* State transitions: `close`, `reopen`.

### Workspace

* Holds one graph of Nodes plus alias/context metadata.
* Fixed timezone for date partitioning (e.g., `"Asia/Tokyo"`). Changing TZ would require full re-partition; **not supported**.

## 4) On-Disk Layout

```
/<workspace-root>/
  workspace.json                          # { timezone: "Asia/Tokyo" }
  nodes/
    YYYY/MM/DD/
      <uuidv7>/
        content.md                        # Markdown body (human-editable)
        meta.json                         # { schema, id, icon, title, rank, created_at, status, ... }
        edges/
          <uuid>.edge.json                # child edge (Item → Item), e.g. { rank }
          ...
          0001/                           # numbering segment "1"
            <uuid>.edge.json              # { schema, node_id?, rank }
            0002/                         # numbering "1-2"
              <uuid>.edge.json
          0002/
            <uuid>.edge.json
          ...
  aliases/
    <slug>.alias.json                     # { schema, node_id: "<uuidv7>", created_at }
  contexts/
    <slug>.context.json                   # { schema, description, created_at }
```

**Edge files**

* File name is `<target-id>.edge.json`. The target id is therefore known from the filename; `node_id` inside JSON is optional (if present, must match).
* `rank` orders children **within that container/segment**.

**Mixing is allowed** within `edges/`: direct child edges and numbering subfolders (e.g., `edges/0001/...`) can coexist.

## 5) Ordering & Ranks

* **`meta.json.rank`**: ordering **within the item’s creation-day container** (Calendar day).
* **`*.edge.json.rank`**: ordering **within the current container** (date or numbering path).
* LexoRank (string) supports stable insertions (`head`, `tail`, `before:<id>`, `after:<id>`). Periodic rebalancing may be performed by maintenance (`doctor --reindex`).

## 6) Movement & Placement

* Items have **one active container** at a time.
* Move updates edges and internal placement state so that:

  * the item **disappears** from its original day listing,
  * appears in the new container in the specified position.
* Physical path stays under original `YYYY/MM/DD/<uuidv7>/`.

## 7) Aliases & Contexts

* **Alias**: human-friendly slug → `node_id` mapping (ASCII slug recommended).
* **Context**: metadata for filtering (e.g., `github.context.json`).

## 8) Time & Ranges

* All date math uses **workspace timezone**.
* Relative tokens: `today|td`, `tomorrow|tm`, `next-monday|mon+`, `1d+|1d-`, etc.
* Ranges use `A..B` (inclusive): `2025-09-01..2025-09-07`, `7d-..7d+`, `this-week` (ISO week), `this-month`.

## 9) Identifiers & Resolution

* Item IDs: full UUID v7 or **short suffix** (min 7 chars; auto-expand to uniqueness).
* Container notation:

  * Dates: `2025-09-20`, `today`, `tm`, etc.
  * By node/alias: `theme-focus-control`, and optional numbering paths:

    * Slash: `theme-focus-control/1/2`
    * Colon/Dashes: `theme-focus-control:1-2`
* Priority when parsing container tokens: **date/relative > id/short-id > alias**.

## 10) Listing & Sorting

* `list` default sort: **rank asc**, tie-break by `created_at` asc.
* Calendar listings exclude items that have been moved to another container.

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

* Every `*.edge.json` points to an existing **Item** (no edge→edge).
* No duplicate edges (same container + same target).
* No cycles (an Item cannot be a descendant of itself).
* JSON schema version matches; UTF-8 (NFC), LF newlines.
* Short IDs resolve uniquely (otherwise return ambiguity error).

## 13) Error Handling (CLI)

* Ambiguous short id → show candidates, abort.
* Unknown container token → show parse help with examples.
* Move to invalid position (e.g., before id in another container) → explain required context (use container-qualified placement).

## 14) Future Work (optional)

* Background index for full-text/tag search (not stored in Git).
* Bulk rank rebalancing heuristics.
* Optional `mm doctor --fix` for safe autofixes.

