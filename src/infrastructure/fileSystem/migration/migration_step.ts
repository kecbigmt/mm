import { Result } from "../../../shared/result.ts";
import type { MigrationItemError, RawItemFile, RawItemFrontmatter } from "./types.ts";

/**
 * A single migration step that transforms item frontmatter.
 *
 * Steps are indexed by migration number: if the workspace is at migration 1
 * and current is 3, the runner applies step 1→2 then 2→3 in sequence.
 */
export interface MigrationStep {
  /** Migration version this step migrates FROM */
  readonly fromMigration: number;
  /** Migration version this step migrates TO */
  readonly toMigration: number;
  /** Human-readable description for dry-run output */
  readonly description: string;

  /**
   * Check if an item needs transformation beyond a schema bump.
   * Used to count "items with real changes" vs "schema-bump-only" in dry-run.
   */
  needsTransformation(fm: RawItemFrontmatter): boolean;

  /**
   * Collect external references that must be resolved before transform.
   *
   * For example, migration 1→2 collects alias strings that need permanent items
   * created. The CLI command resolves these into a resolutionMap passed
   * to transform(). Steps with no external dependencies return [].
   */
  collectExternalReferences(items: ReadonlyArray<RawItemFile>): string[];

  /**
   * Transform a single item's frontmatter.
   *
   * @param fm - The raw frontmatter to transform
   * @param resolutionMap - Map of external reference → resolved value
   *   (e.g., alias string → UUID for migration 1→2; empty for simple renames)
   */
  transform(
    fm: RawItemFrontmatter,
    resolutionMap: ReadonlyMap<string, string>,
  ): Result<RawItemFrontmatter, MigrationItemError[]>;
}
