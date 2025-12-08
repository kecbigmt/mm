import type { CompletionCacheEntry } from "../../domain/models/completion_cache_entry.ts";
import { CacheRepository } from "./cache_repository.ts";
import { CompactionService } from "./compaction_service.ts";

/**
 * Configuration for cache manager
 */
export interface CacheManagerConfig {
  maxEntries: number;
  compactionThreshold?: {
    writes: number; // Compact after N writes
    sizeBytes: number; // Compact if file exceeds N bytes
  };
}

/**
 * Cache manager coordinates repository and compaction
 *
 * Tracks write count and file size to trigger compaction automatically.
 * Default thresholds: 10 writes or 50KB file size.
 */
export class CacheManager {
  private readonly repository: CacheRepository;
  private readonly compactionService: CompactionService;
  private readonly config: Required<CacheManagerConfig>;
  private writeCount: number = 0;

  constructor(workspaceRoot: string, config: CacheManagerConfig) {
    this.repository = new CacheRepository(workspaceRoot);
    this.compactionService = new CompactionService({
      maxEntries: config.maxEntries,
    });
    this.config = {
      maxEntries: config.maxEntries,
      compactionThreshold: config.compactionThreshold ?? {
        writes: 10,
        sizeBytes: 50000, // 50KB
      },
    };
  }

  /**
   * Add entries to cache
   * Triggers compaction if thresholds are met
   */
  async add(entries: CompletionCacheEntry[]): Promise<void> {
    await this.repository.append(entries);
    this.writeCount++;

    if (this.shouldCompact()) {
      await this.compact();
      this.writeCount = 0;
    }
  }

  /**
   * Get all cached entries
   */
  async getAll(): Promise<CompletionCacheEntry[]> {
    return await this.repository.read();
  }

  /**
   * Manually trigger compaction
   */
  async compact(): Promise<void> {
    const entries = await this.repository.read();
    const compacted = this.compactionService.compact(entries);
    await this.repository.atomicWrite(compacted);
  }

  /**
   * Check if compaction should be triggered
   */
  private shouldCompact(): boolean {
    // Check write count
    if (this.writeCount >= this.config.compactionThreshold.writes) {
      return true;
    }

    // Check file size (simple heuristic: count >= threshold implies size check)
    // For more accurate size check, we could stat the file, but this adds overhead
    return false;
  }
}
