import type { CompletionCacheEntry } from "../../domain/models/completion_cache_entry.ts";

/**
 * Service for compacting cache entries
 *
 * Performs:
 * 1. Deduplication by (type, canonical_key)
 * 2. Keeps most recent last_seen
 * 3. Updates alias targets when changed
 * 4. Sorts by recency (newest first)
 * 5. Truncates to maxEntries
 */
export class CompactionService {
  private readonly maxEntries: number;

  constructor(options: { maxEntries: number }) {
    this.maxEntries = options.maxEntries;
  }

  /**
   * Compact entries according to the rules
   */
  compact(entries: CompletionCacheEntry[]): CompletionCacheEntry[] {
    if (entries.length === 0) {
      return [];
    }

    // Step 1: Deduplicate by (type, canonical_key), keeping most recent
    const deduped = this.deduplicate(entries);

    // Step 2: Sort by last_seen (newest first)
    const sorted = deduped.sort((a, b) => {
      return b.last_seen.localeCompare(a.last_seen);
    });

    // Step 3: Truncate to maxEntries
    return sorted.slice(0, this.maxEntries);
  }

  private deduplicate(
    entries: CompletionCacheEntry[],
  ): CompletionCacheEntry[] {
    const map = new Map<string, CompletionCacheEntry>();

    for (const entry of entries) {
      const key = `${entry.type}:${entry.canonical_key}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, entry);
      } else {
        // Keep the one with more recent last_seen
        if (entry.last_seen > existing.last_seen) {
          map.set(key, entry);
        }
      }
    }

    return Array.from(map.values());
  }
}
