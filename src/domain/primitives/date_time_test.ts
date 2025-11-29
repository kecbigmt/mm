import { assertEquals } from "@std/assert";
import { parseDateTime } from "./date_time.ts";

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
  const result = parseDateTime("15:30", today);
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
  const result = parseDateTime("15:30:45", today);
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
  const result = parseDateTime("25:00", today);
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
