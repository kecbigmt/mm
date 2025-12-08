import { dirname, join } from "@std/path";
import type { CompletionCacheEntry } from "../../domain/models/completion_cache_entry.ts";

/**
 * Repository for managing completion cache file I/O
 *
 * Reads and writes completion_cache.jsonl in JSONL format.
 * Handles malformed lines gracefully by skipping them.
 */
export class CacheRepository {
  private readonly cacheFilePath: string;

  constructor(workspaceRoot: string) {
    this.cacheFilePath = join(workspaceRoot, ".index", "completion_cache.jsonl");
  }

  /**
   * Read all cache entries from the file
   * Returns empty array if file doesn't exist
   * Skips malformed lines
   */
  async read(): Promise<CompletionCacheEntry[]> {
    try {
      const content = await Deno.readTextFile(this.cacheFilePath);
      const lines = content.trim().split("\n");

      const entries: CompletionCacheEntry[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line) as CompletionCacheEntry;
          entries.push(entry);
        } catch {
          // Skip malformed lines
          continue;
        }
      }

      return entries;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Write entries to cache file (overwrites existing file)
   */
  async write(entries: CompletionCacheEntry[]): Promise<void> {
    const lines = entries.map((entry) => JSON.stringify(entry));
    const content = lines.join("\n") + (lines.length > 0 ? "\n" : "");

    // Ensure .index directory exists
    const indexDir = dirname(this.cacheFilePath);
    await Deno.mkdir(indexDir, { recursive: true });

    await Deno.writeTextFile(this.cacheFilePath, content);
  }

  /**
   * Append entries to cache file
   */
  async append(entries: CompletionCacheEntry[]): Promise<void> {
    const lines = entries.map((entry) => JSON.stringify(entry));
    const content = lines.join("\n") + "\n";

    // Ensure .index directory exists
    const indexDir = dirname(this.cacheFilePath);
    await Deno.mkdir(indexDir, { recursive: true });

    try {
      await Deno.writeTextFile(this.cacheFilePath, content, { append: true });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // File doesn't exist, create it
        await Deno.writeTextFile(this.cacheFilePath, content);
      } else {
        throw error;
      }
    }
  }

  /**
   * Atomic write using tmp file and rename
   * Prevents corruption from concurrent writes or interrupts
   */
  async atomicWrite(entries: CompletionCacheEntry[]): Promise<void> {
    const lines = entries.map((entry) => JSON.stringify(entry));
    const content = lines.join("\n") + (lines.length > 0 ? "\n" : "");

    // Ensure .index directory exists
    const indexDir = dirname(this.cacheFilePath);
    await Deno.mkdir(indexDir, { recursive: true });

    const tmpFile = this.cacheFilePath + ".tmp";

    // Write to tmp file
    await Deno.writeTextFile(tmpFile, content);

    // Atomic rename
    await Deno.rename(tmpFile, this.cacheFilePath);
  }
}
