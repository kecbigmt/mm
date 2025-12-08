/**
 * Completion cache entry types
 *
 * Cache entries store recently used aliases and tags for shell completion.
 * IDs are not cached since UUIDs are not meant for manual typing.
 */

export type CompletionCacheEntryType = "alias" | "tag";

/**
 * Alias cache entry
 */
export interface AliasEntry {
  readonly type: "alias";
  readonly value: string; // The alias name
  readonly canonical_key: string; // Same as value (alias slug)
  readonly target: string; // UUID the alias points to
  readonly last_seen: string; // ISO 8601 timestamp
}

/**
 * Tag cache entry
 */
export interface TagEntry {
  readonly type: "tag";
  readonly value: string; // The tag name
  readonly canonical_key: string; // Same as value (tag slug)
  readonly target?: undefined; // Tags don't have targets
  readonly last_seen: string; // ISO 8601 timestamp
}

/**
 * Union type for cache entries
 */
export type CompletionCacheEntry = AliasEntry | TagEntry;

/**
 * Create an alias cache entry
 */
export function createAliasEntry(params: {
  alias: string;
  targetId: string;
  lastSeen: string;
}): AliasEntry {
  return Object.freeze({
    type: "alias",
    value: params.alias,
    canonical_key: params.alias,
    target: params.targetId,
    last_seen: params.lastSeen,
  });
}

/**
 * Create a tag cache entry
 */
export function createTagEntry(params: {
  tag: string;
  lastSeen: string;
}): TagEntry {
  return Object.freeze({
    type: "tag",
    value: params.tag,
    canonical_key: params.tag,
    last_seen: params.lastSeen,
  });
}
