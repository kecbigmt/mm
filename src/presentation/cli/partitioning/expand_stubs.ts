import type { Item } from "../../../domain/models/item.ts";
import type { ItemRepository } from "../../../domain/repositories/item_repository.ts";
import type {
  SectionQueryService,
  SectionSummary,
} from "../../../domain/services/section_query_service.ts";
import { createSingleRange } from "../../../domain/primitives/directory_range.ts";
import type { SectionStub } from "./build_partitions.ts";
import {
  formatSectionHeader,
  formatSectionStub,
  type ListFormatterOptions,
} from "../formatters/list_formatter.ts";

/**
 * Dependencies required by expandStubs for IO operations.
 */
export type ExpandStubsDeps = Readonly<{
  readonly itemRepository: ItemRepository;
  readonly sectionQueryService: SectionQueryService;
}>;

/**
 * Callback to format a list of items into output lines.
 *
 * Decouples the expansion logic from item-line formatting details
 * (alias resolution, prefix highlighting, etc.).
 */
export type FormatItemsFn = (
  items: ReadonlyArray<Item>,
  lines: string[],
) => void;

/**
 * Predicate to filter items (status, snooze, icon, etc.).
 * Should match the same filters applied by the main listing workflow.
 */
export type ItemFilterFn = (item: Item) => boolean;

/**
 * Convert a SectionSummary to a SectionStub relative to a parent directory.
 */
const toRelativeStub = (
  summary: SectionSummary,
  parentSectionLength: number,
): SectionStub => {
  const relSection = summary.directory.section.slice(parentSectionLength);
  return {
    directory: summary.directory,
    relativePath: relSection.join("/") + "/",
    itemCount: summary.itemCount,
    sectionCount: summary.sectionCount,
  };
};

/**
 * Filter to non-empty sections (has items or sub-sections).
 */
const isNonEmpty = (s: SectionSummary): boolean => s.itemCount > 0 || s.sectionCount > 0;

const INDENT_UNIT = "  ";

/**
 * Build an indent prefix string for the given depth level.
 */
const indent = (level: number): string => INDENT_UNIT.repeat(level);

/**
 * Expand section stubs recursively up to a given depth.
 *
 * At depth > 0, each stub is rendered as a section header followed by its items.
 * At depth 0 (or when depth is exhausted), stubs are rendered as summary lines.
 * Sub-sections discovered during expansion are either recursed into (if depth
 * remains) or rendered as stubs at the boundary.
 *
 * @param indentLevel - Current nesting level for indentation (0 = top level)
 */
export const expandStubs = async (
  stubs: ReadonlyArray<SectionStub>,
  remainingDepth: number,
  lines: string[],
  deps: ExpandStubsDeps,
  formatterOptions: ListFormatterOptions,
  formatItems: FormatItemsFn,
  itemFilter: ItemFilterFn,
  indentLevel = 0,
): Promise<void> => {
  const prefix = indent(indentLevel);
  const childPrefix = indent(indentLevel + 1);

  for (const stub of stubs) {
    if (remainingDepth <= 0) {
      const stubSummary: SectionSummary = {
        directory: stub.directory,
        itemCount: stub.itemCount,
        sectionCount: stub.sectionCount,
      };
      lines.push(prefix + formatSectionStub(stubSummary, stub.relativePath, formatterOptions));
      continue;
    }

    // Render as expanded section header
    lines.push(prefix + formatSectionHeader(stub.relativePath, formatterOptions));

    // Query items under this section's directory
    const sectionRange = createSingleRange(stub.directory);
    const sectionItemsResult = await deps.itemRepository.listByDirectory(sectionRange);
    if (sectionItemsResult.type === "ok") {
      const sectionItems = sectionItemsResult.value.filter(itemFilter);
      const itemLines: string[] = [];
      formatItems(sectionItems, itemLines);
      for (const line of itemLines) {
        lines.push(childPrefix + line);
      }
    } else {
      console.error(
        `Warning: failed to load items for section ${stub.relativePath}: ${sectionItemsResult.error.message}`,
      );
    }

    // Query sub-sections for deeper expansion or stub display
    if (remainingDepth > 1) {
      const subSectionsResult = await deps.sectionQueryService.listSections(stub.directory);
      if (subSectionsResult.type === "ok") {
        const subStubs = subSectionsResult.value
          .filter(isNonEmpty)
          .map((s) => toRelativeStub(s, stub.directory.section.length));
        await expandStubs(
          subStubs,
          remainingDepth - 1,
          lines,
          deps,
          formatterOptions,
          formatItems,
          itemFilter,
          indentLevel + 1,
        );
      } else {
        console.error(
          `Warning: failed to query sub-sections for ${stub.relativePath}: ${subSectionsResult.error.message}`,
        );
      }
    } else if (stub.sectionCount > 0) {
      // Show sub-sections as stubs at depth boundary
      const subSectionsResult = await deps.sectionQueryService.listSections(stub.directory);
      if (subSectionsResult.type === "ok") {
        for (const s of subSectionsResult.value) {
          if (isNonEmpty(s)) {
            const relSection = s.directory.section.slice(stub.directory.section.length);
            const subStubSummary: SectionSummary = {
              directory: s.directory,
              itemCount: s.itemCount,
              sectionCount: s.sectionCount,
            };
            lines.push(
              childPrefix +
                formatSectionStub(subStubSummary, relSection.join("/") + "/", formatterOptions),
            );
          }
        }
      } else {
        console.error(
          `Warning: failed to query sub-sections for ${stub.relativePath}: ${subSectionsResult.error.message}`,
        );
      }
    }
  }
};
