import { assert, assertEquals } from "@std/assert";
import { parsePathSegment } from "./path_segment.ts";

Deno.test("parsePathSegment parses date segments", () => {
  const result = parsePathSegment("2024-09-21");
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assertEquals(result.value.kind, "Date");
  assertEquals(result.value.toString(), "2024-09-21");
});

Deno.test("parsePathSegment parses numeric segments", () => {
  const result = parsePathSegment("12");
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assertEquals(result.value.kind, "Numeric");
  assertEquals(result.value.value, 12);
});

Deno.test("parsePathSegment parses item segments", () => {
  const result = parsePathSegment("019965a7-2789-740a-b8c1-1415904fd108");
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assertEquals(result.value.kind, "ItemId");
  assertEquals(result.value.toString(), "019965a7-2789-740a-b8c1-1415904fd108");
});

Deno.test("parsePathSegment parses alias segments", () => {
  const result = parsePathSegment("focus-notes");
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assertEquals(result.value.kind, "ItemAlias");
  assertEquals(result.value.toString(), "focus-notes");
});

Deno.test("parsePathSegment rejects invalid aliases", () => {
  const result = parsePathSegment("invalid segment !");
  if (result.type !== "error") {
    throw new Error("expected error");
  }
  assert(result.error.issues.length > 0);
});
