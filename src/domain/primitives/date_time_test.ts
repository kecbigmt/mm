import { assertEquals } from "@std/assert";
import { parseDateTime } from "./date_time.ts";
import { timezoneIdentifierFromString } from "./timezone_identifier.ts";
import { Result } from "../../shared/result.ts";

Deno.test("parseDateTime - parses ISO 8601 with timezone (Z)", () => {
  const result = parseDateTime("2025-11-21T15:00:00Z");
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString().startsWith("2025-11-21T15:00:00"), true);
  }
});

Deno.test("parseDateTime - parses ISO 8601 with timezone offset (+09:00)", () => {
  const result = parseDateTime("2025-11-21T15:00:00+09:00");
  assertEquals(result.type, "ok");
});

Deno.test("parseDateTime - parses ISO 8601 without timezone (local time)", () => {
  const result = parseDateTime("2025-11-21T15:00");
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Should be interpreted as local time
    const date = result.value.toDate();
    assertEquals(date.getFullYear(), 2025);
    assertEquals(date.getMonth(), 10); // November (0-indexed)
    assertEquals(date.getDate(), 21);
    assertEquals(date.getHours(), 15);
    assertEquals(date.getMinutes(), 0);
  }
});

Deno.test("parseDateTime - parses ISO 8601 without timezone with seconds", () => {
  const result = parseDateTime("2025-11-21T15:30:45");
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const date = result.value.toDate();
    assertEquals(date.getFullYear(), 2025);
    assertEquals(date.getMonth(), 10);
    assertEquals(date.getDate(), 21);
    assertEquals(date.getHours(), 15);
    assertEquals(date.getMinutes(), 30);
    assertEquals(date.getSeconds(), 45);
  }
});

Deno.test("parseDateTime - parses time-only format (HH:MM) with today as reference", () => {
  const today = new Date(2025, 10, 21, 10, 0, 0); // November 21, 2025, 10:00
  const result = parseDateTime("15:30", { referenceDate: today });
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const date = result.value.toDate();
    assertEquals(date.getFullYear(), 2025);
    assertEquals(date.getMonth(), 10);
    assertEquals(date.getDate(), 21);
    assertEquals(date.getHours(), 15);
    assertEquals(date.getMinutes(), 30);
    assertEquals(date.getSeconds(), 0);
  }
});

Deno.test("parseDateTime - parses time-only format (HH:MM:SS)", () => {
  const today = new Date(2025, 10, 21);
  const result = parseDateTime("15:30:45", { referenceDate: today });
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const date = result.value.toDate();
    assertEquals(date.getHours(), 15);
    assertEquals(date.getMinutes(), 30);
    assertEquals(date.getSeconds(), 45);
  }
});

Deno.test("parseDateTime - uses current date when no reference provided for time-only", () => {
  const result = parseDateTime("15:30");
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const date = result.value.toDate();
    const now = new Date();
    assertEquals(date.getFullYear(), now.getFullYear());
    assertEquals(date.getMonth(), now.getMonth());
    assertEquals(date.getDate(), now.getDate());
    assertEquals(date.getHours(), 15);
    assertEquals(date.getMinutes(), 30);
  }
});

Deno.test("parseDateTime - rejects invalid format", () => {
  const result = parseDateTime("not-a-date");
  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
    assertEquals(result.error.issues.length > 0, true);
  }
});

Deno.test("parseDateTime - accepts 25:00 as 01:00 next day (JavaScript Date behavior)", () => {
  const today = new Date(2025, 10, 21);
  const result = parseDateTime("25:00", { referenceDate: today });
  // JavaScript Date accepts 25:00 and interprets as 01:00 next day
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const date = result.value.toDate();
    assertEquals(date.getDate(), 22); // Next day
    assertEquals(date.getHours(), 1); // 01:00
  }
});

Deno.test("parseDateTime - rejects non-string input", () => {
  const result = parseDateTime(123);
  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "not_string");
  }
});

Deno.test("parseDateTime - returns DateTime if already DateTime", () => {
  const first = parseDateTime("2025-11-21T15:00:00Z");
  assertEquals(first.type, "ok");
  if (first.type === "ok") {
    const second = parseDateTime(first.value);
    assertEquals(second.type, "ok");
    if (second.type === "ok") {
      assertEquals(first.value.equals(second.value), true);
    }
  }
});

Deno.test("parseDateTime - time-only format uses workspace timezone (PST) not host timezone", () => {
  // Test scenario: workspace is PST (UTC-8), host might be different
  // Use noon UTC to ensure stable date when formatted in workspace timezone
  const referenceDate = new Date(Date.UTC(2025, 1, 10, 12, 0, 0)); // 2025-02-10T12:00:00Z
  const timezone = Result.unwrap(timezoneIdentifierFromString("America/Los_Angeles"));

  // Parse 09:00 in PST timezone
  const result = parseDateTime("09:00", {
    referenceDate,
    timezone,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const isoString = result.value.data.iso;
    // Reference date 2025-02-10T12:00:00Z formatted in PST is 2025-02-10
    // So 09:00 PST on 2025-02-10 = 2025-02-10T17:00:00.000Z (PST is UTC-8)
    assertEquals(isoString, "2025-02-10T17:00:00.000Z");
  }
});

Deno.test("parseDateTime - time-only format uses workspace timezone (JST) not host timezone", () => {
  // Test scenario: workspace is JST (UTC+9), host might be different
  // Use noon UTC to ensure stable date when formatted in workspace timezone
  const referenceDate = new Date(Date.UTC(2025, 1, 10, 12, 0, 0)); // 2025-02-10T12:00:00Z
  const timezone = Result.unwrap(timezoneIdentifierFromString("Asia/Tokyo"));

  // Parse 09:00 in JST timezone
  const result = parseDateTime("09:00", {
    referenceDate,
    timezone,
  });

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    const isoString = result.value.data.iso;
    // Reference date 2025-02-10T12:00:00Z formatted in JST is 2025-02-10
    // So 09:00 JST on 2025-02-10 = 2025-02-10T00:00:00.000Z (JST is UTC+9)
    assertEquals(isoString, "2025-02-10T00:00:00.000Z");
  }
});
