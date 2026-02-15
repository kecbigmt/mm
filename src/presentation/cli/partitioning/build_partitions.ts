import type { Item } from "../../../domain/models/item.ts";
import type { PlacementRange } from "../../../domain/primitives/placement_range.ts";
import type { SectionSummary } from "../../../domain/services/section_query_service.ts";
import { type CalendarDay, parseCalendarDay } from "../../../domain/primitives/calendar_day.ts";
import { createPlacement, type Placement } from "../../../domain/primitives/placement.ts";
import { profileSync } from "../../../shared/profiler.ts";

/**
 * Partition header for grouping items in ls output.
 *
 * - date: A date partition (e.g., [2025-02-10] today)
 * - itemSection: A section under an item head (e.g., [some-book/1])
 */
export type PartitionHeader =
  | Readonly<{ readonly kind: "date"; readonly date: CalendarDay }>
  | Readonly<{
    readonly kind: "itemSection";
    readonly parent: Placement;
    readonly sectionPrefix: number;
    readonly displayLabel: string;
  }>;

/**
 * A stub line representing a nested section with summary counts.
 */
export type SectionStub = Readonly<{
  readonly placement: Placement;
  readonly relativePath: string;
  readonly itemCount: number;
  readonly sectionCount: number;
}>;

/**
 * A partition contains items under a common header (date or section prefix).
 */
export type Partition = Readonly<{
  readonly header: PartitionHeader;
  readonly items: ReadonlyArray<Item>;
  readonly stubs: ReadonlyArray<SectionStub>;
}>;

/**
 * Warnings emitted during partitioning.
 */
export type PartitionWarning =
  | Readonly<
    { readonly kind: "sectionRangeCapped"; readonly requested: number; readonly limit: number }
  >
  | Readonly<
    { readonly kind: "dateRangeCapped"; readonly requested: number; readonly limit: number }
  >
  | Readonly<{ readonly kind: "itemHeadEventsSkipped"; readonly count: number }>;

/**
 * Result of partition building.
 */
export type PartitionResult = Readonly<{
  readonly partitions: ReadonlyArray<Partition>;
  readonly warnings: ReadonlyArray<PartitionWarning>;
}>;

/**
 * Input parameters for building partitions.
 */
export type BuildPartitionsInput = Readonly<{
  readonly items: ReadonlyArray<Item>;
  readonly range: PlacementRange;
  readonly sections: ReadonlyArray<SectionSummary>;
  readonly limit?: number;
  readonly getDisplayLabel?: (parent: Placement, sectionPrefix: number) => string;
}>;

const DEFAULT_LIMIT = 100;

/**
 * Compute expected day count for a date range (inclusive).
 */
const computeDateRangeSize = (from: CalendarDay, to: CalendarDay): number => {
  const fromDate = from.toDate();
  const toDate = to.toDate();
  const diffMs = toDate.getTime() - fromDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

/**
 * Generate all dates in a date range (from..to inclusive), capped at limit.
 * Returns dates in descending order (newest first).
 */
const generateDateRange = (
  from: CalendarDay,
  to: CalendarDay,
  limit: number,
): { dates: CalendarDay[]; capped: boolean; requested: number } => {
  const requested = computeDateRangeSize(from, to);
  const capped = requested > limit;

  const dates: CalendarDay[] = [];
  const toDate = to.toDate();
  const fromDate = from.toDate();

  // Start from 'to' and work backwards (newest first)
  // Use UTC dates to avoid DST issues
  let current = toDate;
  while (current >= fromDate && dates.length < limit) {
    const iso = current.toISOString().slice(0, 10);
    const dayResult = parseCalendarDay(iso);
    if (dayResult.type === "ok") {
      dates.push(dayResult.value);
    }
    // Use setUTCDate to correctly decrement by one day in UTC
    const prev = new Date(current);
    prev.setUTCDate(current.getUTCDate() - 1);
    current = prev;
  }

  return { dates, capped, requested };
};

/**
 * Check if an item is an event placed under an item head (not a date head).
 */
const isItemHeadEvent = (item: Item): boolean => {
  return (
    item.data.icon.toString() === "event" && item.data.placement.head.kind === "item"
  );
};

/**
 * Build partitions for a single placement (no grouping needed).
 */
const buildSinglePartition = (
  items: ReadonlyArray<Item>,
  at: Placement,
  sections: ReadonlyArray<SectionSummary>,
  getDisplayLabel?: (parent: Placement, sectionPrefix: number) => string,
): PartitionResult => {
  const warnings: PartitionWarning[] = [];

  // Filter out item-head events and count them
  const filteredItems: Item[] = [];
  let skippedEventCount = 0;

  for (const item of items) {
    if (isItemHeadEvent(item)) {
      skippedEventCount++;
    } else {
      filteredItems.push(item);
    }
  }

  if (skippedEventCount > 0) {
    warnings.push({ kind: "itemHeadEventsSkipped", count: skippedEventCount });
  }

  // Generate stubs from sections (only non-empty ones)
  const stubs: SectionStub[] = sections
    .filter((s) => s.itemCount > 0 || s.sectionCount > 0)
    .map((s) => ({
      placement: s.placement,
      relativePath: s.placement.section.join("/") + "/",
      itemCount: s.itemCount,
      sectionCount: s.sectionCount,
    }));

  if (filteredItems.length === 0 && stubs.length === 0) {
    return { partitions: [], warnings };
  }

  // Determine header based on placement head
  let header: PartitionHeader;
  if (at.head.kind === "date") {
    header = { kind: "date", date: at.head.date };
  } else {
    // Item or permanent head with optional section - use getDisplayLabel if available
    const sectionPrefix = at.section.length > 0 ? at.section[at.section.length - 1] : 0;
    const parent = at.section.length > 0
      ? createPlacement(at.head, at.section.slice(0, -1))
      : createPlacement(at.head, []);
    const headStr = at.head.kind === "item" ? at.head.id.toString() : "permanent";
    const displayLabel = getDisplayLabel
      ? getDisplayLabel(parent, sectionPrefix)
      : at.section.length > 0
      ? `${headStr}/${at.section.join("/")}`
      : headStr;
    header = {
      kind: "itemSection",
      parent: at,
      sectionPrefix,
      displayLabel,
    };
  }

  return {
    partitions: [{ header, items: filteredItems, stubs }],
    warnings,
  };
};

/**
 * Build partitions for a date range.
 */
const buildDateRangePartitions = (
  items: ReadonlyArray<Item>,
  from: CalendarDay,
  to: CalendarDay,
  limit: number,
): PartitionResult => {
  const warnings: PartitionWarning[] = [];

  // Filter out item-head events
  const { filteredItems, skippedEventCount } = profileSync("partition:filterEvents", () => {
    const filtered: Item[] = [];
    let skipped = 0;
    for (const item of items) {
      if (isItemHeadEvent(item)) {
        skipped++;
      } else {
        filtered.push(item);
      }
    }
    return { filteredItems: filtered, skippedEventCount: skipped };
  });

  if (skippedEventCount > 0) {
    warnings.push({ kind: "itemHeadEventsSkipped", count: skippedEventCount });
  }

  // Generate date range with cap
  const { dates, capped, requested } = profileSync(
    "partition:generateDateRange",
    () => generateDateRange(from, to, limit),
  );
  if (capped) {
    warnings.push({ kind: "dateRangeCapped", requested, limit });
  }

  // Group items by their placement head date
  const itemsByDate = profileSync("partition:groupByDate", () => {
    const map = new Map<string, Item[]>();
    for (const item of filteredItems) {
      if (item.data.placement.head.kind === "date") {
        const dateStr = item.data.placement.head.date.toString();
        const existing = map.get(dateStr) ?? [];
        existing.push(item);
        map.set(dateStr, existing);
      }
    }
    return map;
  });

  // Build partitions (only for dates with items)
  const partitions = profileSync("partition:buildPartitions", () => {
    const result: Partition[] = [];
    for (const date of dates) {
      const dateStr = date.toString();
      const dateItems = itemsByDate.get(dateStr);
      if (dateItems && dateItems.length > 0) {
        result.push({
          header: { kind: "date", date },
          items: dateItems,
          stubs: [],
        });
      }
    }
    return result;
  });

  return { partitions, warnings };
};

/**
 * Build partitions for a numeric range under a parent placement.
 */
const buildNumericRangePartitions = (
  items: ReadonlyArray<Item>,
  parent: Placement,
  from: number,
  to: number,
  sections: ReadonlyArray<SectionSummary>,
  limit: number,
  getDisplayLabel?: (parent: Placement, sectionPrefix: number) => string,
): PartitionResult => {
  const warnings: PartitionWarning[] = [];

  // Filter out item-head events
  const filteredItems: Item[] = [];
  let skippedEventCount = 0;

  for (const item of items) {
    if (isItemHeadEvent(item)) {
      skippedEventCount++;
    } else {
      filteredItems.push(item);
    }
  }

  if (skippedEventCount > 0) {
    warnings.push({ kind: "itemHeadEventsSkipped", count: skippedEventCount });
  }

  // Check section range cap
  const requestedPrefixes = to - from + 1;
  const cappedTo = requestedPrefixes > limit ? from + limit - 1 : to;
  if (requestedPrefixes > limit) {
    warnings.push({ kind: "sectionRangeCapped", requested: requestedPrefixes, limit });
  }

  // Group items by their section prefix (first segment after parent)
  const itemsByPrefix = new Map<number, Item[]>();
  for (const item of filteredItems) {
    const placement = item.data.placement;

    // Check if this item is directly under the parent
    if (!placementMatchesParent(placement, parent)) {
      continue;
    }

    // Get the section prefix (next segment after parent's section)
    const parentSectionLen = parent.section.length;
    if (placement.section.length > parentSectionLen) {
      const prefix = placement.section[parentSectionLen];
      if (prefix >= from && prefix <= cappedTo) {
        const existing = itemsByPrefix.get(prefix) ?? [];
        existing.push(item);
        itemsByPrefix.set(prefix, existing);
      }
    }
  }

  // Group sections by their prefix
  const sectionsByPrefix = new Map<number, SectionSummary[]>();
  for (const section of sections) {
    const sectionPlacement = section.placement;
    const parentSectionLen = parent.section.length;
    if (sectionPlacement.section.length > parentSectionLen) {
      const prefix = sectionPlacement.section[parentSectionLen];
      if (prefix >= from && prefix <= cappedTo) {
        const existing = sectionsByPrefix.get(prefix) ?? [];
        existing.push(section);
        sectionsByPrefix.set(prefix, existing);
      }
    }
  }

  // Build partitions for each prefix in range (skip empty ones)
  const partitions: Partition[] = [];
  for (let prefix = from; prefix <= cappedTo; prefix++) {
    const prefixItems = itemsByPrefix.get(prefix) ?? [];
    const prefixSections = sectionsByPrefix.get(prefix) ?? [];

    // Generate stubs from sections (only non-empty ones)
    const stubs: SectionStub[] = prefixSections
      .filter((s) => s.itemCount > 0 || s.sectionCount > 0)
      .map((s) => {
        // Relative path from the prefix level
        const relativeSection = s.placement.section.slice(parent.section.length + 1);
        return {
          placement: s.placement,
          relativePath: relativeSection.join("/") + "/",
          itemCount: s.itemCount,
          sectionCount: s.sectionCount,
        };
      });

    // Skip empty prefixes
    if (prefixItems.length === 0 && stubs.length === 0) {
      continue;
    }

    // Build display label
    const displayLabel = getDisplayLabel
      ? getDisplayLabel(parent, prefix)
      : buildDefaultDisplayLabel(parent, prefix);

    partitions.push({
      header: {
        kind: "itemSection",
        parent,
        sectionPrefix: prefix,
        displayLabel,
      },
      items: prefixItems,
      stubs,
    });
  }

  return { partitions, warnings };
};

/**
 * Check if a placement's head matches the parent's head.
 */
const placementMatchesParent = (placement: Placement, parent: Placement): boolean => {
  if (placement.head.kind !== parent.head.kind) {
    return false;
  }

  if (placement.head.kind === "date" && parent.head.kind === "date") {
    return placement.head.date.equals(parent.head.date);
  }

  if (placement.head.kind === "item" && parent.head.kind === "item") {
    return placement.head.id.toString() === parent.head.id.toString();
  }

  if (placement.head.kind === "permanent" && parent.head.kind === "permanent") {
    return true; // Both are permanent, they match
  }

  return false;
};

/**
 * Build default display label for item section partition.
 */
const buildDefaultDisplayLabel = (parent: Placement, sectionPrefix: number): string => {
  let headStr: string;
  switch (parent.head.kind) {
    case "date":
      headStr = parent.head.date.toString();
      break;
    case "item":
      headStr = parent.head.id.toString();
      break;
    case "permanent":
      headStr = "permanent";
      break;
  }

  if (parent.section.length === 0) {
    return `${headStr}/${sectionPrefix}`;
  }

  return `${headStr}/${parent.section.join("/")}/${sectionPrefix}`;
};

/**
 * Build partitions from sorted items based on the placement range.
 *
 * This is a pure function that groups items into display partitions for `mm ls`.
 * It applies range expansion limits, skips empty prefixes, generates section stubs,
 * omits item-head events (with warning), and returns a DTO with warnings.
 *
 * @param input - Items (already filtered and sorted), range, sections, and optional limit
 * @returns Partitions and warnings
 */
export const buildPartitions = (input: BuildPartitionsInput): PartitionResult => {
  const { items, range, sections, limit = DEFAULT_LIMIT, getDisplayLabel } = input;

  switch (range.kind) {
    case "single":
      return buildSinglePartition(items, range.at, sections, getDisplayLabel);

    case "dateRange":
      return buildDateRangePartitions(items, range.from, range.to, limit);

    case "numericRange":
      return buildNumericRangePartitions(
        items,
        range.parent,
        range.from,
        range.to,
        sections,
        limit,
        getDisplayLabel,
      );
  }
};

/**
 * Format a warning for stderr output.
 */
export const formatWarning = (warning: PartitionWarning): string => {
  switch (warning.kind) {
    case "sectionRangeCapped":
      return `warning: section range capped at ${warning.limit} prefixes (requested ${warning.requested})`;
    case "dateRangeCapped":
      return `warning: date range capped at ${warning.limit} days (requested ${warning.requested})`;
    case "itemHeadEventsSkipped":
      return `warning: skipped ${warning.count} event(s) not under a date head`;
  }
};
