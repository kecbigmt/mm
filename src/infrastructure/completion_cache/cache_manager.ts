import { CacheRepository } from "./cache_repository.ts";

/**
 * Configuration for cache manager
 */
export interface CacheManagerConfig {
  maxEntries: number;
}

/**
 * Cache manager coordinates repository for alias and context tag caches
 *
 * Simplified design:
 * - No compaction triggers (handled per-append in repository)
 * - No write counting
 * - Just delegates to repository with maxEntries config
 */
export class CacheManager {
  private readonly repository: CacheRepository;
  private readonly config: CacheManagerConfig;

  constructor(workspaceRoot: string, config: CacheManagerConfig) {
    this.repository = new CacheRepository(workspaceRoot);
    this.config = config;
  }

  /**
   * Add alias entries to cache
   */
  async addAliases(aliases: string[]): Promise<void> {
    if (aliases.length === 0) return;
    await this.repository.appendAliases(aliases, this.config.maxEntries);
  }

  /**
   * Add context tag entries to cache
   */
  async addContextTags(tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    await this.repository.appendContextTags(tags, this.config.maxEntries);
  }

  /**
   * Get all cached aliases
   */
  async getAliases(): Promise<string[]> {
    return await this.repository.readAliases();
  }

  /**
   * Get all cached context tags
   */
  async getContextTags(): Promise<string[]> {
    return await this.repository.readContextTags();
  }
}
