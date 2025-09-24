import { assertEquals } from "@std/assert";
import { parseSectionSegment } from "./section_segment.ts";

const expectOk = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseSectionSegment parses numeric segments", () => {
  const segment = expectOk(parseSectionSegment("42"));
  assertEquals(segment.kind, "numeric");
  assertEquals(segment.raw, "42");
  assertEquals(segment.value, 42);
});

Deno.test("parseSectionSegment parses date segments", () => {
  const segment = expectOk(parseSectionSegment("2025-09-22"));
  assertEquals(segment.kind, "date");
  assertEquals(segment.raw, "2025-09-22");
  assertEquals(segment.value.toString(), "2025-09-22");
});

Deno.test("parseSectionSegment rejects invalid segments", () => {
  const result = parseSectionSegment("00");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].code, "format");
});

Deno.test("parseSectionSegment propagates calendar errors", () => {
  const result = parseSectionSegment("2025-02-30");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].path[0], "raw");
});
