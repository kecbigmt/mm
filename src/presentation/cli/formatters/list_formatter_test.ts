import { assertEquals } from "@std/assert";
import { Result } from "../../../shared/result.ts";
import { createItem, Item } from "../../../domain/models/item.ts";
import { createItemIcon } from "../../../domain/primitives/item_icon.ts";
import { itemStatusClosed, itemStatusOpen } from "../../../domain/primitives/item_status.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import { parseItemTitle } from "../../../domain/primitives/item_title.ts";
import { parseItemRank } from "../../../domain/primitives/item_rank.ts";
import { DateTime, parseDateTime } from "../../../domain/primitives/date_time.ts";
import { parsePlacement } from "../../../domain/primitives/placement.ts";
import { parseAliasSlug } from "../../../domain/primitives/alias_slug.ts";
import { parseTagSlug } from "../../../domain/primitives/tag_slug.ts";
import { parseDuration } from "../../../domain/primitives/duration.ts";
import { CalendarDay, parseCalendarDay } from "../../../domain/primitives/calendar_day.ts";
import {
  parseTimezoneIdentifier,
  TimezoneIdentifier,
} from "../../../domain/primitives/timezone_identifier.ts";
import { SectionSummary } from "../../../domain/services/section_query_service.ts";
import {
  formatDateHeader,
  formatItemIcon,
  formatItemLine,
  formatSectionStub,
  ListFormatterOptions,
} from "./list_formatter.ts";

const makeTimezone = (): TimezoneIdentifier => Result.unwrap(parseTimezoneIdentifier("Asia/Tokyo"));

const makeCalendarDay = (iso: string): CalendarDay => Result.unwrap(parseCalendarDay(iso));

const makeDateTime = (iso: string): DateTime => Result.unwrap(parseDateTime(iso));

const makeItem = (
  overrides: Partial<{
    id: string;
    title: string;
    icon: "note" | "task" | "event";
    status: "open" | "closed";
    placement: string;
    alias: string;
    project: string;
    contexts: string[];
    startAt: string;
    duration: string;
    dueAt: string;
    snoozeUntil: string;
  }> = {},
): Item => {
  const id = Result.unwrap(parseItemId(overrides.id ?? "019a85fc-67c4-7a54-be8e-305bae009f9e"));
  const title = Result.unwrap(parseItemTitle(overrides.title ?? "Test item"));
  const icon = createItemIcon(overrides.icon ?? "note");
  const status = overrides.status === "closed" ? itemStatusClosed() : itemStatusOpen();
  const placement = Result.unwrap(parsePlacement(overrides.placement ?? "2025-02-10"));
  const rank = Result.unwrap(parseItemRank("0|aaaaaa:"));
  const createdAt = Result.unwrap(parseDateTime("2025-02-10T09:00:00Z"));
  const updatedAt = Result.unwrap(parseDateTime("2025-02-10T09:00:00Z"));
  const alias = overrides.alias ? Result.unwrap(parseAliasSlug(overrides.alias)) : undefined;
  const project = overrides.project ? Result.unwrap(parseAliasSlug(overrides.project)) : undefined;
  const contexts = overrides.contexts
    ? Object.freeze(overrides.contexts.map((c) => Result.unwrap(parseTagSlug(c))))
    : undefined;
  const startAt = overrides.startAt ? Result.unwrap(parseDateTime(overrides.startAt)) : undefined;
  const duration = overrides.duration
    ? Result.unwrap(parseDuration(overrides.duration))
    : undefined;
  const dueAt = overrides.dueAt ? Result.unwrap(parseDateTime(overrides.dueAt)) : undefined;
  const snoozeUntil = overrides.snoozeUntil
    ? Result.unwrap(parseDateTime(overrides.snoozeUntil))
    : undefined;

  return createItem({
    id,
    title,
    icon,
    status,
    placement,
    rank,
    createdAt,
    updatedAt,
    alias,
    project,
    contexts,
    startAt,
    duration,
    dueAt,
    snoozeUntil,
  });
};

// =============================================================================
// formatItemIcon tests
// =============================================================================

Deno.test("formatItemIcon - note open returns -", () => {
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status, false);
  assertEquals(result, "-");
});

Deno.test("formatItemIcon - note closed returns ✓", () => {
  const icon = createItemIcon("note");
  const status = itemStatusClosed();
  const result = formatItemIcon(icon, status, false);
  assertEquals(result, "✓");
});

Deno.test("formatItemIcon - task open returns •", () => {
  const icon = createItemIcon("task");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status, false);
  assertEquals(result, "•");
});

Deno.test("formatItemIcon - task closed returns ✓", () => {
  const icon = createItemIcon("task");
  const status = itemStatusClosed();
  const result = formatItemIcon(icon, status, false);
  assertEquals(result, "✓");
});

Deno.test("formatItemIcon - event open returns ○", () => {
  const icon = createItemIcon("event");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status, false);
  assertEquals(result, "○");
});

Deno.test("formatItemIcon - event closed returns ✓", () => {
  const icon = createItemIcon("event");
  const status = itemStatusClosed();
  const result = formatItemIcon(icon, status, false);
  assertEquals(result, "✓");
});

Deno.test("formatItemIcon - note snoozing returns ~", () => {
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status, true); // isSnoozing = true
  assertEquals(result, "~");
});

Deno.test("formatItemIcon - task snoozing returns ~", () => {
  const icon = createItemIcon("task");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status, true); // isSnoozing = true
  assertEquals(result, "~");
});

Deno.test("formatItemIcon - event snoozing returns ~", () => {
  const icon = createItemIcon("event");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status, true); // isSnoozing = true
  assertEquals(result, "~");
});

// Default "now" for tests
const DEFAULT_NOW = makeDateTime("2025-02-10T12:00:00Z");

// =============================================================================
// formatItemLine tests - alias/UUID fallback
// =============================================================================

Deno.test("formatItemLine - uses alias when present", () => {
  const item = makeItem({ alias: "my-alias", title: "Test title" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("my-alias"), true);
  assertEquals(result.includes("019a85fc-67c4-7a54-be8e-305bae009f9e"), false);
});

Deno.test("formatItemLine - uses UUID when alias is missing", () => {
  const item = makeItem({ title: "Test title" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("019a85fc-67c4-7a54-be8e-305bae009f9e"), true);
});

Deno.test("formatItemLine - includes title", () => {
  const item = makeItem({ title: "My task title" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("My task title"), true);
});

Deno.test("formatItemLine - includes context when present", () => {
  const item = makeItem({ contexts: ["project-novel"] });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("@project-novel"), true);
});

Deno.test("formatItemLine - includes due date when present", () => {
  const item = makeItem({ dueAt: "2025-02-15T00:00:00Z" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("→2025-02-15"), true);
});

// =============================================================================
// formatItemLine tests - event time formatting
// =============================================================================

Deno.test("formatItemLine - event with startAt shows time in timezone (colored mode)", () => {
  const item = makeItem({
    icon: "event",
    startAt: "2025-02-10T00:30:00Z", // 09:30 in Asia/Tokyo
  });
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("○ (09:30)"), true);
});

Deno.test("formatItemLine - event with startAt shows time in timezone (print mode)", () => {
  const item = makeItem({
    icon: "event",
    startAt: "2025-02-10T00:30:00Z", // 09:30 in Asia/Tokyo
  });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[event](09:30)"), true);
});

Deno.test("formatItemLine - event with startAt and duration shows time range (colored mode)", () => {
  const item = makeItem({
    icon: "event",
    startAt: "2025-02-10T00:30:00Z", // 09:30 in Asia/Tokyo
    duration: "30m",
  });
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("○ (09:30-10:00)"), true);
});

Deno.test("formatItemLine - event with startAt and duration shows time range (print mode)", () => {
  const item = makeItem({
    icon: "event",
    startAt: "2025-02-10T00:30:00Z", // 09:30 in Asia/Tokyo
    duration: "30m",
  });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[event](09:30-10:00)"), true);
});

Deno.test("formatItemLine - event without startAt shows plain circle (colored mode)", () => {
  const item = makeItem({ icon: "event" });
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("○ "), true);
  assertEquals(result.includes("○ ("), false);
});

Deno.test("formatItemLine - event without startAt shows plain text token (print mode)", () => {
  const item = makeItem({ icon: "event" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[event] "), true);
  assertEquals(result.includes("[event]("), false);
});

// =============================================================================
// formatDateHeader tests
// =============================================================================

Deno.test("formatDateHeader - today shows relative label", () => {
  const day = makeCalendarDay("2025-02-10");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-10] today");
});

Deno.test("formatDateHeader - tomorrow shows relative label", () => {
  const day = makeCalendarDay("2025-02-11");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-11] tomorrow");
});

Deno.test("formatDateHeader - yesterday shows relative label", () => {
  const day = makeCalendarDay("2025-02-09");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-09] yesterday");
});

// 2025-02-10 is Monday, so +2d (2025-02-12) is Wednesday
Deno.test("formatDateHeader - +2d shows next-wednesday (weekday label)", () => {
  const day = makeCalendarDay("2025-02-12");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-12] next-wednesday");
});

// 2025-02-10 is Monday, so -2d (2025-02-08) is Saturday
Deno.test("formatDateHeader - -2d shows last-saturday (weekday label)", () => {
  const day = makeCalendarDay("2025-02-08");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-08] last-saturday");
});

// 2025-02-10 is Monday, so +7d (2025-02-17) is Monday
Deno.test("formatDateHeader - +7d shows next-monday (weekday label)", () => {
  const day = makeCalendarDay("2025-02-17");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-17] next-monday");
});

// 2025-02-10 is Monday, so -7d (2025-02-03) is Monday
Deno.test("formatDateHeader - -7d shows last-monday (weekday label)", () => {
  const day = makeCalendarDay("2025-02-03");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-03] last-monday");
});

// 2025-03-01 is 19 days after 2025-02-10
Deno.test("formatDateHeader - far future shows +Xd label", () => {
  const day = makeCalendarDay("2025-03-01");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-03-01] +19d");
});

// 2025-01-01 is 40 days before 2025-02-10
Deno.test("formatDateHeader - far past shows ~Xd label", () => {
  const day = makeCalendarDay("2025-01-01");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-01-01] ~40d");
});

// 2025-02-18 is 8 days after 2025-02-10 (just beyond weekday range)
Deno.test("formatDateHeader - +8d shows +8d label (beyond weekday range)", () => {
  const day = makeCalendarDay("2025-02-18");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-18] +8d");
});

// 2025-02-02 is 8 days before 2025-02-10 (just beyond weekday range)
Deno.test("formatDateHeader - -8d shows ~8d label (beyond weekday range)", () => {
  const day = makeCalendarDay("2025-02-02");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-02] ~8d");
});

// =============================================================================
// formatSectionStub tests
// =============================================================================

Deno.test("formatSectionStub - formats stub with counts (colored mode)", () => {
  const summary: SectionSummary = {
    placement: Result.unwrap(parsePlacement("019a85fc-67c4-7a54-be8e-305bae009f9e/1")),
    itemCount: 3,
    sectionCount: 2,
  };
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatSectionStub(summary, "1/", options);
  assertEquals(result, "📁 1/ (items: 3, sections: 2)");
});

Deno.test("formatSectionStub - formats stub with counts (print mode)", () => {
  const summary: SectionSummary = {
    placement: Result.unwrap(parsePlacement("019a85fc-67c4-7a54-be8e-305bae009f9e/1")),
    itemCount: 3,
    sectionCount: 2,
  };
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatSectionStub(summary, "1/", options);
  assertEquals(result, "[section] 1/ (items: 3, sections: 2)");
});

Deno.test("formatSectionStub - formats stub with zero sections", () => {
  const summary: SectionSummary = {
    placement: Result.unwrap(parsePlacement("019a85fc-67c4-7a54-be8e-305bae009f9e/2")),
    itemCount: 1,
    sectionCount: 0,
  };
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatSectionStub(summary, "2/", options);
  assertEquals(result, "📁 2/ (items: 1, sections: 0)");
});

// =============================================================================
// Print mode tests - date column and plain text icons
// =============================================================================

Deno.test("formatItemLine - print mode includes date column when provided", () => {
  const item = makeItem({ alias: "test-alias", title: "Test item" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options, "2025-02-10");
  assertEquals(result.startsWith("2025-02-10"), true);
});

Deno.test("formatItemLine - print mode uses plain text icon for note", () => {
  const item = makeItem({ icon: "note" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[note]"), true);
});

Deno.test("formatItemLine - print mode uses plain text icon for task", () => {
  const item = makeItem({ icon: "task" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[task]"), true);
  assertEquals(result.includes("•"), false);
});

Deno.test("formatItemLine - print mode uses plain text icon for closed task", () => {
  const item = makeItem({ icon: "task", status: "closed" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[task:done]"), true);
  assertEquals(result.includes("✓"), false);
});

Deno.test("formatItemLine - print mode uses plain text icon for snoozing task", () => {
  // Item is snoozing when snoozeUntil > now
  const item = makeItem({ icon: "task", snoozeUntil: "2025-02-11T00:00:00Z" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW, // 2025-02-10T12:00:00Z - before snoozeUntil
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[task:snoozing]"), true);
  assertEquals(result.includes("~"), false);
});

Deno.test("formatItemLine - print mode uses plain text icon for snoozing note", () => {
  // Item is snoozing when snoozeUntil > now
  const item = makeItem({ icon: "note", snoozeUntil: "2025-02-11T00:00:00Z" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW, // 2025-02-10T12:00:00Z - before snoozeUntil
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("[note:snoozing]"), true);
  assertEquals(result.includes("~"), false);
});

Deno.test("formatItemLine - print mode produces no ANSI escape codes", () => {
  const item = makeItem({ alias: "test-alias", contexts: ["ctx"] });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  // ANSI escape codes start with ESC (0x1b or \x1b)
  assertEquals(result.includes("\x1b"), false);
});

Deno.test("formatDateHeader - print mode produces no ANSI escape codes", () => {
  const day = makeCalendarDay("2025-02-10");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result.includes("\x1b"), false);
});

Deno.test("formatSectionStub - print mode produces no ANSI escape codes", () => {
  const summary: SectionSummary = {
    placement: Result.unwrap(parsePlacement("019a85fc-67c4-7a54-be8e-305bae009f9e/1")),
    itemCount: 2,
    sectionCount: 1,
  };
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatSectionStub(summary, "1/", options);
  assertEquals(result.includes("\x1b"), false);
});

// =============================================================================
// Colored mode tests - includes ANSI codes
// =============================================================================

Deno.test("formatItemLine - colored mode includes ANSI codes for alias", () => {
  const item = makeItem({ alias: "test-alias" });
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("\x1b"), true);
});

Deno.test("formatDateHeader - colored mode includes ANSI codes for today", () => {
  const day = makeCalendarDay("2025-02-10");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result.includes("\x1b"), true);
});

// =============================================================================
// formatItemHeadHeader tests
// =============================================================================

import { formatItemHeadHeader } from "./list_formatter.ts";

Deno.test("formatItemHeadHeader - formats with alias and section", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemHeadHeader("my-book", "1", options);
  assertEquals(result, "[my-book/1]");
});

Deno.test("formatItemHeadHeader - formats with UUID and section", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemHeadHeader("019a85fc-67c4-7a54-be8e-305bae009f9e", "2", options);
  assertEquals(result, "[019a85fc-67c4-7a54-be8e-305bae009f9e/2]");
});

Deno.test("formatItemHeadHeader - formats without section", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemHeadHeader("my-book", undefined, options);
  assertEquals(result, "[my-book]");
});

Deno.test("formatItemHeadHeader - colored mode includes ANSI codes", () => {
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemHeadHeader("my-book", "1", options);
  assertEquals(result.includes("\x1b"), true);
});

Deno.test("formatItemHeadHeader - print mode produces no ANSI codes", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
    now: DEFAULT_NOW,
  };
  const result = formatItemHeadHeader("my-book", "1", options);
  assertEquals(result.includes("\x1b"), false);
});
