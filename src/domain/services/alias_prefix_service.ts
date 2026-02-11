/**
 * Alias prefix service: normalization, shortest unique prefix calculation,
 * and prefix resolution with priority set support.
 */

export type PrefixResolutionResult =
  | { readonly kind: "single"; readonly alias: string }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly kind: "none" };

export const normalizeAlias = (alias: string): string => {
  return alias.replace(/-/g, "").toLowerCase();
};

const commonPrefixLength = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
};

export const shortestUniquePrefix = (
  target: string,
  sortedAliases: readonly string[],
): string => {
  const index = sortedAliases.indexOf(target);
  if (index === -1 || sortedAliases.length <= 1) {
    return target.slice(0, 1);
  }

  let maxCommon = 0;
  if (index > 0) {
    maxCommon = Math.max(maxCommon, commonPrefixLength(target, sortedAliases[index - 1]));
  }
  if (index < sortedAliases.length - 1) {
    maxCommon = Math.max(maxCommon, commonPrefixLength(target, sortedAliases[index + 1]));
  }

  return target.slice(0, maxCommon + 1);
};

/**
 * Resolve a normalized prefix against a single alias set.
 * Returns a definitive result (single/ambiguous) or "none" if no matches found.
 */
const resolvePrefixInSet = (
  prefix: string,
  aliases: readonly string[],
): PrefixResolutionResult => {
  const exact = aliases.find((a) => a === prefix);
  if (exact) {
    return { kind: "single", alias: exact };
  }

  const matches = aliases.filter((a) => a.startsWith(prefix));
  if (matches.length === 1) {
    return { kind: "single", alias: matches[0] };
  }
  if (matches.length > 1) {
    return { kind: "ambiguous", candidates: matches };
  }

  return { kind: "none" };
};

export const resolvePrefix = (
  input: string,
  prioritySet: readonly string[],
  allItems: readonly string[],
): PrefixResolutionResult => {
  const normalized = normalizeAlias(input);
  if (normalized.length === 0) {
    return { kind: "none" };
  }

  const priorityResult = resolvePrefixInSet(normalized, prioritySet);
  if (priorityResult.kind !== "none") {
    return priorityResult;
  }

  return resolvePrefixInSet(normalized, allItems);
};
