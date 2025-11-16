import { assertEquals } from "@std/assert";
import {
  createDateRange,
  createNumericRange,
  createSingleRange,
  isDateRange,
  isNumericRange,
  isSingleRange,
} from "./placement_range.ts";
import { createDatePlacement, createItemPlacement } from "./placement.ts";
import { parseCalendarDay } from "./calendar_day.ts";
import { parseItemId } from "./item_id.ts";
import { Result } from "../../shared/result.ts";

Deno.test("placement_range.createSingleRange", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date, [1]);
  const range = createSingleRange(placement);

  assertEquals(range.kind, "single");
  assertEquals(isSingleRange(range), true);
  if (isSingleRange(range)) {
    assertEquals(range.at.equals(placement), true);
  }
});

Deno.test("placement_range.createDateRange", () => {
  const from = Result.unwrap(parseCalendarDay("2025-11-15"));
  const to = Result.unwrap(parseCalendarDay("2025-11-30"));
  const range = createDateRange(from, to);

  assertEquals(range.kind, "dateRange");
  assertEquals(isDateRange(range), true);
  if (isDateRange(range)) {
    assertEquals(range.from.toString(), "2025-11-15");
    assertEquals(range.to.toString(), "2025-11-30");
  }
});

Deno.test("placement_range.createNumericRange", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const parent = createItemPlacement(id, [1]);
  const range = createNumericRange(parent, 1, 5);

  assertEquals(range.kind, "numericRange");
  assertEquals(isNumericRange(range), true);
  if (isNumericRange(range)) {
    assertEquals(range.parent.equals(parent), true);
    assertEquals(range.from, 1);
    assertEquals(range.to, 5);
  }
});

Deno.test("placement_range.createNumericRange - validates from", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const parent = createDatePlacement(date);
  let threw = false;

  try {
    createNumericRange(parent, 0, 5);
  } catch {
    threw = true;
  }

  assertEquals(threw, true);
});

Deno.test("placement_range.createNumericRange - validates to", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const parent = createDatePlacement(date);
  let threw = false;

  try {
    createNumericRange(parent, 1, 0);
  } catch {
    threw = true;
  }

  assertEquals(threw, true);
});

Deno.test("placement_range.createNumericRange - validates from <= to", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const parent = createDatePlacement(date);
  let threw = false;

  try {
    createNumericRange(parent, 5, 1);
  } catch {
    threw = true;
  }

  assertEquals(threw, true);
});

Deno.test("placement_range.type guards work correctly", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date);

  const singleRange = createSingleRange(placement);
  assertEquals(isSingleRange(singleRange), true);
  assertEquals(isDateRange(singleRange), false);
  assertEquals(isNumericRange(singleRange), false);

  const from = Result.unwrap(parseCalendarDay("2025-11-15"));
  const to = Result.unwrap(parseCalendarDay("2025-11-30"));
  const dateRange = createDateRange(from, to);
  assertEquals(isSingleRange(dateRange), false);
  assertEquals(isDateRange(dateRange), true);
  assertEquals(isNumericRange(dateRange), false);

  const numericRange = createNumericRange(placement, 1, 5);
  assertEquals(isSingleRange(numericRange), false);
  assertEquals(isDateRange(numericRange), false);
  assertEquals(isNumericRange(numericRange), true);
});
