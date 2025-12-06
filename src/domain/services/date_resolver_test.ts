import { assertEquals } from "@std/assert";
import { isDateExpression, resolveRelativeDate } from "./date_resolver.ts";
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
