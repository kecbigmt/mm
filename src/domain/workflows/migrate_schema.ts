import { Result } from "../../shared/result.ts";
import { CURRENT_ITEM_SCHEMA } from "../models/workspace_schema.ts";

/**
 * Raw frontmatter data as read from item files, before domain validation.
 * Used by migration to read/write items without going through parseItem.
 */
export type RawItemFrontmatter = Record<string, unknown> & {
  id: string;
  icon: string;
  status: string;
  placement: string;
  rank: string;
  created_at: string;
  updated_at: string;
  schema?: string;
  project?: string;
  contexts?: string[];
  alias?: string;
};

export type RawItemFile = Readonly<{
  filePath: string;
  frontmatter: RawItemFrontmatter;
  body: string;
}>;

export type MigrationScanError = Readonly<{
  kind: "io_error" | "parse_error";
  message: string;
  path: string;
  cause?: unknown;
}>;

export type MigrationScanResult = Readonly<{
  totalItems: number;
  itemsWithAliases: number;
  uniqueAliases: ReadonlyArray<string>;
  allItems: ReadonlyArray<RawItemFile>;
  parseErrors: ReadonlyArray<MigrationScanError>;
}>;

export type MigrationError = Readonly<{
  kind: "scan_error" | "alias_resolution" | "write_error" | "workspace_error";
  message: string;
  path?: string;
}>;

export type MigrationItemError = Readonly<{
  path: string;
  alias: string;
  message: string;
}>;

export type MigrationPlan = Readonly<{
  permanentItemsToCreate: ReadonlyArray<string>;
  itemsToUpdate: number;
  itemsWithAliasConversion: number;
  itemsWithSchemaBumpOnly: number;
  currentWorkspaceSchema: string | undefined;
}>;

/**
 * Check if a string matches UUID format (v4/v7 compatible).
 */
export const looksLikeUuid = (value: string): boolean => {
  if (value.length === 36 && value.includes("-")) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
  return false;
};

/**
 * Determine if a raw item needs alias-to-UUID migration.
 */
export const itemNeedsAliasMigration = (fm: RawItemFrontmatter): boolean => {
  if (fm.project && typeof fm.project === "string" && !looksLikeUuid(fm.project)) {
    return true;
  }
  if (fm.contexts && Array.isArray(fm.contexts)) {
    for (const ctx of fm.contexts) {
      if (typeof ctx === "string" && !looksLikeUuid(ctx)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Determine if a raw item needs schema bump (from /3 to /4).
 */
export const itemNeedsSchemaBump = (fm: RawItemFrontmatter): boolean => {
  return fm.schema !== CURRENT_ITEM_SCHEMA;
};

/**
 * Collect all unique alias strings from an item's project/contexts fields.
 */
export const collectAliasStrings = (fm: RawItemFrontmatter): string[] => {
  const aliases: string[] = [];
  if (fm.project && typeof fm.project === "string" && !looksLikeUuid(fm.project)) {
    aliases.push(fm.project);
  }
  if (fm.contexts && Array.isArray(fm.contexts)) {
    for (const ctx of fm.contexts) {
      if (typeof ctx === "string" && !looksLikeUuid(ctx)) {
        aliases.push(ctx);
      }
    }
  }
  return aliases;
};

/**
 * Scan items and build a migration plan.
 */
export const buildMigrationPlan = (
  scanResult: MigrationScanResult,
  workspaceSchema: string | undefined,
  existingAliases: ReadonlySet<string>,
): MigrationPlan => {
  const newAliases = scanResult.uniqueAliases.filter((a) => !existingAliases.has(a));

  return {
    permanentItemsToCreate: newAliases,
    itemsToUpdate: scanResult.totalItems,
    itemsWithAliasConversion: scanResult.itemsWithAliases,
    itemsWithSchemaBumpOnly: scanResult.totalItems - scanResult.itemsWithAliases,
    currentWorkspaceSchema: workspaceSchema,
  };
};

/**
 * Resolve a single alias-or-UUID value to a UUID using the alias map.
 * Returns the resolved UUID or an error for unresolvable aliases.
 */
const resolveAliasValue = (
  value: string,
  aliasToUuid: ReadonlyMap<string, string>,
  fieldLabel: string,
): Result<string, MigrationItemError> => {
  if (looksLikeUuid(value)) {
    return Result.ok(value);
  }
  const uuid = aliasToUuid.get(value);
  if (!uuid) {
    return Result.error({
      path: "",
      alias: value,
      message: `Cannot resolve ${fieldLabel} '${value}' to a permanent item UUID`,
    });
  }
  return Result.ok(uuid);
};

/**
 * Apply migration to a single item's frontmatter.
 * Returns updated frontmatter with UUID references and schema /4.
 */
export const migrateItemFrontmatter = (
  frontmatter: RawItemFrontmatter,
  aliasToUuid: ReadonlyMap<string, string>,
): Result<RawItemFrontmatter, MigrationItemError[]> => {
  const errors: MigrationItemError[] = [];
  const updated = { ...frontmatter };

  // Resolve project alias to UUID
  if (updated.project && typeof updated.project === "string") {
    const result = resolveAliasValue(updated.project, aliasToUuid, "alias");
    if (result.type === "error") {
      errors.push(result.error);
    } else {
      updated.project = result.value;
    }
  }

  // Resolve context aliases to UUIDs
  if (updated.contexts && Array.isArray(updated.contexts)) {
    const resolvedContexts: string[] = [];
    for (const ctx of updated.contexts) {
      if (typeof ctx === "string") {
        const result = resolveAliasValue(ctx, aliasToUuid, "context alias");
        if (result.type === "error") {
          errors.push(result.error);
        } else {
          resolvedContexts.push(result.value);
        }
      }
    }
    if (errors.length === 0) {
      updated.contexts = resolvedContexts;
    }
  }

  // Bump schema to /4
  updated.schema = CURRENT_ITEM_SCHEMA;

  if (errors.length > 0) {
    return Result.error(errors);
  }

  return Result.ok(updated);
};

/**
 * Collect all unique alias strings from scanned items.
 */
export const collectAllAliases = (items: ReadonlyArray<RawItemFile>): Set<string> => {
  const aliases = new Set<string>();
  for (const item of items) {
    for (const alias of collectAliasStrings(item.frontmatter)) {
      aliases.add(alias);
    }
  }
  return aliases;
};

/**
 * Build scan result from raw item iterator results.
 */
export const buildScanResult = (
  items: RawItemFile[],
  parseErrors: MigrationScanError[],
): MigrationScanResult => {
  const aliasSet = collectAllAliases(items);
  const itemsWithAliases = items.filter((i) => itemNeedsAliasMigration(i.frontmatter)).length;

  return {
    totalItems: items.length,
    itemsWithAliases,
    uniqueAliases: [...aliasSet],
    allItems: items,
    parseErrors,
  };
};
