# Command Completion & Caching – DESIGN

**Role**: This document defines the design for the Command Completion Epic.

Status: Draft
Target version: mm v0.2.0

---

## 0. Scope & Non-Scope

### In Scope (initial release)

*   **`completions` command**: A new CLI command that outputs completion scripts for Bash and Zsh.
*   **Shell Completion Scripts**: Logic to auto-complete commands, subcommands, flags, and arguments.
*   **Recent Item Caching**: A mechanism to store aliases and context tags of recently accessed/modified items.
    *   **Triggers**: Commands update cache after successful execution.
    *   **Cache Sources**:
        *   Command results only (items created, displayed, or modified)
        *   Note: Arguments are NOT cached separately to avoid caching failed commands
*   **Workspace-based Caching**: Cache files stored within the declared workspace (`.index/completion_aliases.txt` and `.index/completion_context_tags.txt`).
*   **Simple Text Format**: Plain text files, one value per line. File order represents recency (newest at end).
*   **Cache-Only Completion**: Shell completion relies exclusively on cache; no fallback mechanism.

### Out of Scope (future work)

*   Fish or PowerShell support.
*   Context-aware filtering (e.g., filtering `close` candidates to only 'open' items) beyond basic ID availability.
*   "Short ID" logic (current domain uses strictly UUIDv7 and Aliases).
*   Fallback mechanisms (e.g., querying all items from `.index/` when cache is empty).
*   Full item enumeration commands for completion (completion relies solely on cache).

---

## 1. Motivation & Goals

Users frequently need to reference items (by alias or context tag) across multiple commands. Typing or remembering exact aliases and tags is cumbersome. Shell completion should suggest recently used items to accelerate workflows.

Design goals:

1.  **Recall**: Allow completion of recently accessed aliases and context tags, including those from closed items.
2.  **Performance**: Sub-shell-latency (<50ms) lookups via a pre-computed local cache.
3.  **Reliability**: Atomic writes and correct workspace resolution.
4.  **Simplicity**: Cache-only approach; natural usage (`mm ls`, `mm note`, etc.) builds the cache over time.
5.  **Scalability**: Avoid full item enumeration; cache grows organically based on actual usage.

---

## 2. Terminology

*   **Completion Cache**: Two plain text files storing completion candidates.
*   **Aliases Cache**: `completion_aliases.txt` - one alias per line.
*   **Context Tags Cache**: `completion_context_tags.txt` - one tag per line.
*   **Recency**: File order (newest entries at end of file).

---

## 3. Architecture & Design

### 3.1 Caching Mechanism (The "Writer")

Cache updates are handled by **CacheUpdateService** integrated into commands.

*   **File Locations**:
    *   `<workspace_root>/.index/completion_aliases.txt`
    *   `<workspace_root>/.index/completion_context_tags.txt`
    *   If no workspace is active, no cache is written.
*   **Format**: Plain text, one value per line.
    *   Aliases file contains alias values (e.g., `todo`, `meeting-notes`)
    *   Context tags file contains tag values (e.g., `work`, `personal`)
    *   No metadata fields - file order represents recency (newest at end)
    *   IDs are not cached since UUIDs are not meant for manual typing

    ```text
    # completion_aliases.txt
    todo
    meeting-notes
    project-x

    # completion_context_tags.txt
    work
    personal
    urgent
    ```

*   **Update Trigger**:
    *   Commands call `CacheUpdateService` after successful execution
    *   Extracts aliases and context tags from created/displayed/modified items
    *   Only successful command results are cached (not arguments)
*   **Deduplication & Truncation**:
    *   **Tail-only deduplication**: Check last N lines (N = number of new entries) to avoid duplicates
    *   **Auto-truncation**: When file exceeds 1000 lines, remove oldest entries to maintain limit
    *   Both operations occur during each append (no separate compaction phase)
    *   Trade-off: Allows some duplicates for better performance vs full-file scanning

### 3.2 Shell Scripts (The "Reader")

The generated Zsh/Bash scripts will employ a **cache-only** strategy:

1.  **Cache Lookup**:
    *   Locate `.index/completion_aliases.txt` or `.index/completion_context_tags.txt` by traversing upward from CWD.
    *   Read file content directly (no parsing needed - plain text)
    *   *Goal*: Low latency (< 20ms) for common case (inside workspace).
2.  **No Cache Behavior**:
    *   If cache files are missing or empty, no completion candidates are provided.
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
*   **Aliases and Tags Only**: Completion suggests aliases and context tags. IDs are not suggested since they are long UUIDs not meant for manual typing.

---

## 5. Implementation Notes

### 5.1 Cache Update Integration

**CacheUpdateService** provides high-level API for commands:
*   `updateFromItem(item)` - Cache single item's alias and tag
*   `updateFromItems(items)` - Cache multiple items (for `mm ls`)
*   Silent error handling - cache failures don't break commands (warning message shown)

Commands call cache update after successful execution only.

### 5.2 Cache Population Strategy

Commands update the cache by extracting:
*   **From results only**: Items created, displayed, or modified by the command (extract their aliases and tags).
*   **Not from arguments**: Prevents caching values from failed commands.

This ensures natural usage builds the cache organically and accurately.

### 5.3 Alternatives Considered

*   **JSONL Format**: Rejected in favor of plain text for simplicity and easier shell script integration.
*   **Timestamps**: Rejected - file order is sufficient for recency tracking.
*   **Full deduplication**: Rejected - tail-only dedup is more efficient, some duplicates acceptable.
*   **Separate compaction phase**: Rejected - truncation on append is simpler.
*   **Reuse `.index` directly**: Rejected due to latency (>50ms parsing thousands of files) and lack of recency history.
*   **Fallback to full enumeration**: Rejected due to scalability concerns. Cache-only approach is simpler and safer; natural usage builds the cache.

---

## 6. Error Handling

*   **Cache Write Failures**: Commands show warning message but continue execution (e.g., "Warning: Failed to update completion cache: PermissionDenied...").
*   **Workspace Resolution Failure**: If not in a workspace, completion halts silently or falls back to basic file completion.
*   **Missing Cache Files**: Shell completion returns no candidates if cache files don't exist yet.

---

## 7. Testing Strategy

### 7.1 Unit Tests

*   **Deduplication**: Verify tail-only dedup works (check last N lines, skip duplicates).
*   **Truncation**: Insert 1015 entries with max 1000, verify oldest 15 are removed.
*   **Extraction**: Test `CacheExtractor` extracts correct aliases and tags from items.
*   **Update Service**: Test `CacheUpdateService` handles errors gracefully (silent with warning).
*   **Format Compliance**: Ensure plain text output, one value per line, newest at end.

---

## 8. Shell Snippet (Conceptual)

```zsh
_mm_find_cache_file() {
    local filename="$1" # 'completion_aliases.txt' or 'completion_context_tags.txt'
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/.index/$filename" ]]; then
            echo "$dir/.index/$filename"
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

_mm_get_alias_candidates() {
    local cache_file="$(_mm_find_cache_file completion_aliases.txt)"
    if [[ -n "$cache_file" ]]; then
        cat "$cache_file"
    fi
    # No fallback: if cache is missing/empty, no candidates are provided
}

_mm_get_tag_candidates() {
    local cache_file="$(_mm_find_cache_file completion_context_tags.txt)"
    if [[ -n "$cache_file" ]]; then
        cat "$cache_file"
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
    *   Run `mm note "Hello" --context work` to create an item.
    *   Check `.index/completion_aliases.txt` and `.index/completion_context_tags.txt` exist.
    *   Verify the alias file contains the new note's alias and tags file contains "work".
3.  **Completion After Cache Population**:
    *   Type `mm edit <TAB>` -> The newly created item's alias should be suggested.
4.  **Cache Growth Through Usage**:
    *   Run `mm ls` to display items.
    *   Check cache files now include aliases and context tags of displayed items.
    *   Verify `mm edit <TAB>` suggests these aliases and `mm note --context <TAB>` suggests the tags.

---

## 10. Technical Constraints & Details

*   **Shell Reading**: Simple `cat` command - no parsing needed for plain text format.
*   **Max Entries**: 1000 lines per cache file (auto-truncated on append).
*   **Deduplication Window**: Last N lines where N = number of new entries being appended.
*   **Error Handling**: Cache write failures show warning but don't break commands.
