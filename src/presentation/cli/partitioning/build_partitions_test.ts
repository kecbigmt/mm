import { assertEquals } from "jsr:@std/assert";
import { buildPartitions, formatWarning, type PartitionWarning } from "./build_partitions.ts";
import { type Item, parseItem } from "../../../domain/models/item.ts";
import { type CalendarDay, parseCalendarDay } from "../../../domain/primitives/calendar_day.ts";
import {
  createDateRange,
  createNumericRange,
  createSingleRange,
} from "../../../domain/primitives/placement_range.ts";
import { parsePlacement, type Placement } from "../../../domain/primitives/placement.ts";
import type { SectionSummary } from "../../../domain/services/section_query_service.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const makeItem = (
  overrides: Partial<{
    id: string;
    title: string;
    icon: string;
    status: string;
    placement: string;
    rank: string;
    createdAt: string;
    updatedAt: string;
    alias?: string;
  }>,
): Item => {
  const snapshot = {
    id: overrides.id ?? "019965a7-2789-740a-b8c1-1415904fd108",
    title: overrides.title ?? "Test item",
    icon: overrides.icon ?? "note",
    status: overrides.status ?? "open",
    placement: overrides.placement ?? "2025-02-10",
    rank: overrides.rank ?? "a",
    createdAt: overrides.createdAt ?? "2025-02-10T12:00:00Z",
    updatedAt: overrides.updatedAt ?? "2025-02-10T12:00:00Z",
    alias: overrides.alias,
  };
  return unwrapOk(parseItem(snapshot), "makeItem");
};

const makeCalendarDay = (iso: string): CalendarDay =>
  unwrapOk(parseCalendarDay(iso), `parseCalendarDay(${iso})`);

const makePlacement = (str: string): Placement =>
  unwrapOk(parsePlacement(str), `parsePlacement(${str})`);

const makeSectionSummary = (
  placement: string,
  itemCount: number,
  sectionCount: number,
): SectionSummary => ({
  placement: makePlacement(placement),
  itemCount,
  sectionCount,
});

// =============================================================================
// Single Placement Tests
// =============================================================================

Deno.test("buildPartitions: single date placement with items", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Item 1",
      placement: "2025-02-10",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Item 2",
      placement: "2025-02-10",
    }),
  ];
  const range = createSingleRange(makePlacement("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  assertEquals(result.partitions[0].header.kind, "date");
  if (result.partitions[0].header.kind === "date") {
    assertEquals(result.partitions[0].header.date.toString(), "2025-02-10");
  }
  assertEquals(result.partitions[0].items.length, 2);
  assertEquals(result.partitions[0].stubs.length, 0);
  assertEquals(result.warnings.length, 0);
});

Deno.test("buildPartitions: single placement with no items returns empty", () => {
  const items: Item[] = [];
  const range = createSingleRange(makePlacement("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 0);
  assertEquals(result.warnings.length, 0);
});

Deno.test("buildPartitions: single placement with section stubs", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Item 1",
      placement: "2025-02-10",
    }),
  ];
  const range = createSingleRange(makePlacement("2025-02-10"));
  const sections = [
    makeSectionSummary("2025-02-10/1", 3, 1),
    makeSectionSummary("2025-02-10/2", 0, 0), // Empty, should be omitted
    makeSectionSummary("2025-02-10/3", 5, 0),
  ];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  assertEquals(result.partitions[0].stubs.length, 2); // Only non-empty stubs
  assertEquals(result.partitions[0].stubs[0].relativePath, "1/");
  assertEquals(result.partitions[0].stubs[0].itemCount, 3);
  assertEquals(result.partitions[0].stubs[0].sectionCount, 1);
  assertEquals(result.partitions[0].stubs[1].relativePath, "3/");
  assertEquals(result.partitions[0].stubs[1].itemCount, 5);
});

Deno.test("buildPartitions: single placement skips item-head events", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Note 1",
      icon: "note",
      placement: "2025-02-10",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Event under item head",
      icon: "event",
      placement: "019965a7-9999-740a-b8c1-1415904fd108", // Item head
    }),
    makeItem({
      id: "019965a7-0003-740a-b8c1-1415904fd108",
      title: "Event under date head",
      icon: "event",
      placement: "2025-02-10",
    }),
  ];
  const range = createSingleRange(makePlacement("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  assertEquals(result.partitions[0].items.length, 2); // Note + date-head event
  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].kind, "itemHeadEventsSkipped");
  if (result.warnings[0].kind === "itemHeadEventsSkipped") {
    assertEquals(result.warnings[0].count, 1);
  }
});

// =============================================================================
// Date Range Tests
// =============================================================================

Deno.test("buildPartitions: date range groups by date descending", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Item on 10th",
      placement: "2025-02-10",
      rank: "a",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Item on 9th",
      placement: "2025-02-09",
      rank: "a",
    }),
    makeItem({
      id: "019965a7-0003-740a-b8c1-1415904fd108",
      title: "Another on 10th",
      placement: "2025-02-10",
      rank: "b",
    }),
  ];
  const range = createDateRange(makeCalendarDay("2025-02-09"), makeCalendarDay("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 2);
  // Newest first
  assertEquals(result.partitions[0].header.kind, "date");
  if (result.partitions[0].header.kind === "date") {
    assertEquals(result.partitions[0].header.date.toString(), "2025-02-10");
  }
  assertEquals(result.partitions[0].items.length, 2);
  if (result.partitions[1].header.kind === "date") {
    assertEquals(result.partitions[1].header.date.toString(), "2025-02-09");
  }
  assertEquals(result.partitions[1].items.length, 1);
});

Deno.test("buildPartitions: date range omits empty dates", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Item on 10th",
      placement: "2025-02-10",
    }),
    // No items on 2025-02-09
  ];
  const range = createDateRange(makeCalendarDay("2025-02-09"), makeCalendarDay("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  if (result.partitions[0].header.kind === "date") {
    assertEquals(result.partitions[0].header.date.toString(), "2025-02-10");
  }
});

Deno.test("buildPartitions: date range capped at limit", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Item",
      placement: "2025-02-10",
    }),
  ];
  const range = createDateRange(makeCalendarDay("2025-02-01"), makeCalendarDay("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections, limit: 5 });

  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].kind, "dateRangeCapped");
  if (result.warnings[0].kind === "dateRangeCapped") {
    assertEquals(result.warnings[0].requested, 10);
    assertEquals(result.warnings[0].limit, 5);
  }
});

Deno.test("buildPartitions: date range skips item-head events", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Note",
      icon: "note",
      placement: "2025-02-10",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Event under item",
      icon: "event",
      placement: "019965a7-9999-740a-b8c1-1415904fd108",
    }),
  ];
  const range = createDateRange(makeCalendarDay("2025-02-09"), makeCalendarDay("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].kind, "itemHeadEventsSkipped");
});

// =============================================================================
// Numeric Range Tests
// =============================================================================

Deno.test("buildPartitions: numeric range creates partitions per prefix", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Chapter 1 item",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/1",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Chapter 2 item",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/2",
    }),
    makeItem({
      id: "019965a7-0003-740a-b8c1-1415904fd108",
      title: "Another in chapter 1",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/1",
    }),
  ];
  const range = createNumericRange(parent, 1, 3);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 2); // Prefixes 1 and 2 have items, 3 is empty
  assertEquals(result.partitions[0].header.kind, "itemSection");
  if (result.partitions[0].header.kind === "itemSection") {
    assertEquals(result.partitions[0].header.sectionPrefix, 1);
    assertEquals(
      result.partitions[0].header.displayLabel,
      "019965a7-9999-740a-b8c1-1415904fd108/1",
    );
  }
  assertEquals(result.partitions[0].items.length, 2);
  if (result.partitions[1].header.kind === "itemSection") {
    assertEquals(result.partitions[1].header.sectionPrefix, 2);
  }
  assertEquals(result.partitions[1].items.length, 1);
});

Deno.test("buildPartitions: numeric range skips empty prefixes", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Chapter 2 item",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/2",
    }),
  ];
  const range = createNumericRange(parent, 1, 3);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  if (result.partitions[0].header.kind === "itemSection") {
    assertEquals(result.partitions[0].header.sectionPrefix, 2);
  }
});

Deno.test("buildPartitions: numeric range includes stubs from sections", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Chapter 1 item",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/1",
    }),
  ];
  const sections = [
    makeSectionSummary("019965a7-9999-740a-b8c1-1415904fd108/1/1", 2, 0),
    makeSectionSummary("019965a7-9999-740a-b8c1-1415904fd108/1/2", 0, 1),
  ];
  const range = createNumericRange(parent, 1, 2);

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  assertEquals(result.partitions[0].stubs.length, 2);
  assertEquals(result.partitions[0].stubs[0].relativePath, "1/");
  assertEquals(result.partitions[0].stubs[0].itemCount, 2);
  assertEquals(result.partitions[0].stubs[1].relativePath, "2/");
  assertEquals(result.partitions[0].stubs[1].sectionCount, 1);
});

Deno.test("buildPartitions: numeric range capped at limit", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Chapter 1",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/1",
    }),
  ];
  const range = createNumericRange(parent, 1, 150);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections, limit: 100 });

  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].kind, "sectionRangeCapped");
  if (result.warnings[0].kind === "sectionRangeCapped") {
    assertEquals(result.warnings[0].requested, 150);
    assertEquals(result.warnings[0].limit, 100);
  }
});

Deno.test("buildPartitions: numeric range with custom display label", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Chapter 1",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/1",
    }),
  ];
  const range = createNumericRange(parent, 1, 2);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({
    items,
    range,
    sections,
    getDisplayLabel: (_parent, prefix) => `my-book/${prefix}`,
  });

  assertEquals(result.partitions.length, 1);
  if (result.partitions[0].header.kind === "itemSection") {
    assertEquals(result.partitions[0].header.displayLabel, "my-book/1");
  }
});

Deno.test("buildPartitions: numeric range under date head", () => {
  const parent = makePlacement("2025-02-10");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Section 1 item",
      placement: "2025-02-10/1",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Section 2 item",
      placement: "2025-02-10/2",
    }),
  ];
  const range = createNumericRange(parent, 1, 3);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 2);
  if (result.partitions[0].header.kind === "itemSection") {
    assertEquals(result.partitions[0].header.displayLabel, "2025-02-10/1");
  }
});

// =============================================================================
// Warning Formatting Tests
// =============================================================================

Deno.test("formatWarning: sectionRangeCapped", () => {
  const warning: PartitionWarning = { kind: "sectionRangeCapped", requested: 250, limit: 100 };
  assertEquals(
    formatWarning(warning),
    "warning: section range capped at 100 prefixes (requested 250)",
  );
});

Deno.test("formatWarning: dateRangeCapped", () => {
  const warning: PartitionWarning = { kind: "dateRangeCapped", requested: 180, limit: 100 };
  assertEquals(
    formatWarning(warning),
    "warning: date range capped at 100 days (requested 180)",
  );
});

Deno.test("formatWarning: itemHeadEventsSkipped", () => {
  const warning: PartitionWarning = { kind: "itemHeadEventsSkipped", count: 2 };
  assertEquals(
    formatWarning(warning),
    "warning: skipped 2 event(s) not under a date head",
  );
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("buildPartitions: handles mixed item-head events across ranges", () => {
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Date note",
      icon: "note",
      placement: "2025-02-10",
    }),
    makeItem({
      id: "019965a7-0002-740a-b8c1-1415904fd108",
      title: "Date event",
      icon: "event",
      placement: "2025-02-10",
    }),
    makeItem({
      id: "019965a7-0003-740a-b8c1-1415904fd108",
      title: "Item-head event 1",
      icon: "event",
      placement: "019965a7-9999-740a-b8c1-1415904fd108",
    }),
    makeItem({
      id: "019965a7-0004-740a-b8c1-1415904fd108",
      title: "Item-head event 2",
      icon: "event",
      placement: "019965a7-8888-740a-b8c1-1415904fd108/1",
    }),
  ];
  const range = createSingleRange(makePlacement("2025-02-10"));
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions[0].items.length, 2); // note + date event
  assertEquals(result.warnings.length, 1);
  if (result.warnings[0].kind === "itemHeadEventsSkipped") {
    assertEquals(result.warnings[0].count, 2);
  }
});

Deno.test("buildPartitions: stubs only partition (no items)", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items: Item[] = [];
  const sections = [
    makeSectionSummary("019965a7-9999-740a-b8c1-1415904fd108/1/1", 5, 2),
  ];
  const range = createNumericRange(parent, 1, 2);

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  assertEquals(result.partitions[0].items.length, 0);
  assertEquals(result.partitions[0].stubs.length, 1);
});

Deno.test("buildPartitions: single item-head placement", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Sub item",
      placement: "019965a7-9999-740a-b8c1-1415904fd108",
    }),
  ];
  const range = createSingleRange(parent);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  assertEquals(result.partitions[0].header.kind, "itemSection");
  if (result.partitions[0].header.kind === "itemSection") {
    assertEquals(result.partitions[0].header.displayLabel, "019965a7-9999-740a-b8c1-1415904fd108");
    assertEquals(result.partitions[0].header.sectionPrefix, 0);
  }
});

Deno.test("buildPartitions: single item-head placement with section", () => {
  const parent = makePlacement("019965a7-9999-740a-b8c1-1415904fd108/1/2");
  const items = [
    makeItem({
      id: "019965a7-0001-740a-b8c1-1415904fd108",
      title: "Deep item",
      placement: "019965a7-9999-740a-b8c1-1415904fd108/1/2",
    }),
  ];
  const range = createSingleRange(parent);
  const sections: SectionSummary[] = [];

  const result = buildPartitions({ items, range, sections });

  assertEquals(result.partitions.length, 1);
  if (result.partitions[0].header.kind === "itemSection") {
    assertEquals(
      result.partitions[0].header.displayLabel,
      "019965a7-9999-740a-b8c1-1415904fd108/1/2",
    );
    assertEquals(result.partitions[0].header.sectionPrefix, 2);
  }
});
