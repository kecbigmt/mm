import { Result } from "../../shared/result.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import type { Placement } from "../primitives/placement.ts";

/**
 * Summary of a section's direct children.
 *
 * Used by the partition builder to generate stub lines without loading item bodies.
 */
export type SectionSummary = Readonly<{
  /** Placement identifying this section (head + section path) */
  placement: Placement;
  /** Number of direct item children under this section */
  itemCount: number;
  /** Number of direct child sections under this section */
  sectionCount: number;
}>;

/**
 * Read-only service to list section summaries under a parent placement.
 *
 * This service reads from the graph index to provide section metadata without
 * loading item bodies. Used by the `mm ls` command to generate section stub
 * lines when listing numeric ranges.
 */
export interface SectionQueryService {
  /**
   * List direct child sections under a parent placement.
   *
   * @param parent - The parent placement to query (date head or item head with optional section path)
   * @returns Array of section summaries for direct children (not recursive)
   */
  listSections(
    parent: Placement,
  ): Promise<Result<ReadonlyArray<SectionSummary>, RepositoryError>>;
}
