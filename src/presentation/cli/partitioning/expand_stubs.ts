import type { Item } from "../../../domain/models/item.ts";
import type { ItemRepository } from "../../../domain/repositories/item_repository.ts";
import type {
  SectionQueryService,
  SectionSummary,
} from "../../../domain/services/section_query_service.ts";
import { createSingleRange } from "../../../domain/primitives/directory_range.ts";
import { createDirectory } from "../../../domain/primitives/directory.ts";
import type { ItemId } from "../../../domain/primitives/item_id.ts";
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
      const sectionItems = sectionItemsResult.value
        .filter(itemFilter)
        .filter((item) =>
          stub.directory.head.kind !== "item" || item.data.icon.toString() !== "event"
        );
      // Format each item and immediately expand its children
      for (const item of sectionItems) {
        const itemLines: string[] = [];
        formatItems([item], itemLines);
        for (const line of itemLines) {
          lines.push(childPrefix + line);
        }
        await expandItemChildren(
          item.data.id,
          remainingDepth - 1,
          lines,
          deps,
          formatterOptions,
          formatItems,
          itemFilter,
          indentLevel + 2,
        );
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

/**
 * Expand child items of a given item recursively up to a given depth.
 *
 * Queries items whose directory head is the given item ID (item-to-item nesting),
 * formats them, then recurses into each child. Also expands sections under
 * the item-head directory.
 *
 * @param indentLevel - Current nesting level for indentation
 */
export const expandItemChildren = async (
  itemId: ItemId,
  remainingDepth: number,
  lines: string[],
  deps: ExpandStubsDeps,
  formatterOptions: ListFormatterOptions,
  formatItems: FormatItemsFn,
  itemFilter: ItemFilterFn,
  indentLevel: number,
): Promise<void> => {
  if (remainingDepth <= 0) return;

  const prefix = indent(indentLevel);
  const itemHeadDir = createDirectory({ kind: "item", id: itemId }, []);
  const childRange = createSingleRange(itemHeadDir);

  // Query child items under this item's directory
  const childItemsResult = await deps.itemRepository.listByDirectory(childRange);
  if (childItemsResult.type === "ok") {
    const childItems = childItemsResult.value
      .filter(itemFilter)
      .filter((item) => item.data.icon.toString() !== "event");
    // Format each child and immediately expand its descendants
    for (const child of childItems) {
      const itemLines: string[] = [];
      formatItems([child], itemLines);
      for (const line of itemLines) {
        lines.push(prefix + line);
      }
      await expandItemChildren(
        child.data.id,
        remainingDepth - 1,
        lines,
        deps,
        formatterOptions,
        formatItems,
        itemFilter,
        indentLevel + 1,
      );
    }
  } else {
    console.error(
      `Warning: failed to load child items for ${itemId.toString()}: ${childItemsResult.error.message}`,
    );
  }

  // Query and expand sections under this item-head directory
  const sectionsResult = await deps.sectionQueryService.listSections(itemHeadDir);
  if (sectionsResult.type === "ok") {
    const sectionStubs = sectionsResult.value
      .filter(isNonEmpty)
      .map((s) => toRelativeStub(s, 0));
    await expandStubs(
      sectionStubs,
      remainingDepth - 1,
      lines,
      deps,
      formatterOptions,
      formatItems,
      itemFilter,
      indentLevel,
    );
  } else {
    console.error(
      `Warning: failed to query sections for ${itemId.toString()}: ${sectionsResult.error.message}`,
    );
  }
};
