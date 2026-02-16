import { Result } from "../../../../shared/result.ts";
import { ITEM_SCHEMA_V4 } from "../../workspace_schema.ts";
import type { MigrationStep } from "../migration_step.ts";
import type { MigrationItemError, RawItemFile, RawItemFrontmatter } from "../types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const looksLikeUuid = (value: string): boolean => value.length === 36 && UUID_PATTERN.test(value);

const hasAliasStrings = (fm: RawItemFrontmatter): boolean => {
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

const resolveValue = (
  value: string,
  resolutionMap: ReadonlyMap<string, string>,
  fieldLabel: string,
): Result<string, MigrationItemError> => {
  if (looksLikeUuid(value)) return Result.ok(value);
  const uuid = resolutionMap.get(value);
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
 * Migration step 1 → 2: Convert alias strings to permanent item UUIDs.
 *
 * Converts alias strings in project/contexts fields to permanent item UUIDs
 * and bumps item schema from mm.item.frontmatter/3 to /4.
 * External references (alias strings) must be resolved into a resolutionMap
 * by the CLI command before calling transform().
 */
export const v1ToV2Step: MigrationStep = {
  fromMigration: 1,
  toMigration: 2,
  description: "Convert alias strings to permanent item UUIDs",

  needsTransformation(fm: RawItemFrontmatter): boolean {
    return hasAliasStrings(fm);
  },

  collectExternalReferences(items: ReadonlyArray<RawItemFile>): string[] {
    const aliases = new Set<string>();
    for (const item of items) {
      const fm = item.frontmatter;
      if (fm.project && typeof fm.project === "string" && !looksLikeUuid(fm.project)) {
        aliases.add(fm.project);
      }
      if (fm.contexts && Array.isArray(fm.contexts)) {
        for (const ctx of fm.contexts) {
          if (typeof ctx === "string" && !looksLikeUuid(ctx)) {
            aliases.add(ctx);
          }
        }
      }
    }
    return [...aliases];
  },

  transform(
    fm: RawItemFrontmatter,
    resolutionMap: ReadonlyMap<string, string>,
  ): Result<RawItemFrontmatter, MigrationItemError[]> {
    const errors: MigrationItemError[] = [];
    const updated = { ...fm };

    if (updated.project && typeof updated.project === "string") {
      const result = resolveValue(updated.project, resolutionMap, "alias");
      if (result.type === "error") {
        errors.push(result.error);
      } else {
        updated.project = result.value;
      }
    }

    if (updated.contexts && Array.isArray(updated.contexts)) {
      const resolved: string[] = [];
      for (const ctx of updated.contexts) {
        if (typeof ctx === "string") {
          const result = resolveValue(ctx, resolutionMap, "context alias");
          if (result.type === "error") {
            errors.push(result.error);
          } else {
            resolved.push(result.value);
          }
        }
      }
      if (errors.length === 0) {
        updated.contexts = resolved;
      }
    }

    updated.schema = ITEM_SCHEMA_V4;

    if (errors.length > 0) return Result.error(errors);
    return Result.ok(updated);
  },
};
