# **mm doctor: Validation & Maintenance Commands**

**Version:** 1.0
**Audience:** engineers, contributors
**Scope:** `mm doctor` subcommand design and validation/maintenance procedures

---

## 1) Overview

The `mm doctor` command provides validation and maintenance operations for mm workspaces. It ensures data integrity, synchronizes indexes, and optimizes performance through three specialized subcommands:

* **`mm doctor check`** — Inspection only; reports issues without modifications
* **`mm doctor rebuild-index`** — Complete reconstruction of `.index/` from Frontmatter
* **`mm doctor rebalance-rank`** — Rebalance LexoRank values to restore insertion headroom

---

## 2) Design Principles

* **Frontmatter is authoritative**: Item `.md` files (Frontmatter + body) are the single source of truth
* **Indexes are rebuildable**: `.index/graph` and `.index/aliases` are purely derived caches
* **Separation of concerns**:
  * `check` inspects without modifying
  * `rebuild-index` synchronizes index from Frontmatter
  * `rebalance-rank` optimizes rank distribution
* **Clear reporting**: All commands provide structured, actionable output
* **Safe by default**: Destructive operations require explicit subcommands

---

## 3) Subcommands

### 3.1 `mm doctor check`

#### Purpose

Inspection only — validates data model integrity and reports issues without making any modifications.

#### What it validates

**Frontmatter validation:**

* **Required fields present**: `id`, `kind`, `status`, `placement`, `rank`, `created_at`, `updated_at`, `schema`
* **`id` validity**:
  * Matches filename `<uuid>.md`
  * Is valid UUID v7 format
* **`kind` validity**: One of allowed values (`note`, `task`, `event`)
* **`status` validity**: One of allowed values (`open`, `closed`)
* **`placement` normalization**:
  * No relative tokens like `today`, `tomorrow`, `yesterday`
  * No aliases (only UUIDs and absolute dates `YYYY-MM-DD`)
  * Format: `YYYY-MM-DD` or `YYYY-MM-DD/1/3` or `<uuid>/1/3`
* **`rank` validity**: Valid LexoRank format
* **Timestamp validity**: `created_at`, `updated_at` are valid ISO-8601 timestamps
* **`schema` presence**: e.g., `mm.item.frontmatter/2`
* **`alias` validity** (if present):
  * Follows alias rules (Unicode slug: letters/numbers/marks, `_`, `-`, `.`)
  * Not reserved tokens (`.`, `..`, pure digits, dates, relative date tokens)
  * No `..` substring
  * Unique `canonical_key` (NFKC + casefold)
* **YAML validity**: Valid YAML, UTF-8 (NFC), LF newlines

**Graph validation:**

* **Edge target validity**: Every `*.edge.json` points to an existing Item file
* **No duplicate edges**: No duplicates within the same (parent, section)
* **No cycles**: No cycles in the parent/child graph
* **Edge-Frontmatter consistency**: Edge files match Frontmatter `placement` and `rank`
* **Alias uniqueness**: No `canonical_key` collisions across all Items
* **Date validity**: Date heads are valid dates
* **Range validity**: Ranges are semantically valid (order, depth/prefix matching)

**Index consistency:**

* **Edge placement sync**: `.index/graph/dates/` and `.index/graph/parents/` match Item `placement`
* **Alias index sync**: `.index/aliases/` matches Item alias frontmatter
* **No orphaned edges**: No edge files without corresponding Items
* **No missing edges**: No Items with placement but missing edge file

#### Output format

Structured report listing all detected issues by category:

```
mm doctor check

Checking workspace integrity...

✓ Scanned 1,247 items
✓ Scanned 856 edges
✓ Scanned 423 aliases

Issues found:

[Frontmatter Errors]
  • items/2025/01/09/019a85fc-67c4-7a54-be8e-305bae009f9e.md
    - placement contains alias 'book' (must be UUID or date)
    - rank '' is invalid (must be valid LexoRank)

  • items/2025/01/10/019a8603-1234-7890-abcd-1234567890ab.md
    - missing required field: schema

[Graph Errors]
  • Cycle detected: 019a85fc-67c4-7a54-be8e-305bae009f9e
    → 019a8603-1234-7890-abcd-1234567890ab
    → 019a85fc-67c4-7a54-be8e-305bae009f9e

[Index Inconsistencies]
  • Missing edge file for item 019a8610-5678-7890-abcd-0987654321ab
    (placement: 2025-01-09/1/3)

  • Orphaned edge: .index/graph/dates/2025-01-08/019a8620-dead-beef-cafe-badc0ffee000.edge.json
    (no corresponding item file)

[Alias Conflicts]
  • Duplicate canonical_key 'book':
    - 019a85fc-67c4-7a54-be8e-305bae009f9e (alias: 'Book')
    - 019a8603-1234-7890-abcd-1234567890ab (alias: 'book')

Summary: 7 issues found across 5 items
```

#### Exit codes

* `0` — No issues found
* `1` — Issues detected (see report)
* `2` — Command error (e.g., workspace not found)

---

### 3.2 `mm doctor rebuild-index`

#### Purpose

Complete reconstruction of `.index/graph` and `.index/aliases` from Item Frontmatter — the canonical sync operation.

#### When to use

* **After cloning workspace** on a new machine (`.index/` is Git-ignored)
* **Index corrupted or out-of-sync** with Frontmatter
* **After version updates** that change index format
* **After Git merge conflicts** in Item files (Frontmatter is merged, index needs rebuild)
* **After manual Frontmatter edits** outside mm CLI

#### Process

1. **Scan all Items**:
   * Find all `items/**/*.md` files
   * Parse Frontmatter from each file

2. **Build new graph index in temporary location**:
   * Create temporary directory (e.g., `.index/.tmp-graph/`)
   * For each Item, parse `placement` field:
     * Extract parent (date `YYYY-MM-DD` or UUID)
     * Extract section path (e.g., `/1/3`)
   * Group Items by (parent, section)
   * Sort by `rank` (with `created_at` tiebreak)
   * Write edge files to temporary location:
     * Date placements → `.index/.tmp-graph/dates/<YYYY-MM-DD>/<child-uuid>.edge.json`
     * Parent placements → `.index/.tmp-graph/parents/<parent-uuid>/<section-path>/<child-uuid>.edge.json`
   * Edge file format: `{ schema: "mm.edge/1", to: "<uuid>", rank: "<lexorank>" }`

3. **Build new alias index in temporary location**:
   * Create temporary directory (e.g., `.index/.tmp-aliases/`)
   * For each Item with `alias` field:
     * Compute `canonical_key` (NFKC + casefold)
     * Compute hash: `hash(canonical_key)`
     * Write alias file to temporary location: `.index/.tmp-aliases/<hh>/<hash>.alias.json`
   * Alias file format: `{ schema: "mm.alias/1", raw: "Book", canonical_key: "book", created_at: "..." }`

4. **Verify integrity**:
   * Run basic validation to ensure rebuild succeeded
   * Report any Items that couldn't be indexed (malformed placement, etc.)
   * If validation fails, abort and keep existing index intact

5. **Replace existing index**:
   * Delete `.index/graph/`
   * Delete `.index/aliases/`
   * Rename `.index/.tmp-graph/` to `.index/graph/`
   * Rename `.index/.tmp-aliases/` to `.index/aliases/`

#### Output format

```
mm doctor rebuild-index

Rebuilding workspace index...

✓ Removed existing index
✓ Scanned 1,247 items
✓ Built graph index (856 edges)
  - Date sections: 412 edges
  - Parent sections: 444 edges
✓ Built alias index (423 aliases)

Index rebuild complete.
```

#### Important notes

* **Safe operation**: Builds new index in temporary location; existing index is preserved until rebuild succeeds
* **Frontmatter is authoritative**: Any discrepancies between Frontmatter and old index are resolved in favor of Frontmatter
* **Not committed to Git**: `.index/` is Git-ignored; changes are local only
* **Idempotent**: Running multiple times produces same result

---

### 3.3 `mm doctor rebalance-rank`

#### Purpose

Rebalance LexoRank values for siblings within each (parent, section) group to restore insertion headroom and optimize rank performance.

#### When to use

* **Rank density is high**: Many insertions between same siblings have consumed available rank space
* **Rank strings are long**: Excessive precision from repeated insertions
* **Periodic maintenance**: Optimize rank performance as part of regular workspace cleanup
* **Not a correctness fix**: This is a UX/performance optimization, not a data integrity repair

#### Process

1. **Identify all (parent, section) groups**:
   * Scan `.index/graph/dates/` for date-parented groups
   * Scan `.index/graph/parents/` for Item-parented groups

2. **For each group**:
   * Collect all sibling Items (children of same parent + section)
   * Sort by current `rank` (with `created_at` tiebreak for stability)
   * Generate evenly-spaced new rank values:
     * Use full LexoRank space (e.g., `a0`, `a1`, ..., `z9`)
     * Distribute ranks evenly: if N siblings, use ranks at positions `1/(N+1), 2/(N+1), ..., N/(N+1)` of available space
   * Update each Item:
     * Modify Frontmatter `rank` field
     * Update `updated_at` timestamp
     * Write Item file atomically (temp file + rename)
   * Update edge files:
     * Update `rank` field in corresponding `.edge.json` files

3. **Verify ordering preserved**:
   * Ensure sort order is identical before/after rebalance
   * Report any discrepancies

#### Output format

```
mm doctor rebalance-rank

Rebalancing ranks...

✓ Found 156 (parent, section) groups
✓ Rebalanced 1,247 items across all groups
  - 2025-01-09: 23 items
  - 2025-01-10: 18 items
  - 019a85fc-67c4-7a54-be8e-305bae009f9e: 12 items
  - 019a8603-1234-7890-abcd-1234567890ab/1: 8 items
  - ...

Rank rebalance complete.

⚠ Changes made to Item files (frontmatter only).
  Run 'git status' to review changes before committing.
```

#### Important notes

* **Modifies Item files**: Updates Frontmatter `rank` and `updated_at` fields
* **Should be committed**: Changes are in Git-tracked files and should be committed
* **Preserves ordering**: Sibling order remains identical (sort by old rank = sort by new rank)
* **Safe operation**: No semantic changes; purely a performance optimization
* **Not required for correctness**: System works fine with unbalanced ranks; this is for efficiency

---

## 4) Implementation Notes

### 4.1 Validation Strategy

* **Fast-fail vs. collect-all**: `check` should collect ALL issues before reporting (don't stop at first error)
* **Parallel validation**: Where safe, validate multiple Items/edges in parallel
* **Memory efficient**: Stream large workspaces; don't load all Items into memory at once

### 4.2 Index Rebuild Strategy

* **Atomic directory replacement**: Build new index in temp dir, then atomic rename
* **Progress reporting**: Show progress for large workspaces (e.g., every 100 Items)
* **Error handling**: If any Item has malformed Frontmatter, log error and continue (index as many as possible)

### 4.3 Rank Rebalance Strategy

* **Batch updates**: Update multiple Items in parallel where safe
* **Transactional semantics**: If any update fails, rollback is complex; prefer fail-fast with clear errors
* **Rank generation**: Use LexoRank library to generate evenly-spaced ranks

### 4.4 Error Reporting

* **Structured output**: Machine-parseable (JSON mode?) for tooling integration
* **Actionable messages**: Tell user how to fix each issue type
* **Categorization**: Group related issues together (all frontmatter errors, all graph errors, etc.)

---

## 5) CLI Interface

### 5.1 Command Syntax

```bash
# Check workspace integrity
mm doctor check

# Rebuild index from frontmatter
mm doctor rebuild-index

# Rebalance LexoRank values
mm doctor rebalance-rank
```

### 5.2 Options (future)

Potential future options (not required for initial implementation):

```bash
# Check with JSON output
mm doctor check --format=json

# Rebuild index with progress bar
mm doctor rebuild-index --verbose

# Rebalance only specific parent
mm doctor rebalance-rank --parent=<uuid>

# Rebalance only specific date range
mm doctor rebalance-rank --date-range=2025-01-01..2025-01-31
```

---

## 6) Testing Strategy

### 6.1 Unit Tests

* **Validation logic**: Test individual validation rules (placement format, rank validity, etc.)
* **Rank generation**: Test even distribution, ordering preservation
* **Index building**: Test edge file creation from Frontmatter

### 6.2 Integration Tests

* **End-to-end check**: Create workspace with known issues, verify `check` detects them
* **End-to-end rebuild**: Create workspace, delete index, verify `rebuild-index` recreates it correctly
* **End-to-end rebalance**: Create workspace with unbalanced ranks, verify `rebalance-rank` redistributes evenly

### 6.3 Test Fixtures

* **Valid workspace**: No issues (check should pass)
* **Invalid frontmatter**: Missing fields, malformed placement, invalid rank
* **Graph inconsistencies**: Cycles, duplicate edges, orphaned edges
* **Index desync**: Frontmatter and index out of sync
* **Rank density**: High-density ranks requiring rebalance

---

**End of document.**
