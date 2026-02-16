import { shortestUniquePrefix } from "../../../domain/services/alias_prefix_service.ts";

/**
 * Sorted alias data needed to compute shortest unique prefix lengths.
 *
 * The two-tier structure matches the alias resolution design:
 * aliases in the priority set (today +/-7d) are compared against each other,
 * while other aliases fall back to the full set.
 */
export type AliasPrefixData = Readonly<{
  sortedPrioritySet: readonly string[];
  sortedAllAliases: readonly string[];
  prioritySetLookup: ReadonlySet<string>;
}>;

/**
 * A function that returns the shortest unique prefix length for an alias,
 * or undefined if no alias data is available.
 */
export type PrefixLengthResolver = (alias: string) => number | undefined;

/**
 * Create a PrefixLengthResolver that lazily computes and caches prefix lengths.
 *
 * Each alias is compared against its tier (priority set or all aliases) to
 * determine the shortest prefix that uniquely identifies it. Results are
 * cached so repeated lookups (e.g. across main query and expanded sections)
 * are O(1).
 */
export const createPrefixLengthResolver = (data: AliasPrefixData): PrefixLengthResolver => {
  const { sortedPrioritySet, sortedAllAliases, prioritySetLookup } = data;
  const cache = new Map<string, number>();

  return (alias: string): number | undefined => {
    if (sortedAllAliases.length === 0) return undefined;
    const cached = cache.get(alias);
    if (cached !== undefined) return cached;
    const len = prioritySetLookup.has(alias)
      ? shortestUniquePrefix(alias, sortedPrioritySet).length
      : shortestUniquePrefix(alias, sortedAllAliases).length;
    cache.set(alias, len);
    return len;
  };
};
