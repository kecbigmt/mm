# Command Completion & Caching – DESIGN

**Role**: This document defines the design for the Command Completion Epic.

Status: Draft
Target version: mm v0.2.0

---

## 0. Scope & Non-Scope

### In Scope (initial release)

*   **`completions` command**: A new CLI command that outputs completion scripts for Bash and Zsh.
*   **Shell Completion Scripts**: Logic to auto-complete commands, subcommands, flags, and arguments.
*   **Recent Item Caching**: A mechanism to store IDs and aliases of recently accessed/modified items.
    *   **Triggers**: A centralized hook mechanism to ensure *any* command execution that references an item updates the cache.
*   **Workspace-based Caching**: Cache files stored within the declared workspace (`.index/completion_cache.jsonl`).
*   **Typed Cache Format**: JSON Lines format to distinguish between IDs, Aliases, and Tags, allowing for better validation and filtering.
*   **Atomic Updates**: Concurrency-safe cache writing (atomic rename).
*   **Pluggable List Source**: A new flag or hidden command (e.g., `mm completions --emit-source`) to provide machine-readable candidates for fallback.

### Out of Scope (future work)

*   Fish or PowerShell support.
*   Context-aware filtering (e.g., filtering `close` candidates to only 'open' items) beyond basic ID availability.
*   "Short ID" logic (current domain uses strictly UUIDv7 and Aliases).

---

## 1. Motivation & Goals

The previous prototype relied on `mm list` output parsing for completion, which was fragile and limited to "open" items. Users need to interact with items they just closed or historically accessed.

Design goals:

1.  **Recall**: Allow completion of items (UUIDs/Aliases) not currently valid in the default view (e.g., closed items).
2.  **Performance**: Sub-shell-latency (<50ms) lookups via a pre-computed local cache.
3.  **Reliability**: Atomic writes and correct workspace resolution.
4.  **Correctness**: Use machine-readable sources rather than screen scraping.

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

The generated Zsh/Bash scripts will employ a **Fast Path / Slow Path** strategy:

1.  **Fast Path (Optimization)**:
    *   Attempt to locate `.index/completion_cache.jsonl` in `.mm` or parent directories (optimistic CWD check).
    *   If found, use a **robust regex** (`grep`) to extract `value` fields where `type` matches.
    *   *Goal*: Low latency (< 20ms) for common case (inside workspace).
2.  **Slow Path (Primary/Fallback)**:
    *   If file missing, empty, or CWD check fails, call `mm completions --emit-source --filter <type>`.
    *   This leverages the CLI's internal workspace resolution (finding `MM_HOME` etc.) to guarantee correctness if run from outside the workspace structure.
    *   Preferred for correctness; if the helper remains fast enough, consider skipping cache parsing entirely and always using it.

### 3.3 Internal Helper: `mm completions --emit-source`

An internal (hidden) flag for the `completions` command, used by the shell script as a reliable fallback.

*   **Usage**: `mm completions --emit-source [--filter <id|alias|tag>]`
*   **Behavior**:
    1.  Resolves workspace via standard CLI mechanisms (`MM_HOME`, state, etc.).
    2.  Fetches **ALL** available candidates (Open + Closed items from DB, all Tags).
    3.  Outputs **Plain Text** (one value per line) to standard output.
        *   This avoids JSON parsing in the shell for the fallback path.
*   **Goal**: Correctness & Reliability. Used when cache is unavailable or invalid.

---

## 4. User-Facing Changes

### 4.1 New Command

```bash
mm completions [shell]
```

### 4.2 Behavior Changes

*   **Stateful Completion**: Completion candidates evolve based on usage.
*   **No Short IDs**: Completion will suggest full UUIDs or Aliases. Users typically type Aliases or copy-paste UUIDs; completion helps with Aliases and previously seen UUIDs.

---

## 5. Implementation Notes

### 5.1 Command Interceptors

Implement a `CommandRunner` or `Middleware` that wraps the `cliffy` ActionHandler.
It inspects `options` and arguments for known patterns (UUID regex, Alias format) or consumes a Structured Result object if available.

### 5.2 Helper Commands

*   `mm workspace info --path`: Fast command to print workspace root (for shell script).
*   `mm items --json --ids-only`: Fast dump of valid IDs/Aliases.

### 5.3 Alternatives Considered

*   **Reuse `.index` directly**: Rejected due to latency (>50ms parsing thousands of files) and lack of recency history.
*   **Short IDs**: Rejected as the domain uses strictly UUIDv7. "Shortening" is a display-only concern, not unique addressing in the domain currently.
*   **Simple Text Cache**: Rejected in favor of JSONL to allow distinguishing `alias` vs `tag` and managing staleness/renames better.

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

*Note*: Shell extraction ignores `canonical_key`/`target` (handled by compaction). For maximum robustness, you may always use `mm completions --emit-source` instead of parsing the cache.

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
    local type="$1" # 'id' or 'tag'
    local cache_file="$(_mm_find_cache_file)"
    
    if [[ -n "$cache_file" ]]; then
        # Fast path: Robust Regex extraction from JSONL
        # Matches: "type":"<type>"..."value":"<value>"
        grep "\"type\":\"$type\"" "$cache_file" | \
        sed -E 's/.*"value":"([^"]+)".*/\1/'
    else
        # Slow path / Fallback: CLI Helper (Plain Text output)
        mm completions --emit-source --filter "$type"
    fi
}
```
## 9. Manual Verification

1.  **Fresh Install**:
    *   Run `mm completions zsh > ~/.zshrc_mm`.
    *   Start new shell.
    *   Verify `mm edit <TAB>` falls back to `mm completions --emit-source` and shows *Open + Closed* items (or all available candidates).
2.  **Cache Population**:
    *   Run `mm note "Hello"`.
    *   Run `mm list`.
    *   Check `.index/completion_cache.jsonl` exists and contains the new note UUID.
3.  **Completion usage**:
    *   Type `mm edit <TAB>` -> UUID should be suggested.
4.  **Fallback**:
    *   Delete `.index/completion_cache.jsonl`.
    *   Type `mm edit <TAB>` -> Should run `mm completions --emit-source` (verified by latency or process list) and suggest open/closed items.

---

## 10. Technical Constraints & Details

*   **Shell JSON Parsing**: To avoid dependencies like `jq`, shell scripts will use `awk` or `sed` to filter the JSONL.
    *   *Example*: `awk -F'"' '/"type":"tag"/ {print $8}' .index/completion_cache.jsonl` (assuming consistent field ordering/formatting by the writer).
*   **Compaction Cadence**: Run compaction on every 10th write or when file size > 50KB.
*   **Time Format**: usage `last_seen` must be UTC ISO 8601 string.
*   **Locking**: Use advisory file locking (or simple retry on rename) for compaction to avoid writer conflicts.
