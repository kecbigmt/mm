/**
 * Item representation for cache extraction
 * Matches the structure of domain Item
 */
export interface ExtractableItem {
  readonly data: {
    readonly alias?: { toString(): string };
    readonly context?: { toString(): string };
  };
}

/**
 * Extraction result containing aliases and context tags
 */
export interface ExtractedEntries {
  aliases: string[];
  contextTags: string[];
}

/**
 * Extracts cache entries from a single item
 * Returns separate arrays for aliases and context tags
 */
export function extractFromItem(item: ExtractableItem): ExtractedEntries {
  const aliases: string[] = [];
  const contextTags: string[] = [];

  if (item.data.alias) {
    aliases.push(item.data.alias.toString());
  }

  if (item.data.context) {
    contextTags.push(item.data.context.toString());
  }

  return { aliases, contextTags };
}

/**
 * Extracts cache entries from multiple items
 */
export function extractFromItems(
  items: ReadonlyArray<ExtractableItem>,
): ExtractedEntries {
  const aliases: string[] = [];
  const contextTags: string[] = [];

  for (const item of items) {
    const extracted = extractFromItem(item);
    aliases.push(...extracted.aliases);
    contextTags.push(...extracted.contextTags);
  }

  return { aliases, contextTags };
}

/**
 * Extracts cache entries from command arguments
 * Used before command execution to capture user-provided references
 */
export interface ExtractFromArgsInput {
  /**
   * Context tag option value
   * e.g., `--context work`
   */
  contextOption?: string;
}

/**
 * Extracts cache entries from command arguments
 * Only extracts context tags (aliases come from command results)
 */
export function extractFromArgs(args: ExtractFromArgsInput): ExtractedEntries {
  const aliases: string[] = [];
  const contextTags: string[] = [];

  if (args.contextOption && args.contextOption.trim().length > 0) {
    contextTags.push(args.contextOption);
  }

  return { aliases, contextTags };
}
