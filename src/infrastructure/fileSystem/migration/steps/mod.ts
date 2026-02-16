import type { MigrationStep } from "../migration_step.ts";
import { v1ToV2Step } from "./v1_to_v2.ts";

/**
 * All registered migration steps, ordered by migration number.
 *
 * To add a new migration:
 * 1. Create a new step file (e.g., v2_to_v3.ts)
 * 2. Add it to this array
 */
export const ALL_MIGRATION_STEPS: readonly MigrationStep[] = [
  v1ToV2Step,
];
