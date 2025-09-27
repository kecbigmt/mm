import { assert, assertEquals } from "@std/assert";
import { parsePath } from "./path.ts";
import { parsePathSegment } from "./path_segment.ts";

denoTest("parsePath parses absolute paths", () => {
  const result = parsePath("/2024-09-21/019965a7-2789-740a-b8c1-1415904fd108/1");
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  const path = result.value;
  assertEquals(path.toString(), "/2024-09-21/019965a7-2789-740a-b8c1-1415904fd108/1");
  assert(!path.isRange());
});

denoTest("parsePath resolves relative segments with cwd", () => {
  const base = parsePath("/2024-09-21/019965a7-2789-740a-b8c1-1415904fd108/1");
  if (base.type !== "ok") {
    throw new Error("expected base path");
  }

  const resultDot = parsePath("./2", { cwd: base.value });
  if (resultDot.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(resultDot.error)}`);
  }
  assertEquals(resultDot.value.toString(), "/2024-09-21/019965a7-2789-740a-b8c1-1415904fd108/1/2");

  const resultDotDot = parsePath("../2", { cwd: base.value });
  if (resultDotDot.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(resultDotDot.error)}`);
  }
  assertEquals(resultDotDot.value.toString(), "/2024-09-21/019965a7-2789-740a-b8c1-1415904fd108/2");
});

denoTest("parsePath resolves today keyword when today provided", () => {
  const today = new Date(Date.UTC(2024, 8, 21));
  const base = parsePath("/");
  if (base.type !== "ok") {
    throw new Error("expected base path");
  }
  const result = parsePath("today", { today, cwd: base.value });
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assertEquals(result.value.toString(), "/2024-09-21");
});

denoTest("parsePath detects range segments", () => {
  const result = parsePath("/2024-09-21/1..3");
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  const path = result.value;
  assert(path.isRange(), "expected range path");
  const parent = path.parent();
  if (!parent) {
    throw new Error("expected parent to exist");
  }
  const childResult = parsePathSegment("4");
  if (childResult.type !== "ok") {
    throw new Error("expected child segment");
  }
  const next = parent.appendSegment(childResult.value);
  assertEquals(next.toString(), "/2024-09-21/4");
});

function denoTest(name: string, fn: () => void): void {
  Deno.test(name, fn);
}
