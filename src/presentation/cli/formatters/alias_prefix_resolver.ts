import { shortestUniquePrefix } from "../../../domain/services/alias_prefix_service.ts";

/**
 * A function that returns the shortest unique prefix length for an alias,
 * or undefined if no alias data is available.
 */
export type PrefixLengthResolver = (alias: string) => number | undefined;

/**
 * Create a PrefixLengthResolver that lazily computes and caches prefix lengths.
 *
 * Each alias is compared against the provided sorted alias list to determine
 * the shortest prefix that uniquely identifies it. Results are cached so
 * repeated lookups (e.g. across main query and expanded sections) are O(1).
 */
export const createPrefixLengthResolver = (
  sortedAliases: readonly string[],
): PrefixLengthResolver => {
  const cache = new Map<string, number>();

  return (alias: string): number | undefined => {
    if (sortedAliases.length === 0) return undefined;
    const cached = cache.get(alias);
    if (cached !== undefined) return cached;
    const len = shortestUniquePrefix(alias, sortedAliases).length;
    cache.set(alias, len);
    return len;
  };
};
