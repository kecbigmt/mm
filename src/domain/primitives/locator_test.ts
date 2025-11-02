import { assert, assertEquals } from "@std/assert";
import { parseLocator } from "./locator.ts";
import { parsePath } from "./path.ts";

const today = new Date(Date.UTC(2024, 8, 18)); // 2024-09-18

const basePath = (() => {
  const result = parsePath("/");
  if (result.type !== "ok") {
    throw new Error("expected base path");
  }
  return result.value;
})();

function denoTest(name: string, fn: () => void | Promise<void>): void {
  Deno.test(name, fn);
}

denoTest("parseLocator parses date head with relative weekday range", () => {
  const result = parseLocator("~mon..+fri", { today, cwd: basePath });
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assert(result.value.isRange());
  const range = result.value.range!;
  assertEquals(range.kind, "date");
  assertEquals(range.start.value.toString(), "2024-09-16");
  assertEquals(range.end.value.toString(), "2024-09-20");
});

denoTest("parseLocator parses numeric ranges under items", () => {
  const result = parseLocator("note/1..3", { cwd: basePath });
  if (result.type !== "ok") {
    throw new Error(`expected ok, received ${JSON.stringify(result.error)}`);
  }
  assert(result.value.isRange());
  const range = result.value.range!;
  assertEquals(range.kind, "numeric");
  assertEquals(range.start.value, 1);
  assertEquals(range.end.value, 3);
});

denoTest("parseLocator rejects date segments that are not head", () => {
  const result = parseLocator("note/2024-09-18", { cwd: basePath });
  if (result.type !== "error") {
    throw new Error("expected error for non-head date segment");
  }
});

denoTest("parseLocator rejects descending numeric ranges", () => {
  const result = parseLocator("note/5..2", { cwd: basePath });
  if (result.type !== "error") {
    throw new Error("expected error for descending numeric range");
  }
});

denoTest("parseLocator rejects date ranges outside head", () => {
  const result = parseLocator("note/~mon..+fri", { today, cwd: basePath });
  if (result.type !== "error") {
    throw new Error("expected error for date range outside head");
  }
});
