import { assertEquals } from "@std/assert";
import { formatDateStringForTimezone, formatSegmentsForTimezone } from "./timezone_format.ts";
import { parseTimezoneIdentifier } from "../domain/primitives/timezone_identifier.ts";

const tz = (s: string) => {
  const result = parseTimezoneIdentifier(s);
  if (result.type === "error") throw new Error(`Invalid timezone: ${s}`);
  return result.value;
};

Deno.test("formatDateStringForTimezone", async (t) => {
  await t.step("returns YYYY-MM-DD format for given date and timezone", () => {
    // 2026-01-15 12:00:00 UTC
    const date = new Date("2026-01-15T12:00:00Z");
    const result = formatDateStringForTimezone(date, tz("UTC"));
    assertEquals(result, "2026-01-15");
  });

  await t.step("respects timezone for date boundary", () => {
    // 2026-01-15 23:00:00 UTC = 2026-01-16 08:00:00 JST
    const date = new Date("2026-01-15T23:00:00Z");
    const resultUtc = formatDateStringForTimezone(date, tz("UTC"));
    const resultJst = formatDateStringForTimezone(date, tz("Asia/Tokyo"));
    assertEquals(resultUtc, "2026-01-15");
    assertEquals(resultJst, "2026-01-16");
  });

  await t.step("uses UTC fast path for UTC-equivalent timezones", () => {
    const date = new Date("2026-01-15T12:00:00Z");
    // These should all use the fast path and return the same result
    assertEquals(formatDateStringForTimezone(date, tz("UTC")), "2026-01-15");
    assertEquals(formatDateStringForTimezone(date, tz("Etc/UTC")), "2026-01-15");
  });
});

Deno.test("formatSegmentsForTimezone", async (t) => {
  await t.step("returns [year, month, day] tuple", () => {
    const date = new Date("2026-01-15T12:00:00Z");
    const [year, month, day] = formatSegmentsForTimezone(date, tz("UTC"));
    assertEquals(year, "2026");
    assertEquals(month, "01");
    assertEquals(day, "15");
  });

  await t.step("respects timezone for date boundary", () => {
    // 2026-01-15 23:00:00 UTC = 2026-01-16 08:00:00 JST
    const date = new Date("2026-01-15T23:00:00Z");
    const [yearUtc, monthUtc, dayUtc] = formatSegmentsForTimezone(date, tz("UTC"));
    const [yearJst, monthJst, dayJst] = formatSegmentsForTimezone(date, tz("Asia/Tokyo"));
    assertEquals([yearUtc, monthUtc, dayUtc], ["2026", "01", "15"]);
    assertEquals([yearJst, monthJst, dayJst], ["2026", "01", "16"]);
  });

  await t.step("pads single-digit month and day with zeros", () => {
    const date = new Date("2026-03-05T12:00:00Z");
    const [year, month, day] = formatSegmentsForTimezone(date, tz("UTC"));
    assertEquals(year, "2026");
    assertEquals(month, "03");
    assertEquals(day, "05");
  });
});
