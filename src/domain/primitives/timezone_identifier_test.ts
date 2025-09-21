import { Result } from "../../shared/result.ts";
import { parseTimezoneIdentifier, timezoneIdentifierFromString } from "./timezone_identifier.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const expectOk = <T, E>(result: Result<T, E>): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseTimezoneIdentifier accepts valid IANA id", () => {
  const tz = expectOk(parseTimezoneIdentifier("Asia/Tokyo"));
  assertEquals(tz.toString(), "Asia/Tokyo");
  assertEquals(tz.toJSON(), "Asia/Tokyo");
});

Deno.test("parseTimezoneIdentifier rejects invalid id", () => {
  const result = parseTimezoneIdentifier("Not/AZone");
  if (result.type !== "error") {
    throw new Error("expected error result");
  }
  assertEquals(result.error.issues[0].code, "timezone");
});

Deno.test("timezoneIdentifierFromString normalizes whitespace", () => {
  const tz = expectOk(timezoneIdentifierFromString("  Europe/London  "));
  assertEquals(tz.toString(), "Europe/London");
});
