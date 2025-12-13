import { dirname, join } from "@std/path";

/**
 * Repository for managing completion cache files
 *
 * Manages two text files:
 * - completion_aliases.txt: Item aliases (one per line)
 * - completion_context_tags.txt: Context tags (one per line)
 *
 * File format: Plain text, one value per line, newest entries at the end.
 */
export class CacheRepository {
  private readonly aliasesFilePath: string;
  private readonly contextTagsFilePath: string;

  constructor(workspaceRoot: string) {
    const indexDir = join(workspaceRoot, ".index");
    this.aliasesFilePath = join(indexDir, "completion_aliases.txt");
    this.contextTagsFilePath = join(indexDir, "completion_context_tags.txt");
  }

  /**
   * Read all alias entries
   * Returns empty array if file doesn't exist
   */
  async readAliases(): Promise<string[]> {
    return await this.readFile(this.aliasesFilePath);
  }

  /**
   * Read all context tag entries
   * Returns empty array if file doesn't exist
   */
  async readContextTags(): Promise<string[]> {
    return await this.readFile(this.contextTagsFilePath);
  }

  /**
   * Append aliases with deduplication and truncation
   *
   * Algorithm:
   * 1. Read last N lines (N = number of new entries)
   * 2. Skip entries that already exist in last N lines
   * 3. Append new entries
   * 4. If total > maxEntries, remove from beginning
   */
  async appendAliases(entries: string[], maxEntries: number): Promise<void> {
    await this.appendWithDedup(this.aliasesFilePath, entries, maxEntries);
  }

  /**
   * Append context tags with deduplication and truncation
   */
  async appendContextTags(entries: string[], maxEntries: number): Promise<void> {
    await this.appendWithDedup(this.contextTagsFilePath, entries, maxEntries);
  }

  /**
   * Generic file reader
   */
  private async readFile(filePath: string): Promise<string[]> {
    try {
      const content = await Deno.readTextFile(filePath);
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Append entries with deduplication against tail and truncation
   */
  private async appendWithDedup(
    filePath: string,
    newEntries: string[],
    maxEntries: number,
  ): Promise<void> {
    if (newEntries.length === 0) {
      return;
    }

    // Ensure .index directory exists
    const indexDir = dirname(filePath);
    await Deno.mkdir(indexDir, { recursive: true });

    // Read current entries
    const existing = await this.readFile(filePath);

    // Get last N lines for deduplication check
    const checkCount = newEntries.length;
    const tailEntries = existing.slice(-checkCount);
    const tailSet = new Set(tailEntries);

    // Filter out duplicates from new entries
    const toAppend = newEntries.filter((entry) => !tailSet.has(entry));

    if (toAppend.length === 0) {
      // All entries were duplicates, nothing to append
      return;
    }

    // Combine existing + new entries
    const combined = [...existing, ...toAppend];

    // Truncate from beginning if exceeds maxEntries
    const final = combined.length > maxEntries
      ? combined.slice(combined.length - maxEntries)
      : combined;

    // Write back
    const content = final.join("\n") + (final.length > 0 ? "\n" : "");
    await Deno.writeTextFile(filePath, content);
  }

  /**
   * Get file paths (for testing/debugging)
   */
  getFilePaths(): { aliases: string; contextTags: string } {
    return {
      aliases: this.aliasesFilePath,
      contextTags: this.contextTagsFilePath,
    };
  }
}
