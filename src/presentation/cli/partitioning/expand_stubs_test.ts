import { assertEquals } from "@std/assert";
import {
  expandItemChildren,
  expandStubs,
  type ExpandStubsDeps,
  type FormatItemsFn,
  type ItemFilterFn,
} from "./expand_stubs.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import type { SectionStub } from "./build_partitions.ts";
import type { ListFormatterOptions } from "../formatters/list_formatter.ts";
import type { Item } from "../../../domain/models/item.ts";
import { parseItem } from "../../../domain/models/item.ts";
import { type Directory, parseDirectory } from "../../../domain/primitives/directory.ts";
import { type DateTime, parseDateTime } from "../../../domain/primitives/date_time.ts";
import {
  parseTimezoneIdentifier,
  type TimezoneIdentifier,
} from "../../../domain/primitives/timezone_identifier.ts";
import type { SectionSummary } from "../../../domain/services/section_query_service.ts";
import { Result } from "../../../shared/result.ts";
import { createRepositoryError } from "../../../domain/repositories/repository_error.ts";

const unwrap = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") throw new Error(`Unexpected error: ${JSON.stringify(result.error)}`);
  return result.value;
};

const makeTimezone = (): TimezoneIdentifier => unwrap(parseTimezoneIdentifier("UTC"));
const makeDateTime = (): DateTime => unwrap(parseDateTime("2025-02-10T12:00:00Z"));
const makeDirectory = (s: string): Directory => unwrap(parseDirectory(s));

const makeItem = (id: string, directory: string, title: string, status = "open"): Item =>
  unwrap(parseItem({
    id,
    title,
    icon: "note",
    status,
    directory,
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
 * Build mock deps that return specified items and sections per directory.
 */
const makeDeps = (
  itemsByDirectory: Map<string, ReadonlyArray<Item>>,
  sectionsByDirectory: Map<string, ReadonlyArray<SectionSummary>>,
): ExpandStubsDeps => ({
  itemRepository: {
    load: () => Promise.resolve(Result.ok(undefined)),
    save: () => Promise.resolve(Result.ok(undefined)),
    delete: () => Promise.resolve(Result.ok(undefined)),
    listByDirectory: (range) => {
      const key = range.kind === "single"
        ? `${range.at.head.kind === "item" ? range.at.head.id.toString() : ""}/${
          range.at.section.join("/")
        }`
        : "";
      const items = itemsByDirectory.get(key) ?? [];
      return Promise.resolve(Result.ok(items));
    },
  },
  sectionQueryService: {
    listSections: (parent) => {
      const key = `${parent.head.kind === "item" ? parent.head.id.toString() : ""}/${
        parent.section.join("/")
      }`;
      const sections = sectionsByDirectory.get(key) ?? [];
      return Promise.resolve(Result.ok(sections));
    },
  },
});

const collectTitles: FormatItemsFn = (items, lines) => {
  for (const item of items) {
    lines.push(`item:${item.data.title.toString()}`);
  }
};

const acceptAll: ItemFilterFn = () => true;
const openOnly: ItemFilterFn = (item) => !item.data.status.isClosed();

// =============================================================================
// Depth 0: stubs rendered as summary lines
// =============================================================================

Deno.test("expandStubs: depth 0 renders stubs without expansion", async () => {
  const stubs: SectionStub[] = [{
    directory: makeDirectory(`${PARENT_ID}/1`),
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
  const sectionDirectory = makeDirectory(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    directory: sectionDirectory,
    relativePath: "1/",
    itemCount: 2,
    sectionCount: 0,
  }];

  const item1 = makeItem("019965a7-0001-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Note A");
  const item2 = makeItem("019965a7-0002-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Note B");

  const itemsByDirectory = new Map([
    [`${PARENT_ID}/1`, [item1, item2]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandStubs(stubs, 1, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 3);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "  item:Note A");
  assertEquals(lines[2], "  item:Note B");
});

// =============================================================================
// Status filtering during expansion
// =============================================================================

Deno.test("expandStubs: respects status filter", async () => {
  const sectionDirectory = makeDirectory(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    directory: sectionDirectory,
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

  const itemsByDirectory = new Map([
    [`${PARENT_ID}/1`, [openItem, closedItem]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandStubs(stubs, 1, lines, deps, makeOptions(), collectTitles, openOnly);

  assertEquals(lines.length, 2);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "  item:Open note");
});

// =============================================================================
// Depth boundary: sub-sections rendered as stubs
// =============================================================================

Deno.test("expandStubs: depth 1 renders sub-sections as stubs at boundary", async () => {
  const sectionDirectory = makeDirectory(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    directory: sectionDirectory,
    relativePath: "1/",
    itemCount: 1,
    sectionCount: 2,
  }];

  const item = makeItem("019965a7-0001-740a-b8c1-1415904fd108", `${PARENT_ID}/1`, "Note");

  const subSection1: SectionSummary = {
    directory: makeDirectory(`${PARENT_ID}/1/1`),
    itemCount: 3,
    sectionCount: 0,
  };
  const subSection2: SectionSummary = {
    directory: makeDirectory(`${PARENT_ID}/1/2`),
    itemCount: 0,
    sectionCount: 0, // Empty, should be excluded
  };
  const subSection3: SectionSummary = {
    directory: makeDirectory(`${PARENT_ID}/1/3`),
    itemCount: 1,
    sectionCount: 1,
  };

  const itemsByDirectory = new Map([
    [`${PARENT_ID}/1`, [item]],
  ]);
  const sectionsByDirectory = new Map([
    [`${PARENT_ID}/1`, [subSection1, subSection2, subSection3]],
  ]);
  const deps = makeDeps(itemsByDirectory, sectionsByDirectory);
  const lines: string[] = [];

  await expandStubs(stubs, 1, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 4);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "  item:Note");
  assertEquals(lines[2], "  1/ (items: 3, sections: 0)");
  assertEquals(lines[3], "  3/ (items: 1, sections: 1)");
});

// =============================================================================
// Depth 2: recursive expansion
// =============================================================================

Deno.test("expandStubs: depth 2 recursively expands sub-sections", async () => {
  const sectionDirectory = makeDirectory(`${PARENT_ID}/1`);
  const stubs: SectionStub[] = [{
    directory: sectionDirectory,
    relativePath: "1/",
    itemCount: 0,
    sectionCount: 1,
  }];

  const subSection: SectionSummary = {
    directory: makeDirectory(`${PARENT_ID}/1/1`),
    itemCount: 1,
    sectionCount: 0,
  };

  const deepItem = makeItem(
    "019965a7-0003-740a-b8c1-1415904fd108",
    `${PARENT_ID}/1/1`,
    "Deep note",
  );

  const itemsByDirectory = new Map([
    [`${PARENT_ID}/1`, []],
    [`${PARENT_ID}/1/1`, [deepItem]],
  ]);
  const sectionsByDirectory = new Map([
    [`${PARENT_ID}/1`, [subSection]],
  ]);
  const deps = makeDeps(itemsByDirectory, sectionsByDirectory);
  const lines: string[] = [];

  await expandStubs(stubs, 2, lines, deps, makeOptions(), collectTitles, acceptAll);

  assertEquals(lines.length, 3);
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "  1/");
  assertEquals(lines[2], "    item:Deep note");
});

// =============================================================================
// Error handling: warnings on repository failures
// =============================================================================

Deno.test("expandStubs: logs warning to stderr when item query fails", async () => {
  const stubs: SectionStub[] = [{
    directory: makeDirectory(`${PARENT_ID}/1`),
    relativePath: "1/",
    itemCount: 1,
    sectionCount: 0,
  }];

  const failingDeps: ExpandStubsDeps = {
    itemRepository: {
      load: () => Promise.resolve(Result.ok(undefined)),
      save: () => Promise.resolve(Result.ok(undefined)),
      delete: () => Promise.resolve(Result.ok(undefined)),
      listByDirectory: () =>
        Promise.resolve(
          Result.error(createRepositoryError("item", "list", "disk read failed")),
        ),
    },
    sectionQueryService: {
      listSections: () => Promise.resolve(Result.ok([])),
    },
  };

  const stderrMessages: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => stderrMessages.push(msg);
  try {
    const lines: string[] = [];
    await expandStubs(stubs, 1, lines, failingDeps, makeOptions(), collectTitles, acceptAll);

    // Header is still rendered
    assertEquals(lines.length, 1);
    assertEquals(lines[0], "1/");

    // Warning was emitted
    assertEquals(stderrMessages.length, 1);
    assertEquals(stderrMessages[0].includes("disk read failed"), true);
  } finally {
    console.error = originalError;
  }
});

// =============================================================================
// expandItemChildren tests
// =============================================================================

const CHILD_A_ID = "019965a7-aaaa-740a-b8c1-1415904fd108";
const CHILD_B_ID = "019965a7-bbbb-740a-b8c1-1415904fd108";
const GRANDCHILD_ID = "019965a7-cccc-740a-b8c1-1415904fd108";

const makeItemId = (id: string) => unwrap(parseItemId(id));

Deno.test("expandItemChildren: depth 0 does nothing", async () => {
  const child = makeItem(CHILD_A_ID, PARENT_ID, "Child A");
  const itemsByDirectory = new Map([
    [`${PARENT_ID}/`, [child]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandItemChildren(
    makeItemId(PARENT_ID),
    0,
    lines,
    deps,
    makeOptions(),
    collectTitles,
    acceptAll,
    1,
  );

  assertEquals(lines.length, 0);
});

Deno.test("expandItemChildren: depth 1 shows direct children", async () => {
  const childA = makeItem(CHILD_A_ID, PARENT_ID, "Child A");
  const childB = makeItem(CHILD_B_ID, PARENT_ID, "Child B");
  const itemsByDirectory = new Map([
    [`${PARENT_ID}/`, [childA, childB]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandItemChildren(
    makeItemId(PARENT_ID),
    1,
    lines,
    deps,
    makeOptions(),
    collectTitles,
    acceptAll,
    1,
  );

  assertEquals(lines.length, 2);
  assertEquals(lines[0], "  item:Child A");
  assertEquals(lines[1], "  item:Child B");
});

Deno.test("expandItemChildren: depth 2 shows grandchildren", async () => {
  const childA = makeItem(CHILD_A_ID, PARENT_ID, "Child A");
  const grandchild = makeItem(GRANDCHILD_ID, CHILD_A_ID, "Grandchild");
  const itemsByDirectory = new Map([
    [`${PARENT_ID}/`, [childA]],
    [`${CHILD_A_ID}/`, [grandchild]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandItemChildren(
    makeItemId(PARENT_ID),
    2,
    lines,
    deps,
    makeOptions(),
    collectTitles,
    acceptAll,
    1,
  );

  assertEquals(lines.length, 2);
  assertEquals(lines[0], "  item:Child A");
  assertEquals(lines[1], "    item:Grandchild");
});

Deno.test("expandItemChildren: children + sections both rendered", async () => {
  const childA = makeItem(CHILD_A_ID, PARENT_ID, "Child A");
  const sectionItem = makeItem(
    "019965a7-dddd-740a-b8c1-1415904fd108",
    `${PARENT_ID}/1`,
    "Section Item",
  );
  const section: SectionSummary = {
    directory: makeDirectory(`${PARENT_ID}/1`),
    itemCount: 1,
    sectionCount: 0,
  };
  const itemsByDirectory = new Map<string, ReadonlyArray<Item>>([
    [`${PARENT_ID}/`, [childA]],
    [`${PARENT_ID}/1`, [sectionItem]],
  ]);
  const sectionsByDirectory = new Map([
    [`${PARENT_ID}/`, [section]],
  ]);
  const deps = makeDeps(itemsByDirectory, sectionsByDirectory);
  const lines: string[] = [];

  await expandItemChildren(
    makeItemId(PARENT_ID),
    2,
    lines,
    deps,
    makeOptions(),
    collectTitles,
    acceptAll,
    1,
  );

  // Child items shown at indent 1, then section header at indent 1, section items at indent 2
  assertEquals(lines[0], "  item:Child A");
  // Section stub expanded at depth 1 (remainingDepth - 1 = 1)
  assertEquals(lines[1], "  1/");
  assertEquals(lines[2], "    item:Section Item");
});

Deno.test("expandItemChildren: respects item filter", async () => {
  const openChild = makeItem(CHILD_A_ID, PARENT_ID, "Open Child");
  const closedChild = makeItem(CHILD_B_ID, PARENT_ID, "Closed Child", "closed");
  const itemsByDirectory = new Map([
    [`${PARENT_ID}/`, [openChild, closedChild]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandItemChildren(
    makeItemId(PARENT_ID),
    1,
    lines,
    deps,
    makeOptions(),
    collectTitles,
    openOnly,
    1,
  );

  assertEquals(lines.length, 1);
  assertEquals(lines[0], "  item:Open Child");
});

Deno.test("expandItemChildren: interleaves siblings with their descendants", async () => {
  // Child A has a grandchild, Child B does not.
  // Expected order: Child A, Grandchild, Child B (not Child A, Child B, Grandchild)
  const childA = makeItem(CHILD_A_ID, PARENT_ID, "Child A");
  const childB = makeItem(CHILD_B_ID, PARENT_ID, "Child B");
  const grandchild = makeItem(GRANDCHILD_ID, CHILD_A_ID, "Grandchild of A");
  const itemsByDirectory = new Map<string, ReadonlyArray<Item>>([
    [`${PARENT_ID}/`, [childA, childB]],
    [`${CHILD_A_ID}/`, [grandchild]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandItemChildren(
    makeItemId(PARENT_ID),
    2,
    lines,
    deps,
    makeOptions(),
    collectTitles,
    acceptAll,
    1,
  );

  assertEquals(lines.length, 3);
  assertEquals(lines[0], "  item:Child A");
  assertEquals(lines[1], "    item:Grandchild of A");
  assertEquals(lines[2], "  item:Child B");
});

Deno.test("expandStubs: items inside sections have children expanded at depth 2", async () => {
  // A section containing an item that itself has child items
  const sectionItem = makeItem(CHILD_A_ID, `${PARENT_ID}/1`, "Section Item");
  const childOfSectionItem = makeItem(GRANDCHILD_ID, CHILD_A_ID, "Child of Section Item");

  const stubs: SectionStub[] = [{
    directory: makeDirectory(`${PARENT_ID}/1`),
    relativePath: "1/",
    itemCount: 1,
    sectionCount: 0,
  }];

  const itemsByDirectory = new Map<string, ReadonlyArray<Item>>([
    [`${PARENT_ID}/1`, [sectionItem]],
    [`${CHILD_A_ID}/`, [childOfSectionItem]],
  ]);
  const deps = makeDeps(itemsByDirectory, new Map());
  const lines: string[] = [];

  await expandStubs(stubs, 2, lines, deps, makeOptions(), collectTitles, acceptAll);

  // 1/ header, section item indented once, child of section item indented twice
  assertEquals(lines[0], "1/");
  assertEquals(lines[1], "  item:Section Item");
  assertEquals(lines[2], "    item:Child of Section Item");
});
