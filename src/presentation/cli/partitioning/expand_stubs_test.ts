import { assertEquals } from "@std/assert";
import {
  expandStubs,
  type ExpandStubsDeps,
  type FormatItemsFn,
  type StatusFilterFn,
} from "./expand_stubs.ts";
import type { SectionStub } from "./build_partitions.ts";
import type { ListFormatterOptions } from "../formatters/list_formatter.ts";
import type { Item } from "../../../domain/models/item.ts";
import { parseItem } from "../../../domain/models/item.ts";
import { parsePlacement, type Placement } from "../../../domain/primitives/placement.ts";
import { type DateTime, parseDateTime } from "../../../domain/primitives/date_time.ts";
import {
  parseTimezoneIdentifier,
  type TimezoneIdentifier,
} from "../../../domain/primitives/timezone_identifier.ts";
import type { SectionSummary } from "../../../domain/services/section_query_service.ts";
import { Result } from "../../../shared/result.ts";

const unwrap = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") throw new Error(`Unexpected error: ${JSON.stringify(result.error)}`);
  return result.value;
};

const makeTimezone = (): TimezoneIdentifier => unwrap(parseTimezoneIdentifier("UTC"));
const makeDateTime = (): DateTime => unwrap(parseDateTime("2025-02-10T12:00:00Z"));
const makePlacement = (s: string): Placement => unwrap(parsePlacement(s));

const makeItem = (id: string, placement: string, title: string, status = "open"): Item =>
  unwrap(parseItem({
    id,
    title,
    icon: "note",
    status,
    placement,
    rank: "a",
    createdAt: "2025-02-10T12:00:00Z",
    updatedAt: "2025-02-10T12:00:00Z",
  }));

const makeOptions = (): ListFormatterOptions => ({
  printMode: true,
  timezone: makeTimezone(),
  now: makeDateTime(),
});

const PARENT_ID = "019965a7-9999-740a-b8c1-1415904fd108";

/**
 * Build mock deps that return specified items and sections per placement.
 */
const makeDeps = (
  itemsByPlacement: Map<string, ReadonlyArray<Item>>,
  sectionsByPlacement: Map<string, ReadonlyArray<SectionSummary>>,
): ExpandStubsDeps => ({
  itemRepository: {
    load: () => Promise.resolve(Result.ok(undefined)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByPlacement: (range) => {
      const key = range.kind === "single"
        ? `${range.at.head.kind === "item" ? range.at.head.id.toString() : ""}/${
          range.at.section.join("/")
        }`
        : "";
      const items = itemsByPlacement.get(key) ?? [];
      return Promise.resolve(Result.ok(items));
    },
  },
  sectionQueryService: {
    listSections: (parent) => {
      const key = `${parent.head.kind === "item" ? parent.head.id.toString() : ""}/${
        parent.section.join("/")
      }`;
      const sections = sectionsByPlacement.get(key) ?? [];
      return Promise.resolve(Result.ok(sections));
    },
  },
});

const collectTitles: FormatItemsFn = (items, lines) => {
  for (const item of items) {
    lines.push(`item:${item.data.title.toString()}`);
  }
};

const acceptAll: StatusFilterFn = () => true;
const openOnly: StatusFilterFn = (item) => !item.data.status.isClosed();

// =============================================================================
// Depth 0: stubs rendered as summary lines
// =============================================================================

Deno.test("expandStubs: depth 0 renders stubs without expansion", async () => {
  const stubs: SectionStub[] = [{
    placement: makePlacement(`${PARENT_ID}/1`),
    relativePath: "1/",
    itemCount: 3,
    sectionCount: 1,
  }];
  const lines: string[] = [];
  const deps = makeDeps(new Map(), new Map());

  await expandStubs(stubs, 0, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 1);
  // No indentation at indentLevel 0
  assertEquals(lines[0], "1/ (items: 3, sections: 1)");
});

// =============================================================================
// Depth 1: stubs expanded with items
// =============================================================================

Deno.test("expandStubs: depth 1 expands stubs into header + items", async () => {
  const sectionPlacement = makePlacement(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    placement: sectionPlacement,
    relativePath: "1/",
    itemCount: 2,
    sectionCount: 0,
  }];

  const item1 = makeItem("019965a7-0001-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Note A");
  const item2 = makeItem("019965a7-0002-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Note B");

  const itemsByPlacement = new Map([
    [`${PARENT_ID}/1`, [item1, item2]],
  ]);
  const deps = makeDeps(itemsByPlacement, new Map());
  const lines: string[] = [];

  await expandStubs(stubs, 1, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 3);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "\t\titem:Note A");
  assertEquals(lines[2], "\t\titem:Note B");
});

// =============================================================================
// Status filtering during expansion
// =============================================================================

Deno.test("expandStubs: respects status filter", async () => {
  const sectionPlacement = makePlacement(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    placement: sectionPlacement,
    relativePath: "1/",
    itemCount: 2,
    sectionCount: 0,
  }];

  const openItem = makeItem("019965a7-0001-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Open note");
  const closedItem = makeItem(
    "019965a7-0002-740a-b8c1-1415904fd108",
    `${PARENT_ID}/1`,
    "Closed note",
    "closed",
  );

  const itemsByPlacement = new Map([
    [`${PARENT_ID}/1`, [openItem, closedItem]],
  ]);
  const deps = makeDeps(itemsByPlacement, new Map());
  const lines: string[] = [];

  await expandStubs(stubs, 1, lines, deps, makeOptions(), collectTitles, openOnly);

  assertEquals(lines.length, 2);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "\t\titem:Open note");
});

// =============================================================================
// Depth boundary: sub-sections rendered as stubs
// =============================================================================

Deno.test("expandStubs: depth 1 renders sub-sections as stubs at boundary", async () => {
  const sectionPlacement = makePlacement(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    placement: sectionPlacement,
    relativePath: "1/",
    itemCount: 1,
    sectionCount: 2,
  }];

  const item = makeItem("019965a7-0001-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Note");

  const subSection1: SectionSummary = {
    placement: makePlacement(`${PARENT_ID}/1/1`),
    itemCount: 3,
    sectionCount: 0,
  };
  const subSection2: SectionSummary = {
    placement: makePlacement(`${PARENT_ID}/1/2`),
    itemCount: 0,
    sectionCount: 0, // Empty, should be excluded
  };
  const subSection3: SectionSummary = {
    placement: makePlacement(`${PARENT_ID}/1/3`),
    itemCount: 1,
    sectionCount: 1,
  };

  const itemsByPlacement = new Map([
    [`${PARENT_ID}/1`, [item]],
  ]);
  const sectionsByPlacement = new Map([
    [`${PARENT_ID}/1`, [subSection1, subSection2, subSection3]],
  ]);
  const deps = makeDeps(itemsByPlacement, sectionsByPlacement);
  const lines: string[] = [];

  await expandStubs(stubs, 1, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 4);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "\t\titem:Note");
  assertEquals(lines[2], "\t\t1/ (items: 3, sections: 0)");
  assertEquals(lines[3], "\t\t3/ (items: 1, sections: 1)");
});

// =============================================================================
// Depth 2: recursive expansion
// =============================================================================

Deno.test("expandStubs: depth 2 recursively expands sub-sections", async () => {
  const sectionPlacement = makePlacement(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    placement: sectionPlacement,
    relativePath: "1/",
    itemCount: 0,
    sectionCount: 1,
  }];

  const subSection: SectionSummary = {
    placement: makePlacement(`${PARENT_ID}/1/1`),
    itemCount: 1,
    sectionCount: 0,
  };

  const deepItem = makeItem(
    "019965a7-0003-740a-b8c1-1415904fd108",
    `${PARENT_ID}/1/1`,
    "Deep note",
  );

  const itemsByPlacement = new Map([
    [`${PARENT_ID}/1`, []],
    [`${PARENT_ID}/1/1`, [deepItem]],
  ]);
  const sectionsByPlacement = new Map([
    [`${PARENT_ID}/1`, [subSection]],
  ]);
  const deps = makeDeps(itemsByPlacement, sectionsByPlacement);
  const lines: string[] = [];

  await expandStubs(stubs, 2, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 3);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "\t\t1/");
  assertEquals(lines[2], "\t\t\t\titem:Deep note");
});
