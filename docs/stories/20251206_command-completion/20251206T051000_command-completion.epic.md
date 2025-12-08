# Command Completion & Caching – DESIGN

**Role**: This document defines the design for the Command Completion Epic.

Status: Draft
Target version: mm v0.2.0

---

## 0. Scope & Non-Scope

### In Scope (initial release)

*   **`completions` command**: A new CLI command that outputs completion scripts for Bash and Zsh.
*   **Shell Completion Scripts**: Logic to auto-complete commands, subcommands, flags, and arguments.
*   **Recent Item Caching**: A mechanism to store IDs, aliases, and tags of recently accessed/modified items.
    *   **Triggers**: A centralized hook mechanism to ensure *any* command execution that references or displays items updates the cache.
    *   **Cache Sources**:
        *   Command arguments (IDs, aliases, tags explicitly used)
        *   Command results (items created, displayed, or modified)
*   **Workspace-based Caching**: Cache files stored within the declared workspace (`.index/completion_cache.jsonl`).
*   **Typed Cache Format**: JSON Lines format to distinguish between IDs, Aliases, and Tags, allowing for better validation and filtering.
*   **Atomic Updates**: Concurrency-safe cache writing (atomic rename).
*   **Cache-Only Completion**: Shell completion relies exclusively on cache; no fallback mechanism.

### Out of Scope (future work)

*   Fish or PowerShell support.
*   Context-aware filtering (e.g., filtering `close` candidates to only 'open' items) beyond basic ID availability.
*   "Short ID" logic (current domain uses strictly UUIDv7 and Aliases).
*   Fallback mechanisms (e.g., querying all items from `.index/` when cache is empty).
*   Full item enumeration commands for completion (completion relies solely on cache).

---

## 1. Motivation & Goals

Users frequently need to reference items (by ID, alias, or tag) across multiple commands. Typing full UUIDs or remembering exact aliases is cumbersome. Shell completion should suggest recently used items to accelerate workflows.

Design goals:

1.  **Recall**: Allow completion of recently accessed items (IDs/Aliases/Tags), including closed items.
2.  **Performance**: Sub-shell-latency (<50ms) lookups via a pre-computed local cache.
3.  **Reliability**: Atomic writes and correct workspace resolution.
4.  **Simplicity**: Cache-only approach; natural usage (`mm ls`, `mm note`, etc.) builds the cache over time.
5.  **Scalability**: Avoid full item enumeration; cache grows organically based on actual usage.

---

## 2. Terminology

*   **Completion Cache**: A JSONL file storing entries for completion candidates.
*   **Entry Type**: `id` (UUID), `alias` (User Alias), `tag` (Context/Tag).
*   **Canonical Key**: The stable identifier (UUID for items, generated key for aliases/tags).

---

## 3. Architecture & Design

### 3.1 Caching Mechanism (The "Writer")

We will implement a **Cache Middleware** (or Command Interceptor) in the Presentation layer.

*   **File Location**: 
    *   `<workspace_root>/.index/completion_cache.jsonl`
    *   If no workspace is active, no cache is written.
*   **Format**: JSON Lines (JSONL).
    *   **Schema**:
        *   `type`: "id" | "alias" | "tag" (Required)
        *   `value`: string (The text to suggest, e.g. alias name or UUID) (Required)
        *   `canonical_key`: string (Stable identifier, e.g. UUID for items, canonical tag key) (Required)
        *   `target`: string (Optional, for aliases: the UUID they point to)
        *   `last_seen`: string (UTC ISO 8601 timestamp) (Required)
    
    *   *Note*: `canonical_key` and `target` are primarily used by the **Compaction Service** to handle deduplication and alias updates. The shell reader primarily consumes `value`.

    ```json
    {"type":"id","value":"0193bb...","canonical_key":"0193bb...","last_seen":"2025-12-06T12:00:00Z"}
    {"type":"alias","value":"todo","canonical_key":"todo","target":"0193bb...","last_seen":"2025-12-06T12:00:00Z"}
    {"type":"tag","value":"work","canonical_key":"work","last_seen":"2025-12-06T12:00:00Z"}
    ```

*   **Update Trigger**: 
    *   The `Command` classes or their runner will be wrapped. 
    *   After successful execution, any `ItemId`, `AliasSlug`, or `TagSlug` present in the Input/Output arguments or Result will be extracted and upserted into the cache.
*   **Concurrency**: 
    *   Read existing cache (if small) or append-only log.
    *   Periodically (e.g., every 10 writes or >50KB), compact the cache:
        1.  Read all lines.
        2.  Deduplicate by `(type, canonical_key)`, keeping most recent `last_seen`. (Updates aliases to new targets if changed).
        3.  Sort by recency (newest first).
        4.  Truncate to `MAX_ENTRIES` (e.g., 1000).
        5.  Write to `.tmp`, then atomic `rename` to target.

### 3.2 Shell Scripts (The "Reader")

The generated Zsh/Bash scripts will employ a **cache-only** strategy:

1.  **Cache Lookup**:
    *   Locate `.index/completion_cache.jsonl` by traversing upward from CWD.
    *   Use **robust regex** (`grep`/`sed`) to extract `value` fields where `type` matches.
    *   *Goal*: Low latency (< 20ms) for common case (inside workspace).
2.  **No Cache Behavior**:
    *   If cache file is missing or empty, no completion candidates are provided.
    *   Users must run commands (`mm ls`, `mm note`, etc.) to populate the cache.
    *   This keeps the implementation simple and avoids scalability risks of full enumeration.

---

## 4. User-Facing Changes

### 4.1 New Command

```bash
mm completions [bash|zsh]
```

Outputs shell completion script to stdout for installation.

### 4.2 Behavior Changes

*   **Stateful Completion**: Completion candidates evolve based on usage. Natural command usage (`mm ls`, `mm note`, etc.) populates the cache.
*   **Cache-Only**: If cache is empty (e.g., fresh install), no completion candidates are provided until commands are run.
*   **No Short IDs**: Completion suggests full UUIDs or Aliases. Users typically type Aliases or copy-paste UUIDs; completion helps with Aliases and previously seen UUIDs.

---

## 5. Implementation Notes

### 5.1 Command Interceptors

Implement a `CommandRunner` or `Middleware` that wraps the `cliffy` ActionHandler.
It inspects `options` and arguments for known patterns (UUID regex, Alias format) or consumes a Structured Result object if available.

### 5.2 Cache Population Strategy

Commands update the cache by extracting:
*   **From arguments**: ItemId, AliasSlug, TagSlug patterns in command-line arguments.
*   **From results**: Items created, displayed, or modified by the command (e.g., `mm note` creates an item; `mm ls` displays items).

This ensures natural usage builds the cache organically.

### 5.3 Alternatives Considered

*   **Reuse `.index` directly**: Rejected due to latency (>50ms parsing thousands of files) and lack of recency history.
*   **Short IDs**: Rejected as the domain uses strictly UUIDv7. "Shortening" is a display-only concern, not unique addressing in the domain currently.
*   **Simple Text Cache**: Rejected in favor of JSONL to allow distinguishing `alias` vs `tag` and managing staleness/renames better.
*   **Fallback to full enumeration (`--emit-source`)**: Rejected due to scalability concerns (aliases are auto-assigned to all items, making enumeration expensive). Cache-only approach is simpler and safer; natural usage builds the cache.

---

## 6. Error Handling

*   **Cache Corruption**: If the JSONL cache contains invalid lines (partial writes), the reader (shell script) must skip them. The writer will use atomic `rename` to prevent torn reads.
*   **Workspace Resolution Failure**: If `mm workspace info` fails (not in a workspace), completion halts silently or falls back to basic file completion.
*   **Permissions**: Silently ignore cache write failures (e.g., read-only filesystem).

---

## 7. Testing Strategy

### 7.1 Unit Tests

*   **Concurrency**: Simulate multiple writers appending/compacting. Verify no data loss using the atomic write pattern.
*   **Format Compliance**: Ensure valid JSONL output with `type`, `value`, `canonical_key`, and `last_seen`.
*   **Compaction**: Trigger compaction (e.g. limit 10 items), insert 15 items, verify only 10 most recent remain.
*   **Alias Renaming**:
    1.  Cache: `alias: old -> uuid1`
    2.  Rename `old` to `new`.
    3.  Cache Update: `alias: new -> uuid1` (new entry), `alias: old` (entry remains until eviction or handled by smart compaction). *Note*: ideally, compaction should detect `old` is no longer valid if we had a precise invalidation mechanism, but simple LRU is acceptable for v1.

---

## 8. Shell Snippet (Conceptual)

*Note*: Shell extraction ignores `canonical_key`/`target` (handled by compaction).

```zsh
_mm_find_cache_file() {
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/.index/completion_cache.jsonl" ]]; then
            echo "$dir/.index/completion_cache.jsonl"
            return 0
        fi
        if [[ -f "$dir/workspace.json" || -d "$dir/.mm" ]]; then
             # Workspace found but no cache yet
             return 1
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

_mm_get_candidates() {
    local type="$1" # 'id', 'alias', or 'tag'
    local cache_file="$(_mm_find_cache_file)"

    if [[ -n "$cache_file" ]]; then
        # Robust Regex extraction from JSONL
        # Matches: "type":"<type>"..."value":"<value>"
        grep "\"type\":\"$type\"" "$cache_file" | \
        sed -E 's/.*"value":"([^"]+)".*/\1/'
    fi
    # No fallback: if cache is missing/empty, no candidates are provided
}
```
## 9. Manual Verification

1.  **Fresh Install (No Cache)**:
    *   Run `mm completions zsh > ~/.zshrc_mm`.
    *   Start new shell.
    *   Verify `mm edit <TAB>` provides no completion candidates (cache is empty).
2.  **Cache Population**:
    *   Run `mm note "Hello"` to create an item.
    *   Check `.index/completion_cache.jsonl` exists and contains the new note's ID, alias, and any tags.
3.  **Completion After Cache Population**:
    *   Type `mm edit <TAB>` -> The newly created item's ID and alias should be suggested.
4.  **Cache Growth Through Usage**:
    *   Run `mm ls` to display items.
    *   Check cache file now includes IDs/aliases/tags of displayed items.
    *   Verify `mm edit <TAB>` suggests these items.

---

## 10. Technical Constraints & Details

*   **Shell JSON Parsing**: To avoid dependencies like `jq`, shell scripts will use `awk` or `sed` to filter the JSONL.
    *   *Example*: `awk -F'"' '/"type":"tag"/ {print $8}' .index/completion_cache.jsonl` (assuming consistent field ordering/formatting by the writer).
*   **Compaction Cadence**: Run compaction on every 10th write or when file size > 50KB.
*   **Time Format**: usage `last_seen` must be UTC ISO 8601 string.
*   **Locking**: Use advisory file locking (or simple retry on rename) for compaction to avoid writer conflicts.
