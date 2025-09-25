# **mm: A Unix‑Native Knowledge Operating System**

_A whitepaper for the Item/Section model with logical navigation, Git‑friendly storage, and
deterministic ordering._

**Version:** 1.0 (design draft, updated) **Audience:** engineers, product designers, contributors
**Scope:** system design; no concrete implementation code beyond high‑level interface sketches

---

## Table of Contents

1. [Summary](#summary)
2. [Goals & Non‑Goals](#goals--non-goals)
3. [Core Concepts](#core-concepts)
4. [Identifiers & Resolution](#identifiers--resolution)
5. [Logical Navigation (Unix semantics)](#logical-navigation-unix-semantics)
6. [On‑Disk Layout](#on-disk-layout)
7. [Deterministic Ordering (LexoRank)](#deterministic-ordering-lexorank)
8. [Create / Move / List Semantics](#create--move--list-semantics)
9. [Time & Ranges](#time--ranges)
10. [Validation & Doctor](#validation--doctor)
11. [MCP Server & Interfaces (sketch)](#mcp-server--interfaces-sketch)
12. [Concurrency, Git, and Conflict Strategy](#concurrency-git-and-conflict-strategy)
13. [Security & Integrity](#security--integrity)
14. [Appendix A — CLI Surface](#appendix-a--cli-surface)
15. [Appendix B — Token Grammar (EBNF)](#appendix-b--token-grammar-ebnf)
16. [Appendix C — Alias Autogeneration](#appendix-c--alias-autogeneration)

---

## Summary

**mm** is a personal knowledge **Operating System** that exposes a logical, filesystem‑like
navigation layer for a knowledge graph while keeping human‑editable content in plain text with
Git‑friendly diffs.

The system is built from **two primitives**:

- **Item** — an addressable entity (note, task, event, concept). Items can have children.
- **Section** — a numbered (or dated) _shelf_ under a parent Item, written as a path like `:3-2`
  (numeric) or `:2025-09-22` (date).

Each Item has **exactly one active placement**: _(parent Item, Section path, rank)_. Moving an Item
updates **edges only**; physical files never move.

Navigation adopts Unix semantics (`cd`, `ls`, `pwd`, relative `.`/`..`/`-`) and a Git‑inspired
relative notation for neighbors (`~N` = N steps back, `+N` = N steps forward). The workspace time
zone is fixed.

---

## Goals & Non‑Goals

### Goals

- **Simple diffs, conflict‑resistant Git workflow.**
- **One mental model**: Items placed under Items, split by **Sections**; one active placement per
  Item.
- **Fast navigation** by dates, aliases, or IDs; _logical CWD_ to reduce typing.
- **Deterministic ordering** via **LexoRank** (stable inserts).
- **Fixed workspace TZ** for all date math.

### Non‑Goals

- **Multi‑placement** (no simultaneous presence in multiple parents).
- Filesystem symlink semantics.
- Time‑zone migrations (changing TZ would require a full re‑partition).

---

## Core Concepts

### Item

- Identity: **UUID v7** (timestamp‑embedded).
- Content: `content.md` (human‑editable, title in Markdown H1).
- Metadata: `meta.json` (status, timestamps, alias, etc.; _no title_).
- Exactly **one active placement** in the logical graph.

### Section

- A **path** of segments under a parent Item:

  - **Numeric**: `:1`, `:1-2`, `:3-2-1`, …
  - **Date** _(root only)_: `:YYYY-MM-DD`.
- Sections partition a parent’s children (e.g., a book’s chapter/page).

### Root & Date Sections

- `root:` is the global origin.
- **Date Sections are valid only under `root:`.**
- Input like `2025-04-01/...` is sugar for `root:2025-04-01/...` (internally normalized to `root:`).

### Invariants

- **Single parent** (active placement): an Item cannot be in two places at once.
- **No cycles**: an Item cannot be a descendant of itself.
- **No duplicate edges** (same parent + same section + same child).
- **Physical immobility**: files reside under their **creation date** forever; moves update only
  edges.

---

## Identifiers & Resolution

### Tokens

- **Dates / relative dates**: `2025-09-22`, `today`, `td`, `next-monday`, `+mon`, `last-friday`,
  `~fri`, `+2w`, `~1m`, `+7d`, `~10d`, `+1y`, `~2y`, etc. _Relative weekdays and periods are valid
  only under `root:` (date Sections)._
- **IDs**: full **UUID v7** (short IDs are not used).
- **Aliases**: _Unicode slug_ (letters/numbers/marks from any script, plus `_` `-` `.`; no
  whitespace or control chars). Length: **1–64 code points**. Uniqueness is evaluated on a
  **canonical key** (see below). **Reserved shapes** (not allowed as aliases):

  - Absolute dates: `YYYY‑MM‑DD`
  - Numeric‑section shapes: `^\d+(?:-\d+)+$` (e.g., `1-2`, `12-3-4`)
  - Relative step: `^[~+]\d+$`
  - Relative weekday: `^[~+](mon|tue|wed|thu|fri|sat|sun)$`
  - Relative period: `^[~+]\d+[dwmy]$`
- **Aliases (auto‑generated fallback)**: unchanged CVCV‑base36 (ASCII) pattern from Appendix C.
  Users may later override with a Unicode alias; uniqueness still checked on the canonical key.
- **Section path** (numeric): `:<n>` or `:<n>-<m>-…` (numbers only). _Date Sections (`:YYYY-MM-DD`)
  are valid only under `root:`._

### Resolution Priority

1. **Date / relative date** → normalized as `root:YYYY-MM-DD`
2. **ID** (UUID v7)
3. **Alias**

**Section parsing occurs after** resolving the left token (e.g., `book-ppo:3-2`).

**Path chaining:** you may descend through Items with `/`, e.g.:

```
root:2025-04-01/bugi-j1a:1-2/pako-9rw
root:today/book-professional-product-owner:1-2/pako-9rw
2025-04-01/bugi-j1a:1-2/pako-9rw         # 'root:' omitted (sugar)
```

If a UUID/alias is ambiguous (alias must be unique; UUID must be full), mm returns a **clear error**
with candidates.

**Alias/Tag canonicalization**

- **Canonicalization**: when storing/searching aliases and tags, mm computes a **canonical key** as
  **NFKC normalization + casefold** (future room for UTS#39 confusable skeleton if needed).
- **Two‑field model**: store both **raw** (as entered/displayed) and **canonical\_key** (for
  matching/uniqueness).
- All lookups and indexes use **canonical\_key**; all UI displays use **raw**.
- User‑provided aliases may include non‑ASCII: e.g., `要約`, `設計メモ`, `메모-1`.

### **Parent‑anchored range locators**

A range **must** be expressed as a **single parent anchor** followed by a **Section range**:

```
<parent : section_start .. section_end>
```

- The **right‑hand side MUST NOT repeat the parent**. ❌ `root:2025-09-01..root:2025-09-07`
  (invalid) ✅ `root:2025-09-01..2025-09-07` ✅ `root:~mon..+fri` ✅ `book-ppo:1-2..1-5`

- **Numeric Section ranges**: both ends must have the **same depth and lineage** (same prefix), and
  the final segment must be **non‑decreasing**. ✅ `book-ppo:1-2..1-5` ❌ `book-ppo:1-2..1-1`
  (reverse order) ❌ `book-ppo:1-2..2-1` (crossing branches / different lineage)

- **Date Section ranges (under `root:`)**: both ends must resolve to dates; mixing absolute and
  relative forms is allowed. ✅ `root:2025-09-01..2025-09-07` ✅ `root:2025-09-01..+2w` ✅
  `root:~mon..+fri`

> Sugar: when the left side is an absolute date without `root:`, mm treats it as `root:<date>`.
> Example: `2025-09-01..+2w` ⇒ `root:2025-09-01..+2w`.

Invalid forms yield clear errors (e.g., repeated parent, reversed numeric range, lineage mismatch).

---

## Logical Navigation (Unix semantics)

mm maintains a **logical CWD** (current working directory) in the graph.

### Commands

- `cd <locator>` — move CWD to an Item (optionally with Section).
- `pwd` — print the normalized locator.
- `ls [<locator>|<range>]` — list current location or a target location without changing CWD.

### Relative tokens

- `.` — current location
- `..` — logical parent (from `:3-2` to `:3`; from an Item to its parent)
- `-` — previous location

### Git‑like relative steps (Section‑relative, not index‑relative)

- `~N` — N steps **back** in the **last Section segment**
- `+N` — N steps **forward** in the **last Section segment**

Examples:

```
# CWD: root:2025-09-08
cd ~7        # -> root:2025-09-01
cd +3        # -> root:2025-09-11

# CWD: bugi-j1a:1-4
cd ~2        # -> bugi-j1a:1-2
cd +5        # -> bugi-j1a:1-9
```

> If CWD has **no Section** (direct under an Item), `~N`/`+N` is invalid.

### Ranges

Ranges are **inclusive** and must be **parent‑anchored**:

```
mm ls root:~mon..+fri               # date range under root
mm ls root:2025-09-01..2025-09-07   # absolute date span
mm ls book-ppo:1-2..1-5             # numeric Section span under the same parent
```

Invalid examples:

```
mm ls root:2025-09-01..root:2025-09-07   # ❌ repeated parent on the right
mm ls book-ppo:1-2..1-1                  # ❌ reversed order
mm ls book-ppo:1-2..2-1                  # ❌ crossing hierarchy
```

`~N` / `+N` remain **Section‑relative** (last segment only). Relative weekdays (`+mon`, `~fri`) and
periods (`+2w`, `~1m`, `+7d`, `~1y`) are **date‑relative** and valid only under `root:`.

### State

- Session env var `MM_CWD`. A helper subcommand can print `export MM_CWD=...` for shell eval.
- Workspace default stored in `~/.mm/<workspace>/.state.json`.
- When CWD becomes invalid (deleted/renamed), mm falls back to the nearest valid ancestor, then to
  `root:`.

---

## On‑Disk Layout

```
~/.mm/
  <workspace-root>/
    .gitignore           # ignores .state.json, .index/ (and other local caches)
    .state.json          # { "default_cwd": "<normalized locator>" }
    workspace.json       # { "timezone": "Asia/Tokyo" }

    items/
      YYYY/
        MM/
          DD/
            <uuidv7>/
              content.md                  # Markdown (title = first H1)
              meta.json                   # { schema, id, status, created_at, alias?, ... }
              edges/
                <child-uuid>.edge.json    # direct section (rank only)
                0001/                     # numeric Section "1"
                  <child-uuid>.edge.json  # { schema, rank }
                  0002/                   # numeric Section "1-2"
                    <child-uuid>.edge.json
                0002/
                  <child-uuid>.edge.json

          # Root’s date Sections:
          edges/
            2025-04-01/
              <child-uuid>.edge.json      # Item placed under root:2025-04-01 (rank only)
            2025-04-02/
              <child-uuid>.edge.json

    tags/
      <hash>.tag.json                       # hash(canonical_key); { schema, raw, canonical_key, created_at, description? }

    .index/
      aliases/
        <hh>/                               # shard by first 2 hex of hash(canonical_key)
          <hash>.alias.json                 # hash(canonical_key); { schema, raw, canonical_key, created_at }
```

**Notes**

- **Authoritative ordering** lives in the **parent’s** `edges/` (for root date Sections, under
  `items/YYYY/MM/DD/edges/YYYY-MM-DD/` as shown above).
- Child Items may cache their current placement (parent id + Section) in `meta.json` for reverse
  lookup (rank remains authoritative on the parent side).
- The **title** is not in `meta.json`. It is the first non‑empty Markdown H1 in `content.md`. If no
  H1 is found, the Item is treated as **Untitled**. For performance, title lookup streams the file
  until the first non‑blank line.
- Using a **hash of the canonical key** in filenames avoids filesystem normalization issues across
  OSes and prevents collisions with special characters.

---

## Deterministic Ordering (LexoRank)

- Siblings in the same `(parent, section)` are ordered by **LexoRank** (string).
- Insert modes:

  - `head`, `tail`
  - `before:<sibling-id>`, `after:<sibling-id>`
- Rebalancing:

  - `mm doctor --reindex` (when density becomes high).
- Stable display tiebreak: `created_at` ascending.

---

## Create / Move / List Semantics

### Create

- Default creates at **CWD tail**:

  ```
  mm n "some note"
  ```
- Explicit parent & Section:

  ```
  mm n "quote" --parent book-ppo:3
  ```
- Physical path is always `items/<creation-date>/<uuid>/…`.

### Move (placement)

```
mm mv <id> <placement>
```

**Placement forms**

- **Placement bin** — notation `<parent[:section]>` describing a parent Item (or `root`) and the
  Section bucket that placement edges share. Bins are reusable anywhere a placement target is
  needed.
- **Explicit location (parent + Section):**

  - `head:<parent[:section]>`
  - `tail:<parent[:section]>`
  - `<parent[:section]>` (same as `tail:<parent[:section]>`)
- **Relative to a sibling (adopts sibling’s parent + Section):**

  - `after:<id2>`
  - `before:<id2>`

> Physical files do not move.

### List

- `mm ls` lists CWD by **rank asc**, then **created\_at asc**.
- `mm ls <locator | range>` lists a target without changing CWD.
- **Calendar day lists exclude** Items that have been moved away (the day is birthplace, not current
  placement).

### Inspect

- `mm where <id>` prints **Logical** (parent + Section + rank) and **Physical** (filesystem path).

---

## Time & Ranges

- The workspace time zone is fixed (e.g., `"Asia/Tokyo"`).
- **Relative weekdays**: `+mon|tue|…|sun`, `~mon|…|sun` (next/previous weekday). _Valid only under
  `root:`._
- **Relative periods**: `±Nd`, `±Nw`, `±Nm`, `±Ny` (days, weeks, months, years). _Valid only under
  `root:`._
- **Parent‑anchored ranges**:

  - **Dates** (under `root:`): `root:<dateA>..<dateB>` | `root:<dateA>..+<period>` |
    `root:~<weekday>..+<period>` | `root:~<weekday>..+<weekday>` …
  - **Numeric Sections** (under any Item): `<alias|id> : <a-b-…-x> .. <a-b-…-y>`, with **same
    prefix** and **x ≤ y**.

Prohibited:

- Repeating the parent on the right side: `X:S..X:T` (**invalid**).
- Reversed numeric ranges (`…x..y` with `x > y`).
- Crossing hierarchy (`1-2..2-1`, differing prefixes/depths).

---

## Validation & Doctor

Pre‑save / maintenance checks:

- Every `*.edge.json` points to an existing **Item** (no edge→edge).
- No duplicates within the same `(parent, section)`.
- No cycles in the parent/child graph.
- JSON schema version matches; UTF‑8 (NFC), LF newlines.
- Aliases are unique (index enforces uniqueness).

Maintenance:

- `mm doctor --reindex` (rank compaction).
- `mm doctor --fix` (conservative safe fixes).

---

## MCP Server & Interfaces (sketch)

A thin **MCP** surface mirrors CLI semantics 1:1.

**Capabilities (illustrative)**

- `resolve(token) → Locator`
- `cwd.get() → Locator` / `cwd.set(Locator)`
- `items.get(id) → Item`
- `items.list(parent: Locator) → [Child]`
- `items.create(title, parent?: Locator, insertion?: {mode, refId?}) → {item, placement}`
- `items.move(id, placement: { head|tail:<locator> | after|before:<id2> })`
- `items.close(id)` / `items.reopen(id)`
- `inspect.where(id) → { logical: Placement, physical: FsPath }`

> Wire formats and authentication are out of scope here.

---

## Concurrency, Git, and Conflict Strategy

- Writes are **atomic** (temp file + rename).
- The system is **append‑oriented** on edges; merges are typically line‑local.
- Rank collisions surface as small JSON diffs and are resolved by reindexing.
- Competing moves on the same Item -> last‑writer wins at edge level (content is unaffected).

---

## Security & Integrity

- Everything is plain text; no hidden binaries in core storage.
- Optional hardening (e.g., signed commits) can be layered externally.
- Sensitive data policy remains the workspace owner’s responsibility.
- Indexing with **hashed canonical keys** avoids platform‑dependent Unicode normalization pitfalls
  in filenames and reduces spoofing via look‑alike characters (further hardening possible by adding
  UTS#39 confusable checks later).

---

## Appendix A — CLI Surface

### Navigation

```bash
mm pwd
mm cd <locator>        # e.g., root:2025-09-22, book-ppo:3, 2025-09-22/book-ppo:3
mm cd ..               # logical parent
mm cd -                # previous location
mm cd ~7               # back 7 in the last Section segment
mm cd +3               # forward 3 in the last Section segment
mm ls                  # list CWD
mm ls <locator|range>  # list without changing CWD; e.g., ls ~7..+7
```

### Create / Edit / State

```bash
mm n|note|task|event "title" [--parent <parent[:section]>] [--context <tag>...]
mm edit|e <id>
mm close|cl <ids...>
mm reopen|op <ids...>
```

### Move / Remove

```bash
mm mv <id> head:<parent[:section]>
mm mv <id> [tail:]<parent[:section]>
mm mv <id> after:<id2>
mm mv <id> before:<id2>
mm remove|rm <ids...>
```

### Inspect

```bash
mm where <id>          # prints Logical (parent, section, rank) & Physical FS path
```

---

## Appendix B — Token Grammar (EBNF)

```ebnf
locator           = parent , ":" , section
                  | date-section                       (* sugar for root:<date-section> *)
                  | section ;                          (* sugar for <cwd>:<section> *)

range             = parent , ":" , section , ".." , section
                  | date-section , ".." , date-section (* sugar for root:<date-section>..<date-section> *)
                  | section, "..", section ;           (* sugar for <cwd>:<section>..<section> *)

parent            = "root"
                  | id-token
                  | alias-token ;

section           = numeric-section
                  | date-section
                  | relstep ;

numeric-section   = num , { "-" , num } ;           (* e.g., 1-2-3 *)

absdate           = yyyy , "-" , mm , "-" , dd ;    (* valid only with parent = root *)

relstep           = "~" , integer
                  | "+" , integer ;                 (* section-relative *)

relperiod         = "~" , integer , period-unit
                  | "+" , integer , period-unit ;   (* date-relative, root only *)

relweekday        = "~" , weekday
                  | "+" , weekday ;                 (* date-relative, root only *)

date-section      = absdate
                  | "today" | "td" | "tomorrow" | "tm" | "yesterday" | "yd"
                  | relweekday | relperiod ;        (* root only *)

id-token          = uuidv7 ;
alias-token       = unicode-slug ;  (* Unicode letters/numbers/marks plus '_' '-' '.'; no spaces *)

weekday           = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" ;
period-unit       = "d" | "w" | "m" | "y" ;

num               = digit , { digit } ;
yyyy              = digit , digit , digit , digit ;
mm                = digit , digit ;
dd                = digit , digit ;
```

## Semantic constraints (not expressible in EBNF)

1. **Numeric ranges**

   - In `range` with numeric Sections, both ends must share the **same prefix** and **same depth**.
   - The final numeric segment must be **non-decreasing** (`x ≤ y`).
   - Example: `book-ppo:1-2..1-5` is valid.
   - Example: `book-ppo:1-2..1-1` (reverse) and `book-ppo:1-2..2-1` (cross-hierarchy) are invalid.

2. **Date ranges**

   - In `range` with date Sections (parent = `root`), both ends must resolve to valid dates.
   - Absolute (`YYYY-MM-DD`) and relative (`+2w`, `~mon`) forms may be mixed.
   - Example: `root:2025-09-01..+2w` is valid.

3. **No repeated parent**

   - In `range`, the right side must **not repeat the parent**.
   - Example: `X:S..X:T` is invalid.
   - Example: `root:2025-09-01..root:2025-09-07` is invalid; use `root:2025-09-01..2025-09-07`
     without repeating `root:` on the right.

4. **Date sections are root-only**

   - `date-section` (absolute, relative day, relative period, relative weekday) is valid **only when
     parent = root**.
   - Example: `root:today` is valid, `book-ppo:today` is invalid.

5. **Relative steps under CWD**

   - If a `locator` or `range` begins with a bare `section` (no parent), the current working
     directory (CWD) provides the parent.
   - If the token matches `date-section`, normalize to `root:<date-section>`.
   - Otherwise treat it as `<cwd>:<section>`.
   - If CWD is not defined or is not a Section context, relative steps like `~N` / `+N` are invalid.

6. **Alias disambiguation**

   - Aliases must not lexically collide with reserved forms: absolute dates (`YYYY-MM-DD`), numeric
     sections (`1-2-3`), or relative tokens (`~N`, `+N`, `~mon`, `+2w`, etc.).

7. **Alias/Tag canonicalization**

- `canonical_key := NFKC(raw) → casefold(raw)`; all uniqueness/searching uses `canonical_key`.
- **Reserved shapes** (as listed above) must be rejected for aliases/tags.
- **Filenames** for `.index/aliases/*` and `tags/*` MUST use `hash(canonical_key)` (not the raw
  string).
- **Display vs. key**: mm always displays `raw`, never `canonical_key`.

## Appendix C — Alias Autogeneration

When an Item is created without an explicit alias, mm generates a **pronounceable slug** of the
form:

```
auto_alias := C V C V "-" base36^3
C := one consonant in [b c d f g h j k l m n p q r s t v w x y z]
V := one vowel in [a e i o u]
base36 := [0-9a-z]
```

**Examples:** `bugi-j1a`, `pako-9rw`

- Auto aliases are lowercase ASCII.
- Auto aliases are **fallbacks** only. A user may set a Unicode alias later; **uniqueness is
  evaluated against `canonical_key`**.
- Uniqueness is enforced via an alias index (`.index/aliases/…`).
- Once assigned, an alias is persisted with the Item (renaming is allowed by explicit user action
  only).

---

**End of document.**
