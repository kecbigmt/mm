import { assertEquals } from "@std/assert";
import { Result } from "../../../shared/result.ts";
import { createItem, Item } from "../../../domain/models/item.ts";
import { createItemIcon } from "../../../domain/primitives/item_icon.ts";
import { itemStatusClosed, itemStatusOpen } from "../../../domain/primitives/item_status.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import { parseItemTitle } from "../../../domain/primitives/item_title.ts";
import { parseItemRank } from "../../../domain/primitives/item_rank.ts";
import { parseDateTime } from "../../../domain/primitives/date_time.ts";
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

const makeItem = (
  overrides: Partial<{
    id: string;
    title: string;
    icon: "note" | "task" | "event";
    status: "open" | "closed";
    placement: string;
    alias: string;
    context: string;
    startAt: string;
    duration: string;
    dueAt: string;
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
  const context = overrides.context ? Result.unwrap(parseTagSlug(overrides.context)) : undefined;
  const startAt = overrides.startAt ? Result.unwrap(parseDateTime(overrides.startAt)) : undefined;
  const duration = overrides.duration
    ? Result.unwrap(parseDuration(overrides.duration))
    : undefined;
  const dueAt = overrides.dueAt ? Result.unwrap(parseDateTime(overrides.dueAt)) : undefined;

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
    context,
    startAt,
    duration,
    dueAt,
  });
};

// =============================================================================
// formatItemIcon tests
// =============================================================================

Deno.test("formatItemIcon - note open returns 📝", () => {
  const icon = createItemIcon("note");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status);
  assertEquals(result, "📝");
});

Deno.test("formatItemIcon - note closed returns 🗞️", () => {
  const icon = createItemIcon("note");
  const status = itemStatusClosed();
  const result = formatItemIcon(icon, status);
  assertEquals(result, "🗞️");
});

Deno.test("formatItemIcon - task open returns ✔️", () => {
  const icon = createItemIcon("task");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status);
  assertEquals(result, "✔️");
});

Deno.test("formatItemIcon - task closed returns ✅", () => {
  const icon = createItemIcon("task");
  const status = itemStatusClosed();
  const result = formatItemIcon(icon, status);
  assertEquals(result, "✅");
});

Deno.test("formatItemIcon - event returns 🕒", () => {
  const icon = createItemIcon("event");
  const status = itemStatusOpen();
  const result = formatItemIcon(icon, status);
  assertEquals(result, "🕒");
});

// =============================================================================
// formatItemLine tests - alias/UUID fallback
// =============================================================================

Deno.test("formatItemLine - uses alias when present", () => {
  const item = makeItem({ alias: "my-alias", title: "Test title" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
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
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("019a85fc-67c4-7a54-be8e-305bae009f9e"), true);
});

Deno.test("formatItemLine - includes title", () => {
  const item = makeItem({ title: "My task title" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("My task title"), true);
});

Deno.test("formatItemLine - includes context when present", () => {
  const item = makeItem({ context: "project-novel" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("@project-novel"), true);
});

Deno.test("formatItemLine - includes due date when present", () => {
  const item = makeItem({ dueAt: "2025-02-15T00:00:00Z" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("→2025-02-15"), true);
});

// =============================================================================
// formatItemLine tests - event time formatting
// =============================================================================

Deno.test("formatItemLine - event with startAt shows time in timezone", () => {
  const item = makeItem({
    icon: "event",
    startAt: "2025-02-10T00:30:00Z", // 09:30 in Asia/Tokyo
  });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("🕒(09:30)"), true);
});

Deno.test("formatItemLine - event with startAt and duration shows time range", () => {
  const item = makeItem({
    icon: "event",
    startAt: "2025-02-10T00:30:00Z", // 09:30 in Asia/Tokyo
    duration: "30m",
  });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("🕒(09:30-10:00)"), true);
});

Deno.test("formatItemLine - event without startAt shows plain clock icon", () => {
  const item = makeItem({ icon: "event" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemLine(item, options);
  assertEquals(result.includes("🕒 "), true);
  assertEquals(result.includes("🕒("), false);
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
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-09] yesterday");
});

Deno.test("formatDateHeader - +2d shows relative label", () => {
  const day = makeCalendarDay("2025-02-12");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-02-12] +2d");
});

Deno.test("formatDateHeader - far future shows no relative label", () => {
  const day = makeCalendarDay("2025-03-01");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-03-01]");
});

Deno.test("formatDateHeader - far past shows no relative label", () => {
  const day = makeCalendarDay("2025-01-01");
  const referenceDate = new Date("2025-02-10T12:00:00Z");
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatDateHeader(day, referenceDate, options);
  assertEquals(result, "[2025-01-01]");
});

// =============================================================================
// formatSectionStub tests
// =============================================================================

Deno.test("formatSectionStub - formats stub with counts", () => {
  const summary: SectionSummary = {
    placement: Result.unwrap(parsePlacement("019a85fc-67c4-7a54-be8e-305bae009f9e/1")),
    itemCount: 3,
    sectionCount: 2,
  };
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatSectionStub(summary, "1/", options);
  assertEquals(result, "📁 1/ (items: 3, sections: 2)");
});

Deno.test("formatSectionStub - formats stub with zero sections", () => {
  const summary: SectionSummary = {
    placement: Result.unwrap(parsePlacement("019a85fc-67c4-7a54-be8e-305bae009f9e/2")),
    itemCount: 1,
    sectionCount: 0,
  };
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatSectionStub(summary, "2/", options);
  assertEquals(result, "📁 2/ (items: 1, sections: 0)");
});

// =============================================================================
// Print mode tests - no ANSI codes
// =============================================================================

Deno.test("formatItemLine - print mode produces no ANSI escape codes", () => {
  const item = makeItem({ alias: "test-alias", context: "ctx" });
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
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
  };
  const result = formatItemHeadHeader("my-book", "1", options);
  assertEquals(result, "[my-book/1]");
});

Deno.test("formatItemHeadHeader - formats with UUID and section", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemHeadHeader("019a85fc-67c4-7a54-be8e-305bae009f9e", "2", options);
  assertEquals(result, "[019a85fc-67c4-7a54-be8e-305bae009f9e/2]");
});

Deno.test("formatItemHeadHeader - formats without section", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemHeadHeader("my-book", undefined, options);
  assertEquals(result, "[my-book]");
});

Deno.test("formatItemHeadHeader - colored mode includes ANSI codes", () => {
  const options: ListFormatterOptions = {
    printMode: false,
    timezone: makeTimezone(),
  };
  const result = formatItemHeadHeader("my-book", "1", options);
  assertEquals(result.includes("\x1b"), true);
});

Deno.test("formatItemHeadHeader - print mode produces no ANSI codes", () => {
  const options: ListFormatterOptions = {
    printMode: true,
    timezone: makeTimezone(),
  };
  const result = formatItemHeadHeader("my-book", "1", options);
  assertEquals(result.includes("\x1b"), false);
});
