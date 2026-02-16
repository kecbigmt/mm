import { assertEquals } from "@std/assert";
import {
  createDateDirectory,
  createDirectory,
  createItemDirectory,
  createPermanentDirectory,
  parseDirectory,
  serializeDirectory,
} from "./directory.ts";
import { parseCalendarDay } from "./calendar_day.ts";
import { parseItemId } from "./item_id.ts";
import { Result } from "../../shared/result.ts";

Deno.test("directory.parseDirectory - date head, no section", () => {
  const result = parseDirectory("2025-11-15");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const dir = result.value;
    assertEquals(dir.head.kind, "date");
    if (dir.head.kind === "date") {
      assertEquals(dir.head.date.toString(), "2025-11-15");
    }
    assertEquals(dir.section.length, 0);
  }
});

Deno.test("directory.parseDirectory - date head with sections", () => {
  const result = parseDirectory("2025-11-15/1/3");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const dir = result.value;
    assertEquals(dir.head.kind, "date");
    if (dir.head.kind === "date") {
      assertEquals(dir.head.date.toString(), "2025-11-15");
    }
    assertEquals(dir.section, [1, 3]);
  }
});

Deno.test("directory.parseDirectory - item head, no section", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const result = parseDirectory(uuid);
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const dir = result.value;
    assertEquals(dir.head.kind, "item");
    if (dir.head.kind === "item") {
      assertEquals(dir.head.id.toString(), uuid);
    }
    assertEquals(dir.section.length, 0);
  }
});

Deno.test("directory.parseDirectory - item head with sections", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const result = parseDirectory(`${uuid}/1/3`);
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const dir = result.value;
    assertEquals(dir.head.kind, "item");
    if (dir.head.kind === "item") {
      assertEquals(dir.head.id.toString(), uuid);
    }
    assertEquals(dir.section, [1, 3]);
  }
});

Deno.test("directory.parseDirectory - rejects leading slash", () => {
  const result = parseDirectory("/2025-11-15");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("directory.parseDirectory - rejects empty string", () => {
  const result = parseDirectory("");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "empty");
  }
});

Deno.test("directory.parseDirectory - rejects invalid section (non-numeric)", () => {
  const result = parseDirectory("2025-11-15/foo");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("directory.parseDirectory - rejects invalid section (zero)", () => {
  const result = parseDirectory("2025-11-15/0");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("directory.parseDirectory - rejects invalid section (negative)", () => {
  const result = parseDirectory("2025-11-15/-1");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("directory.serializeDirectory - date head, no section", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const dir = createDateDirectory(date);
  assertEquals(serializeDirectory(dir), "2025-11-15");
});

Deno.test("directory.serializeDirectory - date head with sections", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const dir = createDateDirectory(date, [1, 3]);
  assertEquals(serializeDirectory(dir), "2025-11-15/1/3");
});

Deno.test("directory.serializeDirectory - item head, no section", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const dir = createItemDirectory(id);
  assertEquals(serializeDirectory(dir), uuid);
});

Deno.test("directory.serializeDirectory - item head with sections", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const dir = createItemDirectory(id, [1, 3]);
  assertEquals(serializeDirectory(dir), `${uuid}/1/3`);
});

Deno.test("directory.toString - matches serializeDirectory", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const dir = createDateDirectory(date, [1, 3]);
  assertEquals(dir.toString(), serializeDirectory(dir));
  assertEquals(dir.toString(), "2025-11-15/1/3");
});

Deno.test("directory.toJSON - matches serializeDirectory", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const dir = createItemDirectory(id, [2]);
  assertEquals(dir.toJSON(), serializeDirectory(dir));
  assertEquals(dir.toJSON(), `${uuid}/2`);
});

Deno.test("directory.equals - same date directories", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const p1 = createDateDirectory(date, [1, 3]);
  const p2 = createDateDirectory(date, [1, 3]);
  assertEquals(p1.equals(p2), true);
});

Deno.test("directory.equals - different date directories (different sections)", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const p1 = createDateDirectory(date, [1, 3]);
  const p2 = createDateDirectory(date, [1, 2]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("directory.equals - different date directories (different dates)", () => {
  const date1 = Result.unwrap(parseCalendarDay("2025-11-15"));
  const date2 = Result.unwrap(parseCalendarDay("2025-11-16"));
  const p1 = createDateDirectory(date1, [1]);
  const p2 = createDateDirectory(date2, [1]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("directory.equals - same item directories", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const p1 = createItemDirectory(id, [1]);
  const p2 = createItemDirectory(id, [1]);
  assertEquals(p1.equals(p2), true);
});

Deno.test("directory.equals - different item directories (different ids)", () => {
  const id1 = Result.unwrap(parseItemId("019a85fc-67c4-7a54-be8e-305bae009f9e"));
  const id2 = Result.unwrap(parseItemId("019a85fc-67c4-7a54-be8e-305bae009fa0"));
  const p1 = createItemDirectory(id1, [1]);
  const p2 = createItemDirectory(id2, [1]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("directory.equals - date vs item directory", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const id = Result.unwrap(parseItemId("019a85fc-67c4-7a54-be8e-305bae009f9e"));
  const p1 = createDateDirectory(date);
  const p2 = createItemDirectory(id);
  assertEquals(p1.equals(p2), false);
});

Deno.test("directory.parent - with sections returns parent", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const dir = createDateDirectory(date, [1, 3]);
  const parent = dir.parent();

  assertEquals(parent !== null, true);
  if (parent) {
    assertEquals(parent.head.kind, "date");
    assertEquals(parent.section, [1]);
  }
});

Deno.test("directory.parent - no sections returns null", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const dir = createDateDirectory(date);
  const parent = dir.parent();

  assertEquals(parent, null);
});

Deno.test("directory.parent - single section returns head", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const dir = createItemDirectory(id, [1]);
  const parent = dir.parent();

  assertEquals(parent !== null, true);
  if (parent) {
    assertEquals(parent.head.kind, "item");
    if (parent.head.kind === "item") {
      assertEquals(parent.head.id.toString(), uuid);
    }
    assertEquals(parent.section, []);
  }
});

Deno.test("directory.createDirectory - validates section integers", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  let threw = false;

  try {
    createDirectory({ kind: "date", date }, [1, 0, 3]);
  } catch {
    threw = true;
  }

  assertEquals(threw, true);
});

Deno.test("directory.parseDirectory - roundtrip", () => {
  const original = "2025-11-15/1/3";
  const parsed = Result.unwrap(parseDirectory(original));
  const serialized = serializeDirectory(parsed);
  assertEquals(serialized, original);
});

Deno.test("directory.parseDirectory - accepts existing Directory", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const dir = createDateDirectory(date, [1]);
  const result = parseDirectory(dir);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.equals(dir), true);
  }
});

// Permanent directory tests
Deno.test("directory.parseDirectory - permanent head, no section", () => {
  const result = parseDirectory("permanent");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const dir = result.value;
    assertEquals(dir.head.kind, "permanent");
    assertEquals(dir.section.length, 0);
  }
});

Deno.test("directory.parseDirectory - permanent head with sections", () => {
  const result = parseDirectory("permanent/1/3");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const dir = result.value;
    assertEquals(dir.head.kind, "permanent");
    assertEquals(dir.section, [1, 3]);
  }
});

Deno.test("directory.serializeDirectory - permanent head, no section", () => {
  const dir = createPermanentDirectory();
  assertEquals(serializeDirectory(dir), "permanent");
});

Deno.test("directory.serializeDirectory - permanent head with sections", () => {
  const dir = createPermanentDirectory([1, 3]);
  assertEquals(serializeDirectory(dir), "permanent/1/3");
});

Deno.test("directory.equals - same permanent directories", () => {
  const p1 = createPermanentDirectory([1]);
  const p2 = createPermanentDirectory([1]);
  assertEquals(p1.equals(p2), true);
});

Deno.test("directory.equals - different permanent directories (different sections)", () => {
  const p1 = createPermanentDirectory([1]);
  const p2 = createPermanentDirectory([2]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("directory.equals - permanent vs date directory", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const p1 = createPermanentDirectory();
  const p2 = createDateDirectory(date);
  assertEquals(p1.equals(p2), false);
});

Deno.test("directory.parent - permanent with sections returns parent", () => {
  const dir = createPermanentDirectory([1, 3]);
  const parent = dir.parent();

  assertEquals(parent !== null, true);
  if (parent) {
    assertEquals(parent.head.kind, "permanent");
    assertEquals(parent.section, [1]);
  }
});

Deno.test("directory.parent - permanent no sections returns null", () => {
  const dir = createPermanentDirectory();
  const parent = dir.parent();
  assertEquals(parent, null);
});

Deno.test("directory.parseDirectory - permanent roundtrip", () => {
  const original = "permanent/1/3";
  const parsed = Result.unwrap(parseDirectory(original));
  const serialized = serializeDirectory(parsed);
  assertEquals(serialized, original);
});
