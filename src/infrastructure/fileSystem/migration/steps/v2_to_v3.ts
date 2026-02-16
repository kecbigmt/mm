import { Result } from "../../../../shared/result.ts";
import { ITEM_SCHEMA_V5 } from "../../workspace_schema.ts";
import type { MigrationStep } from "../migration_step.ts";
import type { MigrationItemError, RawItemFrontmatter } from "../types.ts";

/**
 * Migration step 2 → 3: Rename placement field to directory.
 *
 * Copies the `placement` frontmatter field to `directory`, removes the old
 * field, and bumps the item schema to mm.item.frontmatter/5.
 */
export const v2ToV3Step: MigrationStep = {
  fromMigration: 2,
  toMigration: 3,
  description: "Rename placement field to directory",

  needsTransformation(fm: RawItemFrontmatter): boolean {
    return "placement" in fm;
  },

  collectExternalReferences(): string[] {
    return [];
  },

  transform(
    fm: RawItemFrontmatter,
    _resolutionMap: ReadonlyMap<string, string>,
  ): Result<RawItemFrontmatter, MigrationItemError[]> {
    const updated = { ...fm };

    if ("placement" in updated) {
      (updated as Record<string, unknown>)["directory"] =
        (updated as Record<string, unknown>)["placement"];
      delete (updated as Record<string, unknown>)["placement"];
    }

    updated.schema = ITEM_SCHEMA_V5;

    return Result.ok(updated);
  },
};
