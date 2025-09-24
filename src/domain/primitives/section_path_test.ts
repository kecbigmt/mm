import { assertEquals } from "@std/assert";
import { parseSectionPath } from "./section_path.ts";

const expectOk = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseSectionPath parses numeric paths", () => {
  const path = expectOk(parseSectionPath(":1-2-3"));
  assertEquals(path.mode, "numeric");
  assertEquals(path.segments.length, 3);
  assertEquals(path.segments[0].kind, "numeric");
  assertEquals(path.segments[0].value, 1);
  assertEquals(path.toString(), ":1-2-3");
});

Deno.test("parseSectionPath parses date paths", () => {
  const path = expectOk(parseSectionPath(":2025-09-22"));
  assertEquals(path.mode, "date");
  assertEquals(path.segments.length, 1);
  assertEquals(path.segments[0].kind, "date");
  assertEquals(path.segments[0].value.toString(), "2025-09-22");
});

Deno.test("parseSectionPath rejects missing colon", () => {
  const result = parseSectionPath("1-2");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].code, "format");
});

Deno.test("parseSectionPath rejects invalid numeric segment", () => {
  const result = parseSectionPath(":1-02");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].path[0], "segments");
});

Deno.test("parseSectionPath rejects invalid date", () => {
  const result = parseSectionPath(":2025-02-30");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assertEquals(result.error.issues[0].path[0], "segments");
});
