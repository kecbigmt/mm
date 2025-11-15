# **mm: A Personal Knowledge Operating System**

*A whitepaper for a path‑centric Item/Section model with logical navigation, Git‑friendly storage, and deterministic ordering.*

**Version:** 1.1 (frontmatter edition)
**Audience:** engineers, product designers, contributors
**Scope:** system design; no concrete implementation code beyond high‑level interface sketches

---

## 1) Summary

**mm** is a personal knowledge operating system that exposes a Unix‑like path over a knowledge graph while keeping human‑editable content in plain text with Git‑friendly diffs.

The system is built from **two primitives**:

* **Item** — an addressable entity (note, task, event, concept). Items can have children.
* **Section** — a numbered (or dated) *shelf* under a parent, addressing a **bucket of siblings**.

Each Item has **exactly one active placement**: *(parent Item or top‑level date, Section path, rank)*. Moving an Item updates **frontmatter (`path`, `rank`) and edge files**; physical file **location** never moves.

Navigation adopts Unix semantics (`cd`, `ls`, `pwd`) with `.` and `..` that work **across both node and section levels**. A single `/` separator is used everywhere. The workspace time zone is **fixed**.

---

## 2) Goals & Non‑Goals

### Goals

* **Simple diffs, conflict‑resistant Git workflow.**
* **One mental model**: Items placed under Items, split by **Sections**; one active placement per Item.
* **Fast navigation** by dates, aliases, or IDs; **path‑first** UX with logical CWD.
* **Deterministic ordering** via **LexoRank**.
* **Fixed workspace TZ** for all date math; **relative dates are always “today”‑relative**.

### Non‑Goals

* Multi‑placement (no simultaneous presence in multiple parents).
* Filesystem symlink semantics.
* Time‑zone migrations (changing TZ requires a full re‑partition).

---

## 3) Core Concepts

### 3.1 Item

* **Identity**: UUID v7 (timestamp‑embedded).
* **Content**: Single `.md` file with **YAML Frontmatter + Markdown body**.
* **Frontmatter fields**: `id`, `kind`, `status`, `path`, `rank`, `created_at`, `updated_at`, optional `alias`, `tags`, `schema`, `extra`.
* **Body**: Markdown content; title is the first H1.
* Exactly **one active placement** in the logical graph.

### 3.2 Section

* A **hierarchical numeric path** under a parent Item:
  `…/1`, `…/1/2`, `…/3/2/1`, …
* A **date section** exists **only at the head of a path**:
  `YYYY‑MM‑DD`, `today|tomorrow|yesterday|td|tm|yd`, `+2w`, `~fri`, etc.
  (Relative forms are **always evaluated from “today”** in the workspace TZ.)

### 3.3 Implicit Root (no `root/` token)

* There is a single **workspace root** (conceptual origin) that is **not** spelled in paths.
* A path **starts** either with:

  * a **date section** (top‑level “day shelf”), or
  * a **node reference** (alias or UUID), or
  * `.` / `..` (relative).

### 3.4 Invariants

* **Single parent** (active placement): an Item cannot be in two places at once.
* **No cycles**: an Item cannot be a descendant of itself.
* **No duplicate edges** within the same (parent, section).
* **Physical immobility**: files live under their **creation date** forever; moves update only edges.

---

## 4) Path, Identifiers & Resolution

### 4.1 Path Model

A **path** is a `/`‑separated sequence of **segments**. Each segment is either:

* a **node**: `.` | `..` | **UUID v7** | **alias**
* a **section**: a **number** (numeric section) or a **date** (date section)

> **Date sections** are valid **only as the head** of a path. After a date head, you can descend into nodes and further numeric sections:
> `2025-09-01/book/1/3`

### 4.2 `.` and `..`

* `.`: stay at the **current node/section**.
* `..`: go **up one segment** (whether the current segment is a node or a section).
  From `2025-09-01/book/1/3`, `../2` → `2025-09-01/book/1/2`.

Top‑level `..` remains at the top‑level.

### 4.3 Ranges (final segment only)

A **range** is an operator on the **final** section segment:

* **Numeric range**: `…/prefix/x..y`
  Valid iff `x` and `y` share the same numeric **prefix** and **depth**, and `x ≤ y`.
* **Date range** (head only): `YYYY‑MM‑DD..YYYY‑MM‑DD`, `~mon..+fri`, `2025‑09‑01..+2w`, etc.
  All relative forms are **expanded from “today”** to absolute dates before comparison.

Ranges are **inclusive**. If a path ends in a range, it’s a **selector for `ls`**, not a location for `cd`.

### 4.4 Identifiers

* **IDs**: full UUID v7 (no shortened IDs).
* **Aliases**: Unicode slug: letters/numbers/marks from any script plus `_` `-` `.`; no whitespace/control; length 1–64 code points.
  **Reserved / disallowed as aliases** (canonical key; see below):

  * `.` and `..`
  * **pure digits**: `^\d+$`
  * **absolute dates**: `^\d{4}-\d{2}-\d{2}$`
  * **relative date tokens**: `^(today|tomorrow|yesterday|td|tm|yd)$`
  * **relative date ops**: `^[~+](?:\d+[dwmy]|mon|tue|wed|thu|fri|sat|sun)$`
  * Strings containing `..` (to avoid confusion with ranges)

**Canonicalization**: `canonical_key := NFKC + casefold`. Store **raw** and **canonical_key**; uniqueness & lookups use **canonical_key** only.

### 4.5 Resolution Priority (per node segment)

1. **UUID v7** → Item
2. **Alias** → Item
3. `.` / `..` relative
   If a token is a **date** and appears at the **head**, it selects the date section (top‑level day shelf).

Ambiguities (e.g., missing nodes) return a clear error with candidates and hints.

---

## 5) Logical Navigation (Unix semantics)

### 5.1 Commands

* `cd <path>` — move CWD to a **single** location (no ranges).
* `pwd` — print the normalized path.
* `ls [<path>]` — list CWD or a target (path may end with a **range**).

### 5.2 Behavior & Examples

* From `2025-09-01/book/1/3`:

  * `cd ../2` → `2025-09-01/book/1/2`
  * `cd ../../quote` → `2025-09-01/book/quote`
* Date heads:

  * `cd today` → top‑level **today** section
  * `ls ~mon..+fri` → list from last Monday through next Friday (**today**‑relative)
* Numeric ranges:

  * `ls book/1/1..5` → pages 1..5 under chapter 1
* **Invalid**:

  * `cd book/1/1..5` → error (“`cd` accepts a single location; use `ls` for ranges”)
  * `book/today` → error (date sections only valid at the head)

### 5.3 State

* Session env var `MM_CWD`. A helper prints `export MM_CWD=...` for shell eval.
* Workspace default in `~/.mm/<workspace>/.state.json` (e.g., default CWD = `today`).
* If CWD becomes invalid, mm falls back to the nearest valid ancestor; if none, to **today**.

---

## 6) On‑Disk Layout

```
~/.mm/
  <workspace>/
    .gitignore             # ignores .state.json, .index/ and other local caches
    .state.json            # { "default_cwd": "<normalized path>" }
    workspace.json         # { "timezone": "Asia/Tokyo" }

    items/
      YYYY/
        MM/
          DD/
            <uuidv7>.md                      # Single file: YAML Frontmatter + Markdown body
                                             # Frontmatter: id, kind, status, path, rank,
                                             #              created_at, updated_at, alias?, tags?, ...
                                             # Body: Markdown content (title = first H1)

    tags/
      <hash>.tag.json                        # { schema, raw, canonical_key, created_at, description? }

    .index/                                  # Cache/index directory (Git-ignored, rebuildable)
      graph/                                 # Graph index (rebuildable from Frontmatter)
        dates/                               # Top-level date section edges
          2025-04-01/
            <child-uuid>.edge.json           # { schema, to, rank }
          2025-04-02/
            <child-uuid>.edge.json
        parents/                             # Parent item edges
          <parent-uuid>/
            <child-uuid>.edge.json           # Direct child: { schema, to, rank }
            1/                               # Numeric section 1
              <child-uuid>.edge.json
              3/                             # Nested section 1/3
                <child-uuid>.edge.json
      aliases/
        <hh>/
          <hash>.alias.json                  # { schema, raw, canonical_key, created_at }
```

**Notes**

* **Single file per Item**: `<uuid>.md` contains both metadata (Frontmatter) and content (Markdown body).
* **Frontmatter is authoritative**: The **single source of truth** for an Item's logical placement is:
  * Frontmatter → `path` (normalized logical path, e.g., `2025-01-09/<itemId>/1/3`)
  * Frontmatter → `rank` (LexoRank string for ordering)
  * Frontmatter → `id`, `kind`, `status`, `created_at`, `updated_at`, and other metadata
* **Graph index (`.index/graph`)**: Edge files are **purely derived index/cache**:
  * They mirror the placement information from Frontmatter for efficient graph traversal.
  * They can be **completely rebuilt** from Frontmatter using `mm doctor --rebuild-index`.
  * This directory is **Git-ignored** (`.gitignore` includes `.index/`).
* **Edge file locations**:
  * **Date sections**: `.index/graph/dates/<YYYY-MM-DD>/<childId>.edge.json` for items placed directly under a date.
  * **Parent sections**: `.index/graph/parents/<parentId>/<section-path>/<childId>.edge.json` for items placed under a parent Item's section.
    * Example: Item at `2025-09-01/<parentId>/1/3` → edge at `.index/graph/parents/<parentId>/1/3/<childId>.edge.json`
* The **title** is the first non‑empty H1 in the Markdown body. If no H1 is found, the Item is **Untitled**.
* Filenames for alias/tag indexes use **hash(canonical_key)** to avoid Unicode normalization pitfalls.

---

## 7) Deterministic Ordering (LexoRank)

* Siblings in the same (parent, section) are ordered by **LexoRank** (string).
* Insert modes:

  * `head`, `tail`
  * `before:<sibling-id>`, `after:<sibling-id>`
* Rebalancing: `mm doctor --reindex` when density gets high.
* Stable display tiebreak: `created_at` ascending.

---

## 8) Create / Move / List Semantics

### 8.1 Create

* Default: create at **CWD tail**:

  ```bash
  mm n "some note"
  ```
* Explicit parent & Section:

  ```bash
  mm n "quote" --parent book/3
  ```
* Physical path is always `items/<creation-date>/<uuid>/…`.

### 8.2 Move (placement)

```
mm mv <id> <placement>
```

**Placement forms**

* **Placement bin** (`<path>` describing a parent and (optionally) a numeric section or head date):

  * `head:<path>`
  * `tail:<path>`
  * `<path>` (same as `tail:<path>`)
* **Relative to a sibling** (adopts sibling's parent + section):

  * `after:<id2>`
  * `before:<id2>`

> Physical files do not move; only **Frontmatter `path` and `rank`** are updated, and edge files in `.index/graph` are rebuilt.

### 8.3 List

* `mm ls` lists the CWD by **rank asc**, then **created_at asc**.
* `mm ls <path>` lists a target without changing CWD.
* **A day shelf list** excludes Items that have been moved away (the day shelf is birthplace, not current placement).

### 8.4 Inspect

* `mm where <id>` prints **Logical** path and **Physical** path (filesystem path).

---

## 9) Time & Ranges

* Workspace time zone is fixed (e.g., `"Asia/Tokyo"`).
* **Relative weekdays**: `+mon|tue|…|sun`, `~mon|…|sun` — always **relative to today** (strict next/previous even if today is that weekday).
* **Relative periods**: `±Nd`, `±Nw`, `±Nm`, `±Ny` — always **relative to today**.
* **Ranges**:

  * **Date (head only)**: `dateA..dateB`, `dateA..+period`, `~weekday..+period`, `~weekday..+weekday`, …
  * **Numeric (under any Item)**: `…/a/b/…/x..y` with the **same prefix & depth** and **x ≤ y**.

Prohibited:

* Ranges anywhere except the **final segment**.
* Date sections outside the **head** of a path.
* Reversed numeric ranges (`…/x..y` with `x > y`) or crossing prefixes.

---

## 10) Validation & Doctor

**Frontmatter validation:**
* Required fields present: `id`, `kind`, `status`, `path`, `rank`, `created_at`, `updated_at`.
* `id` matches filename `<uuid>.md` and is valid UUID v7.
* `kind` is one of allowed values (e.g., `note`, `task`, `event`).
* `status` is one of allowed values (e.g., `inbox`, `scheduled`, `closed`, `discarded`).
* `path` is normalized (no relative tokens like `today`).
* `rank` is valid LexoRank format.
* `created_at`, `updated_at` are valid ISO-8601 timestamps.
* `alias` (if present) follows alias rules (no reserved tokens, unique canonical_key).
* YAML is valid and parseable; UTF-8 (NFC), LF newlines.

**Graph validation:**
* Every `*.edge.json` points to an existing **Item** (no edge→edge).
* No duplicates within the same (parent, section).
* No cycles in the parent/child graph.
* Edge files are consistent with Frontmatter `path` and `rank`.
* Aliases are unique (index enforces uniqueness).
* Date heads are valid, ranges are semantically valid (order, depth/prefix).

**Maintenance**

* `mm doctor --rebuild-index`: Rebuild `.index/graph` from all Frontmatter data. Use when:
  * Cloning workspace on a new machine (`.index/` is Git-ignored)
  * Index becomes corrupted or out-of-sync
  * After version updates that change index format
  * Process:
    1. Scan all `items/**/*.md` files and parse Frontmatter
    2. Parse each `path` to extract (date-head or parentId, numeric section path)
    3. Group children by (parent, section) and sort by `rank`
    4. Write edge files to `.index/graph/dates/` and `.index/graph/parents/`
* `mm doctor --reindex`: Rank compaction (rebalances LexoRank values).
* `mm doctor --fix`: Conservative safe fixes for data integrity issues.

---

## 11) MCP Server & Interfaces (sketch)

The MCP surface mirrors CLI semantics 1:1.

**Capabilities (illustrative)**

* `resolve(path) → { kind: "single" | "range", head, steps }`
* `cwd.get() → Path` / `cwd.set(Path)`
* `items.get(id) → Item`
* `items.list(parent_path) → [Child]`     // accepts head or final‑range
* `items.create(title, parent_path?, insertion?) → { item, placement }`
* `items.move(id, placement: { head|tail:<path> | after|before:<id2> })`
* `items.close(id)` / `items.reopen(id)`
* `inspect.where(id) → { logical: Placement, physical: FsPath }`

> Wire formats and authentication are out of scope.

---

## 12) Concurrency, Git, and Conflict Strategy

* Writes are **atomic** (temp file + rename).
* **Git-managed files**:
  * `items/**/*.md` — Item files (Frontmatter + Markdown body; includes authoritative `path`, `rank`, and all metadata)
  * `workspace.json`, `tags/*.tag.json`, and other config files
* **Git-ignored files** (`.gitignore` includes `.index/`):
  * `.index/graph/**` — Graph index (edge files)
  * `.state.json` — Local session state
  * Edge files are **rebuildable** from Frontmatter via `mm doctor --rebuild-index`
* **Conflict resolution**:
  * Changes to Frontmatter are typically line‑local (path, rank, status fields).
  * Frontmatter conflicts surface as YAML diffs and are resolved by reindexing.
  * Competing moves on the same Item → last‑writer wins at the Frontmatter level (Markdown body unaffected).
  * After `git pull`, if `.index/graph` is out-of-sync, run `mm doctor --rebuild-index` to regenerate the index from merged Frontmatter.

---

## 13) Security & Integrity

* Everything is plain text; no hidden binaries in core storage.
* Optional hardening (e.g., signed commits) can be layered externally.
* Sensitive data policy remains the workspace owner’s responsibility.
* Indexing with **hashed canonical keys** avoids platform‑dependent Unicode normalization pitfalls and reduces spoofing via look‑alike characters (room for UTS#39 confusable checks later).

---

## 14) Appendix A — CLI Surface

### Navigation

```bash
mm pwd
mm cd <path>            # e.g., 2025-09-22, book/3, 2025-09-22/book/3, ../2, ../../alias
mm cd ..                # up one segment (node or section)
mm ls                   # list CWD
mm ls <path>            # list a target; final segment may be a range
```

### Create / Edit / State

```bash
mm n|note|task|event "title" [--parent <path>] [--context <tag>...]
mm edit|e <id>
mm close|cl <ids...>
mm reopen|op <ids...>
```

### Move / Remove

```bash
mm mv <id> head:<path>
mm mv <id> [tail:]<path>
mm mv <id> after:<id2>
mm mv <id> before:<id2>
mm remove|rm <ids...>
```

### Inspect

```bash
mm where <id>          # prints Logical (parent, section, rank) & Physical FS path
```

Examples:

```bash
# From 2025-09-01/book/1/3
mm cd ../2             # -> 2025-09-01/book/1/2
mm ls 2025-09-01..+2w  # head date range (today-relative expansion on the right)
mm ls book/1/1..5      # numeric range under the same parent + prefix
```

---

## 15) Appendix B — Token Grammar (EBNF)

```ebnf
path              = head , { "/" , segment } ;

head              = date-head | segment ;

date-head         = date-section ;                      (* head-only date selector *)

segment         = node | section | range-section ;    (* range allowed only as final segment *)

node              = "." | ".." | id-token | alias-token ;

section           = numeric-section | date-section ;    (* date-section is head-only *)

range-section     = section , ".." , section ;          (* final segment only *)

numeric-section   = num ;                               (* 1,2,3,... chained as /1/3/5 *)

date-section      = absdate
                  | date-keyword
                  | relperiod                           (* today-relative: ±Nd/Nw/Nm/Ny *)
                  | relweekday ;                        (* today-relative: ~mon/+fri *)

date-keyword      = "today" | "td" | "tomorrow" | "tm" | "yesterday" | "yd" ;

relperiod         = ("~" | "+") , integer , ("d" | "w" | "m" | "y") ;
relweekday        = ("~" | "+") , ("mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun") ;

absdate           = yyyy , "-" , mm , "-" , dd ;
id-token          = uuidv7 ;
alias-token       = unicode-slug    (* disallow: "." ".." pure-digits YYYY-MM-DD today/tm/yd etc., and ".." substring *)

num               = digit , { digit } ;
yyyy              = digit , digit , digit , digit ;
mm                = digit , digit ;
dd                = digit , digit ;
```

### Semantic constraints (not expressible in EBNF)

1. **Date sections are head‑only.**
   If a date token appears outside the head position, it is invalid.

2. **Ranges are final‑segment only.**
   If `..` appears before the final segment, it is invalid.

3. **Numeric ranges**
   Both ends must share the **same prefix and depth**; the final segment must be **non‑decreasing**.

4. **Date ranges**
   Both ends must normalize to valid dates; relative forms are expanded **from “today”** first.

5. **Alias canonicalization & reservations**

   * `canonical_key := NFKC + casefold`.
   * Uniqueness and search operate on `canonical_key`.
   * Aliases cannot be `.`, `..`, pure digits, absolute dates, or relative date tokens/ops; aliases cannot contain `..`.

---

## 16) Appendix C — Alias Autogeneration

When an Item is created without an explicit alias, mm generates a **pronounceable slug**:

```
auto_alias := C V C V "-" base36^3
C := one consonant in [b c d f g h j k l m n p q r s t v w x y z]
V := one vowel in [a e i o u]
base36 := [0-9a-z]
```

**Examples:** `bugi-j1a`, `pako-9rw`

* Auto aliases are lowercase ASCII.
* Users may later set a Unicode alias; **uniqueness is evaluated against `canonical_key`**.
* The alias index (`.index/aliases/…`) enforces uniqueness.

---

## Notes on eliminating `root/`

* The **conceptual root** still exists (it’s where **day shelves** live), but it is **implicit**.
* **Date sections** serve as **head selectors** for those day shelves; path heads like `today`, `2025-09-22`, `~mon` directly address them.
* All earlier rules that depended on `root/` map cleanly to **“head‑only date sections”** in the rootless syntax.

---

**End of document.**
