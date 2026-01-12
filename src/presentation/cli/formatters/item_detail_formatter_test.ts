import { assertEquals } from "@std/assert";
import { formatItemDetail } from "./item_detail_formatter.ts";
import { parseItem } from "../../../domain/models/item.ts";

Deno.test("formatItemDetail - note with alias, context, and body", () => {
  const itemResult = parseItem({
    id: "019965a7-2789-740a-b8c1-1415904fd100",
    title: "Planning document",
    icon: "note",
    status: "open",
    placement: "2025-08-30",
    rank: "a0",
    createdAt: "2025-08-30T14:23:45.123Z",
    updatedAt: "2025-08-30T14:23:45.123Z",
    alias: "kene-abc",
    contexts: ["planning"],
    body: "Here's the planning document content.\nIt includes several important notes.",
  });

  if (itemResult.type === "error") {
    throw new Error(`Failed to parse test data: ${itemResult.error.toString()}`);
  }

  const item = itemResult.value;

  const result = formatItemDetail(item);

  // Header line with alias, icon, title, context, date
  assertEquals(result.includes("kene-abc"), true);
  assertEquals(result.includes("📝"), true);
  assertEquals(result.includes("Planning document"), true);
  assertEquals(result.includes("@planning"), true);
  assertEquals(result.includes("on:2025-08-30"), true);

  // Body content
  assertEquals(result.includes("Here's the planning document content."), true);
  assertEquals(result.includes("It includes several important notes."), true);

  // Metadata section
  assertEquals(result.includes("UUID: 019965a7-2789-740a-b8c1-1415904fd100"), true);
  assertEquals(result.includes("Created: 2025-08-30T14:23:45.123Z"), true);
  assertEquals(result.includes("Updated: 2025-08-30T14:23:45.123Z"), true);
});

Deno.test("formatItemDetail - task (closed) without body", () => {
  const itemResult = parseItem({
    id: "019965a7-2789-740a-b8c1-1415904fd101",
    title: "Complete report",
    icon: "task",
    status: "closed",
    placement: "2025-08-29",
    rank: "a0",
    createdAt: "2025-08-29T10:00:00.000Z",
    updatedAt: "2025-08-29T10:00:00.000Z",
    closedAt: "2025-08-30T15:30:00.000Z",
    alias: "task-xyz",
  });

  if (itemResult.type === "error") {
    throw new Error(`Failed to parse test data: ${itemResult.error.toString()}`);
  }

  const item = itemResult.value;

  const result = formatItemDetail(item);

  // Header with closed task icon
  assertEquals(result.includes("task-xyz"), true);
  assertEquals(result.includes("✅"), true);
  assertEquals(result.includes("Complete report"), true);
  assertEquals(result.includes("on:2025-08-29"), true);

  // No body section
  assertEquals(result.includes("Here's"), false);

  // Metadata with Closed timestamp
  assertEquals(result.includes("UUID: 019965a7-2789-740a-b8c1-1415904fd101"), true);
  assertEquals(result.includes("Created: 2025-08-29T10:00:00.000Z"), true);
  assertEquals(result.includes("Closed: 2025-08-30T15:30:00.000Z"), true);
});

Deno.test("formatItemDetail - event with startAt and duration", () => {
  const itemResult = parseItem({
    id: "019965a7-2789-740a-b8c1-1415904fd102",
    title: "Team meeting",
    icon: "event",
    status: "open",
    placement: "2025-08-31",
    rank: "a0",
    createdAt: "2025-08-28T08:00:00.000Z",
    updatedAt: "2025-08-28T08:00:00.000Z",
    startAt: "2025-08-31T14:00:00.000Z",
    duration: "1h30m",
  });

  if (itemResult.type === "error") {
    throw new Error(`Failed to parse test data: ${itemResult.error.toString()}`);
  }

  const item = itemResult.value;

  const result = formatItemDetail(item);

  // Header with event icon
  assertEquals(result.includes("🕒"), true);
  assertEquals(result.includes("Team meeting"), true);
  assertEquals(result.includes("on:2025-08-31"), true);

  // Metadata with Start and Duration
  assertEquals(result.includes("UUID: 019965a7-2789-740a-b8c1-1415904fd102"), true);
  assertEquals(result.includes("Created: 2025-08-28T08:00:00.000Z"), true);
  assertEquals(result.includes("Start: 2025-08-31T14:00:00.000Z"), true);
  assertEquals(result.includes("Duration: 1h30m"), true);
});

Deno.test("formatItemDetail - item without alias uses UUID", () => {
  const itemResult = parseItem({
    id: "019965a7-2789-740a-b8c1-1415904fd103",
    title: "Note without alias",
    icon: "note",
    status: "open",
    placement: "2025-08-30",
    rank: "a0",
    createdAt: "2025-08-30T12:00:00.000Z",
    updatedAt: "2025-08-30T12:00:00.000Z",
  });

  if (itemResult.type === "error") {
    throw new Error(`Failed to parse test data: ${itemResult.error.toString()}`);
  }

  const item = itemResult.value;

  const result = formatItemDetail(item);

  // Header should use full UUID when no alias
  assertEquals(result.includes("019965a7-2789-740a-b8c1-1415904fd103"), true);
  assertEquals(result.includes("Note without alias"), true);
});
