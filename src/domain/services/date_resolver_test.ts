import { assertEquals } from "@std/assert";
import {
  isDateExpression,
  isPeriodKeyword,
  resolvePeriodRange,
  resolveRelativeDate,
} from "./date_resolver.ts";
import { timezoneIdentifierFromString } from "../primitives/mod.ts";
import { Result } from "../../shared/result.ts";

// Test: isDateExpression
Deno.test("isDateExpression - keywords", () => {
  assertEquals(isDateExpression("today"), true);
  assertEquals(isDateExpression("td"), true);
  assertEquals(isDateExpression("tomorrow"), true);
  assertEquals(isDateExpression("tm"), true);
  assertEquals(isDateExpression("yesterday"), true);
  assertEquals(isDateExpression("yd"), true);
});

Deno.test("isDateExpression - range keywords", () => {
  assertEquals(isDateExpression("this-week"), true);
  assertEquals(isDateExpression("tw"), true);
  assertEquals(isDateExpression("next-week"), true);
  assertEquals(isDateExpression("nw"), true);
  assertEquals(isDateExpression("last-week"), true);
  assertEquals(isDateExpression("lw"), true);
  assertEquals(isDateExpression("this-month"), true);
  assertEquals(isDateExpression("next-month"), true);
  assertEquals(isDateExpression("last-month"), true);
});

Deno.test("isDateExpression - period syntax", () => {
  assertEquals(isDateExpression("+2w"), true);
  assertEquals(isDateExpression("~3d"), true);
  assertEquals(isDateExpression("+1m"), true);
  assertEquals(isDateExpression("~2y"), true);
  assertEquals(isDateExpression("+7d"), true);
});

Deno.test("isDateExpression - weekday syntax", () => {
  assertEquals(isDateExpression("+mon"), true);
  assertEquals(isDateExpression("~fri"), true);
  assertEquals(isDateExpression("+sun"), true);
  assertEquals(isDateExpression("~wed"), true);
});

Deno.test("isDateExpression - long weekday syntax", () => {
  assertEquals(isDateExpression("next-monday"), true);
  assertEquals(isDateExpression("last-friday"), true);
  assertEquals(isDateExpression("next-sunday"), true);
  assertEquals(isDateExpression("last-wednesday"), true);
});

Deno.test("isDateExpression - literal dates", () => {
  assertEquals(isDateExpression("2025-12-06"), true);
  assertEquals(isDateExpression("2025-01-01"), true);
  assertEquals(isDateExpression("2024-12-31"), true);
});

Deno.test("isDateExpression - case insensitive", () => {
  assertEquals(isDateExpression("TODAY"), true);
  assertEquals(isDateExpression("Next-Monday"), true);
  assertEquals(isDateExpression("THIS-WEEK"), true);
});

Deno.test("isDateExpression - invalid inputs", () => {
  assertEquals(isDateExpression("invalid"), false);
  assertEquals(isDateExpression("++2w"), false);
  assertEquals(isDateExpression("next-foo"), false);
  assertEquals(isDateExpression(""), false);
  assertEquals(isDateExpression("123"), false);
  assertEquals(isDateExpression("abc-def"), false);
});

// Test: resolveRelativeDate
const timezone = Result.unwrap(timezoneIdentifierFromString("Asia/Tokyo"));
const referenceDate = new Date("2025-12-06T12:00:00Z"); // Saturday

Deno.test("resolveRelativeDate - today keyword", () => {
  const result = resolveRelativeDate("today", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Reference date in Asia/Tokyo is 2025-12-06 21:00
    assertEquals(result.value.toString(), "2025-12-06");
  }
});

Deno.test("resolveRelativeDate - tomorrow keyword", () => {
  const result = resolveRelativeDate("tomorrow", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), "2025-12-07");
  }
});

Deno.test("resolveRelativeDate - yesterday keyword", () => {
  const result = resolveRelativeDate("yesterday", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), "2025-12-05");
  }
});

Deno.test("resolveRelativeDate - period syntax +2w", () => {
  const result = resolveRelativeDate("+2w", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), "2025-12-20");
  }
});

Deno.test("resolveRelativeDate - period syntax ~3d", () => {
  const result = resolveRelativeDate("~3d", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), "2025-12-03");
  }
});

Deno.test("resolveRelativeDate - next-monday (reference is Saturday)", () => {
  const result = resolveRelativeDate("next-monday", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Next Monday from Saturday 2025-12-06 is 2025-12-08
    assertEquals(result.value.toString(), "2025-12-08");
  }
});

Deno.test("resolveRelativeDate - last-friday (reference is Saturday)", () => {
  const result = resolveRelativeDate("last-friday", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Last Friday from Saturday 2025-12-06 is 2025-12-05
    assertEquals(result.value.toString(), "2025-12-05");
  }
});

Deno.test("resolveRelativeDate - this-week (reference is Saturday)", () => {
  const result = resolveRelativeDate("this-week", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // This week's Monday from Saturday 2025-12-06 is 2025-12-01
    assertEquals(result.value.toString(), "2025-12-01");
  }
});

Deno.test("resolveRelativeDate - this-month", () => {
  const result = resolveRelativeDate("this-month", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), "2025-12-01");
  }
});

Deno.test("resolveRelativeDate - literal date", () => {
  const result = resolveRelativeDate("2025-12-25", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.toString(), "2025-12-25");
  }
});

Deno.test("resolveRelativeDate - invalid input", () => {
  const result = resolveRelativeDate("invalid-date", timezone, referenceDate);
  assertEquals(result.type, "error");
});

// Test: isPeriodKeyword
Deno.test("isPeriodKeyword - week keywords", () => {
  assertEquals(isPeriodKeyword("this-week"), true);
  assertEquals(isPeriodKeyword("tw"), true);
  assertEquals(isPeriodKeyword("next-week"), true);
  assertEquals(isPeriodKeyword("nw"), true);
  assertEquals(isPeriodKeyword("last-week"), true);
  assertEquals(isPeriodKeyword("lw"), true);
});

Deno.test("isPeriodKeyword - month keywords", () => {
  assertEquals(isPeriodKeyword("this-month"), true);
  assertEquals(isPeriodKeyword("next-month"), true);
  assertEquals(isPeriodKeyword("last-month"), true);
});

Deno.test("isPeriodKeyword - case insensitive", () => {
  assertEquals(isPeriodKeyword("THIS-WEEK"), true);
  assertEquals(isPeriodKeyword("This-Month"), true);
});

Deno.test("isPeriodKeyword - non-period keywords", () => {
  assertEquals(isPeriodKeyword("today"), false);
  assertEquals(isPeriodKeyword("tomorrow"), false);
  assertEquals(isPeriodKeyword("next-monday"), false);
  assertEquals(isPeriodKeyword("+2w"), false);
  assertEquals(isPeriodKeyword("2025-12-01"), false);
});

// Test: resolvePeriodRange
// Reference date: 2025-12-06 (Saturday) in Asia/Tokyo
Deno.test("resolvePeriodRange - this-week returns Mon-Sun", () => {
  const result = resolvePeriodRange("this-week", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Week containing Saturday 2025-12-06: Mon 2025-12-01 to Sun 2025-12-07
    assertEquals(result.value.from.toString(), "2025-12-01");
    assertEquals(result.value.to.toString(), "2025-12-07");
  }
});

Deno.test("resolvePeriodRange - tw alias works same as this-week", () => {
  const result = resolvePeriodRange("tw", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.from.toString(), "2025-12-01");
    assertEquals(result.value.to.toString(), "2025-12-07");
  }
});

Deno.test("resolvePeriodRange - next-week returns Mon-Sun of next week", () => {
  const result = resolvePeriodRange("next-week", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Next week: Mon 2025-12-08 to Sun 2025-12-14
    assertEquals(result.value.from.toString(), "2025-12-08");
    assertEquals(result.value.to.toString(), "2025-12-14");
  }
});

Deno.test("resolvePeriodRange - last-week returns Mon-Sun of last week", () => {
  const result = resolvePeriodRange("last-week", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // Last week: Mon 2025-11-24 to Sun 2025-11-30
    assertEquals(result.value.from.toString(), "2025-11-24");
    assertEquals(result.value.to.toString(), "2025-11-30");
  }
});

Deno.test("resolvePeriodRange - this-month returns 1st to last day", () => {
  const result = resolvePeriodRange("this-month", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // December 2025: 1st to 31st
    assertEquals(result.value.from.toString(), "2025-12-01");
    assertEquals(result.value.to.toString(), "2025-12-31");
  }
});

Deno.test("resolvePeriodRange - next-month returns 1st to last day of next month", () => {
  const result = resolvePeriodRange("next-month", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // January 2026: 1st to 31st
    assertEquals(result.value.from.toString(), "2026-01-01");
    assertEquals(result.value.to.toString(), "2026-01-31");
  }
});

Deno.test("resolvePeriodRange - last-month returns 1st to last day of last month", () => {
  const result = resolvePeriodRange("last-month", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    // November 2025: 1st to 30th
    assertEquals(result.value.from.toString(), "2025-11-01");
    assertEquals(result.value.to.toString(), "2025-11-30");
  }
});

Deno.test("resolvePeriodRange - February leap year handling", () => {
  // February 2024 is a leap year (29 days)
  const febReference = new Date("2024-02-15T12:00:00Z");
  const result = resolvePeriodRange("this-month", timezone, febReference);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.from.toString(), "2024-02-01");
    assertEquals(result.value.to.toString(), "2024-02-29");
  }
});

Deno.test("resolvePeriodRange - returns error for non-period keywords", () => {
  const result = resolvePeriodRange("today", timezone, referenceDate);
  assertEquals(result.type, "error");
});

Deno.test("resolvePeriodRange - case insensitive", () => {
  const result = resolvePeriodRange("THIS-WEEK", timezone, referenceDate);
  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.from.toString(), "2025-12-01");
    assertEquals(result.value.to.toString(), "2025-12-07");
  }
});
