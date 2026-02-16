import { Result } from "../../../shared/result.ts";
import type { MigrationStep } from "./migration_step.ts";
import type { MigrationItemError, RawItemFile, RawItemFrontmatter } from "./types.ts";

export type StepAnalysis = Readonly<{
  step: MigrationStep;
  applicableItems: number;
  itemsWithTransformation: number;
  itemsWithSchemaBumpOnly: number;
  externalReferences: ReadonlyArray<string>;
}>;

/**
 * Find migration steps applicable given the current migration version.
 * Returns steps that chain from currentMigration forward.
 */
export function findApplicableSteps(
  currentMigration: number,
  allSteps: ReadonlyArray<MigrationStep>,
): MigrationStep[] {
  const chain: MigrationStep[] = [];
  let version = currentMigration;

  for (const step of allSteps) {
    if (step.fromMigration === version) {
      chain.push(step);
      version = step.toMigration;
    }
  }

  return chain;
}

/**
 * Analyze each step against the items to produce a summary.
 * All items are considered applicable to each step in the chain.
 */
export function analyzeSteps(
  items: ReadonlyArray<RawItemFile>,
  steps: ReadonlyArray<MigrationStep>,
): StepAnalysis[] {
  return steps.map((step) => {
    const withTransformation = items.filter((i) => step.needsTransformation(i.frontmatter));
    const refs = step.collectExternalReferences(items);

    return {
      step,
      applicableItems: items.length,
      itemsWithTransformation: withTransformation.length,
      itemsWithSchemaBumpOnly: items.length - withTransformation.length,
      externalReferences: refs,
    };
  });
}

/**
 * Collect all external references across all steps.
 */
export function collectAllExternalReferences(
  items: ReadonlyArray<RawItemFile>,
  steps: ReadonlyArray<MigrationStep>,
): string[] {
  const refs = new Set<string>();
  for (const step of steps) {
    for (const ref of step.collectExternalReferences(items)) {
      refs.add(ref);
    }
  }
  return [...refs];
}

/**
 * Apply migration steps to a single item's frontmatter.
 * All applicable steps are applied in sequence.
 */
export function applySteps(
  fm: RawItemFrontmatter,
  steps: ReadonlyArray<MigrationStep>,
  resolutionMap: ReadonlyMap<string, string>,
): Result<RawItemFrontmatter, MigrationItemError[]> {
  let current = fm;
  for (const step of steps) {
    const result = step.transform(current, resolutionMap);
    if (result.type === "error") return result;
    current = result.value;
  }
  return Result.ok(current);
}
