import { assertEquals } from "@std/assert";
import { type FutureDateTimeParseOptions, parseFutureDateTime } from "./future_date_time.ts";
import { timezoneIdentifierFromString } from "../../../domain/primitives/timezone_identifier.ts";

Deno.test("parseFutureDateTime", async (t) => {
  const referenceDate = new Date("2025-12-02T10:00:00Z");
  const timezoneResult = timezoneIdentifierFromString("Asia/Tokyo");
  if (timezoneResult.type === "error") {
    throw new Error("Failed to parse timezone");
  }
  const timezone = timezoneResult.value;
  const baseOptions: FutureDateTimeParseOptions = {
    referenceDate,
    timezone,
  };

  await t.step("parses duration format", () => {
    const result = parseFutureDateTime("8h", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // 8 hours from reference date
      assertEquals(result.value.toString(), "2025-12-02T18:00:00.000Z");
    }
  });

  await t.step("parses duration with minutes", () => {
    const result = parseFutureDateTime("1h30m", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // 1.5 hours from reference date
      assertEquals(result.value.toString(), "2025-12-02T11:30:00.000Z");
    }
  });

  await t.step("parses ISO 8601 datetime with timezone", () => {
    const result = parseFutureDateTime("2025-12-03T15:00:00+09:00", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.toString(), "2025-12-03T06:00:00.000Z");
    }
  });

  await t.step("parses ISO 8601 datetime without timezone", () => {
    const result = parseFutureDateTime("2025-12-03T15:00", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // Should use workspace timezone (Asia/Tokyo = UTC+9)
      assertEquals(result.value.toString(), "2025-12-03T06:00:00.000Z");
    }
  });

  await t.step("parses date (sets to 00:00 in workspace timezone)", () => {
    const result = parseFutureDateTime("2025-12-03", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // 2025-12-03 00:00 in Asia/Tokyo = 2025-12-02 15:00 UTC
      assertEquals(result.value.toString(), "2025-12-02T15:00:00.000Z");
    }
  });

  await t.step("parses time-only format (past time → tomorrow)", () => {
    const result = parseFutureDateTime("15:00", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // Reference is 2025-12-02T10:00:00Z = 2025-12-02 19:00 JST
      // 15:00 JST today would be 2025-12-02T06:00:00Z, which is in the past
      // So it should be tomorrow 15:00 JST = 2025-12-03T06:00:00Z
      assertEquals(result.value.toString(), "2025-12-03T06:00:00.000Z");
    }
  });

  await t.step("parses time-only format (future time → today)", () => {
    const result = parseFutureDateTime("20:00", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // Reference is 2025-12-02T10:00:00Z = 2025-12-02 19:00 JST
      // 20:00 JST today would be 2025-12-02T11:00:00Z, which is in the future
      // So it should be today 20:00 JST
      assertEquals(result.value.toString(), "2025-12-02T11:00:00.000Z");
    }
  });

  await t.step("parses relative date 'tomorrow'", () => {
    const result = parseFutureDateTime("tomorrow", baseOptions);
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      // Reference is 2025-12-02T10:00:00Z = 2025-12-02 19:00 JST
      // Tomorrow in Asia/Tokyo is 2025-12-03
      // 2025-12-03 00:00 JST = 2025-12-02 15:00 UTC
      assertEquals(result.value.toString(), "2025-12-02T15:00:00.000Z");
    }
  });

  await t.step("rejects 'today' (past time)", () => {
    // Today 00:00 is in the past when reference is 10:00, so should be rejected
    const result = parseFutureDateTime("today", baseOptions);
    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "ValidationError");
      assertEquals(result.error.objectKind, "FutureDateTime");
    }
  });

  await t.step("rejects past datetime", () => {
    const result = parseFutureDateTime("2025-12-01T10:00:00Z", baseOptions);
    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "ValidationError");
      assertEquals(result.error.objectKind, "FutureDateTime");
      assertEquals(result.error.issues.length, 1);
      assertEquals(
        result.error.issues[0].message,
        "Datetime must be in the future",
      );
    }
  });

  await t.step("rejects 'yesterday' (past date)", () => {
    const result = parseFutureDateTime("yesterday", baseOptions);
    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "ValidationError");
      assertEquals(result.error.objectKind, "FutureDateTime");
      assertEquals(result.error.issues.length, 1);
      assertEquals(
        result.error.issues[0].message,
        "Datetime must be in the future",
      );
    }
  });

  await t.step("rejects invalid format", () => {
    const result = parseFutureDateTime("invalid", baseOptions);
    assertEquals(result.type, "error");
  });
});
