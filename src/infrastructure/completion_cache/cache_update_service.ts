import { CacheManager } from "./cache_manager.ts";
import {
  type ExtractableItem,
  extractFromArgs,
  type ExtractFromArgsInput,
  extractFromItem,
  extractFromItems,
} from "./cache_extractor.ts";

/**
 * Service for updating completion cache from command execution
 *
 * Wraps CacheManager and provides convenient methods for commands.
 * Silently handles errors to ensure cache failures don't break commands.
 */
export class CacheUpdateService {
  constructor(
    private readonly manager: CacheManager,
  ) {}

  /**
   * Update cache from command arguments
   * Call before command execution to capture user-provided references
   */
  async updateFromArgs(args: ExtractFromArgsInput): Promise<void> {
    try {
      const { aliases, contextTags } = extractFromArgs(args);
      await this.manager.addAliases(aliases);
      await this.manager.addContextTags(contextTags);
    } catch {
      // Silently ignore cache errors
    }
  }

  /**
   * Update cache from a single item result
   * Call after successful command execution
   */
  async updateFromItem(item: ExtractableItem): Promise<void> {
    try {
      const { aliases, contextTags } = extractFromItem(item);
      await this.manager.addAliases(aliases);
      await this.manager.addContextTags(contextTags);
    } catch (error) {
      console.warn("Warning: Failed to update completion cache:", error);
    }
  }

  /**
   * Read all cached aliases
   * Returns [] on error so callers are never blocked by cache failures
   */
  async getAliases(): Promise<string[]> {
    try {
      const aliases = await this.manager.getAliases();
      return [...new Set(aliases)];
    } catch {
      return [];
    }
  }

  /**
   * Update cache from multiple item results
   * Call after successful ls command execution
   */
  async updateFromItems(items: ReadonlyArray<ExtractableItem>): Promise<void> {
    try {
      const { aliases, contextTags } = extractFromItems(items);
      await this.manager.addAliases(aliases);
      await this.manager.addContextTags(contextTags);
    } catch (error) {
      console.warn("Warning: Failed to update completion cache:", error);
    }
  }
}
