import { assertEquals } from "@std/assert";
import {
  createDatePlacement,
  createItemPlacement,
  createPermanentPlacement,
  createPlacement,
  parsePlacement,
  serializePlacement,
} from "./placement.ts";
import { parseCalendarDay } from "./calendar_day.ts";
import { parseItemId } from "./item_id.ts";
import { Result } from "../../shared/result.ts";

Deno.test("placement.parsePlacement - date head, no section", () => {
  const result = parsePlacement("2025-11-15");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const placement = result.value;
    assertEquals(placement.head.kind, "date");
    if (placement.head.kind === "date") {
      assertEquals(placement.head.date.toString(), "2025-11-15");
    }
    assertEquals(placement.section.length, 0);
  }
});

Deno.test("placement.parsePlacement - date head with sections", () => {
  const result = parsePlacement("2025-11-15/1/3");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const placement = result.value;
    assertEquals(placement.head.kind, "date");
    if (placement.head.kind === "date") {
      assertEquals(placement.head.date.toString(), "2025-11-15");
    }
    assertEquals(placement.section, [1, 3]);
  }
});

Deno.test("placement.parsePlacement - item head, no section", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const result = parsePlacement(uuid);
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const placement = result.value;
    assertEquals(placement.head.kind, "item");
    if (placement.head.kind === "item") {
      assertEquals(placement.head.id.toString(), uuid);
    }
    assertEquals(placement.section.length, 0);
  }
});

Deno.test("placement.parsePlacement - item head with sections", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const result = parsePlacement(`${uuid}/1/3`);
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const placement = result.value;
    assertEquals(placement.head.kind, "item");
    if (placement.head.kind === "item") {
      assertEquals(placement.head.id.toString(), uuid);
    }
    assertEquals(placement.section, [1, 3]);
  }
});

Deno.test("placement.parsePlacement - rejects leading slash", () => {
  const result = parsePlacement("/2025-11-15");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("placement.parsePlacement - rejects empty string", () => {
  const result = parsePlacement("");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "empty");
  }
});

Deno.test("placement.parsePlacement - rejects invalid section (non-numeric)", () => {
  const result = parsePlacement("2025-11-15/foo");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("placement.parsePlacement - rejects invalid section (zero)", () => {
  const result = parsePlacement("2025-11-15/0");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("placement.parsePlacement - rejects invalid section (negative)", () => {
  const result = parsePlacement("2025-11-15/-1");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "format");
  }
});

Deno.test("placement.serializePlacement - date head, no section", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date);
  assertEquals(serializePlacement(placement), "2025-11-15");
});

Deno.test("placement.serializePlacement - date head with sections", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date, [1, 3]);
  assertEquals(serializePlacement(placement), "2025-11-15/1/3");
});

Deno.test("placement.serializePlacement - item head, no section", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const placement = createItemPlacement(id);
  assertEquals(serializePlacement(placement), uuid);
});

Deno.test("placement.serializePlacement - item head with sections", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const placement = createItemPlacement(id, [1, 3]);
  assertEquals(serializePlacement(placement), `${uuid}/1/3`);
});

Deno.test("placement.toString - matches serializePlacement", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date, [1, 3]);
  assertEquals(placement.toString(), serializePlacement(placement));
  assertEquals(placement.toString(), "2025-11-15/1/3");
});

Deno.test("placement.toJSON - matches serializePlacement", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const placement = createItemPlacement(id, [2]);
  assertEquals(placement.toJSON(), serializePlacement(placement));
  assertEquals(placement.toJSON(), `${uuid}/2`);
});

Deno.test("placement.equals - same date placements", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const p1 = createDatePlacement(date, [1, 3]);
  const p2 = createDatePlacement(date, [1, 3]);
  assertEquals(p1.equals(p2), true);
});

Deno.test("placement.equals - different date placements (different sections)", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const p1 = createDatePlacement(date, [1, 3]);
  const p2 = createDatePlacement(date, [1, 2]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("placement.equals - different date placements (different dates)", () => {
  const date1 = Result.unwrap(parseCalendarDay("2025-11-15"));
  const date2 = Result.unwrap(parseCalendarDay("2025-11-16"));
  const p1 = createDatePlacement(date1, [1]);
  const p2 = createDatePlacement(date2, [1]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("placement.equals - same item placements", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const p1 = createItemPlacement(id, [1]);
  const p2 = createItemPlacement(id, [1]);
  assertEquals(p1.equals(p2), true);
});

Deno.test("placement.equals - different item placements (different ids)", () => {
  const id1 = Result.unwrap(parseItemId("019a85fc-67c4-7a54-be8e-305bae009f9e"));
  const id2 = Result.unwrap(parseItemId("019a85fc-67c4-7a54-be8e-305bae009fa0"));
  const p1 = createItemPlacement(id1, [1]);
  const p2 = createItemPlacement(id2, [1]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("placement.equals - date vs item placement", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const id = Result.unwrap(parseItemId("019a85fc-67c4-7a54-be8e-305bae009f9e"));
  const p1 = createDatePlacement(date);
  const p2 = createItemPlacement(id);
  assertEquals(p1.equals(p2), false);
});

Deno.test("placement.parent - with sections returns parent", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date, [1, 3]);
  const parent = placement.parent();

  assertEquals(parent !== null, true);
  if (parent) {
    assertEquals(parent.head.kind, "date");
    assertEquals(parent.section, [1]);
  }
});

Deno.test("placement.parent - no sections returns null", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date);
  const parent = placement.parent();

  assertEquals(parent, null);
});

Deno.test("placement.parent - single section returns head", () => {
  const uuid = "019a85fc-67c4-7a54-be8e-305bae009f9e";
  const id = Result.unwrap(parseItemId(uuid));
  const placement = createItemPlacement(id, [1]);
  const parent = placement.parent();

  assertEquals(parent !== null, true);
  if (parent) {
    assertEquals(parent.head.kind, "item");
    if (parent.head.kind === "item") {
      assertEquals(parent.head.id.toString(), uuid);
    }
    assertEquals(parent.section, []);
  }
});

Deno.test("placement.createPlacement - validates section integers", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  let threw = false;

  try {
    createPlacement({ kind: "date", date }, [1, 0, 3]);
  } catch {
    threw = true;
  }

  assertEquals(threw, true);
});

Deno.test("placement.parsePlacement - roundtrip", () => {
  const original = "2025-11-15/1/3";
  const parsed = Result.unwrap(parsePlacement(original));
  const serialized = serializePlacement(parsed);
  assertEquals(serialized, original);
});

Deno.test("placement.parsePlacement - accepts existing Placement", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const placement = createDatePlacement(date, [1]);
  const result = parsePlacement(placement);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.equals(placement), true);
  }
});

// Permanent placement tests
Deno.test("placement.parsePlacement - permanent head, no section", () => {
  const result = parsePlacement("permanent");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const placement = result.value;
    assertEquals(placement.head.kind, "permanent");
    assertEquals(placement.section.length, 0);
  }
});

Deno.test("placement.parsePlacement - permanent head with sections", () => {
  const result = parsePlacement("permanent/1/3");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const placement = result.value;
    assertEquals(placement.head.kind, "permanent");
    assertEquals(placement.section, [1, 3]);
  }
});

Deno.test("placement.serializePlacement - permanent head, no section", () => {
  const placement = createPermanentPlacement();
  assertEquals(serializePlacement(placement), "permanent");
});

Deno.test("placement.serializePlacement - permanent head with sections", () => {
  const placement = createPermanentPlacement([1, 3]);
  assertEquals(serializePlacement(placement), "permanent/1/3");
});

Deno.test("placement.equals - same permanent placements", () => {
  const p1 = createPermanentPlacement([1]);
  const p2 = createPermanentPlacement([1]);
  assertEquals(p1.equals(p2), true);
});

Deno.test("placement.equals - different permanent placements (different sections)", () => {
  const p1 = createPermanentPlacement([1]);
  const p2 = createPermanentPlacement([2]);
  assertEquals(p1.equals(p2), false);
});

Deno.test("placement.equals - permanent vs date placement", () => {
  const date = Result.unwrap(parseCalendarDay("2025-11-15"));
  const p1 = createPermanentPlacement();
  const p2 = createDatePlacement(date);
  assertEquals(p1.equals(p2), false);
});

Deno.test("placement.parent - permanent with sections returns parent", () => {
  const placement = createPermanentPlacement([1, 3]);
  const parent = placement.parent();

  assertEquals(parent !== null, true);
  if (parent) {
    assertEquals(parent.head.kind, "permanent");
    assertEquals(parent.section, [1]);
  }
});

Deno.test("placement.parent - permanent no sections returns null", () => {
  const placement = createPermanentPlacement();
  const parent = placement.parent();
  assertEquals(parent, null);
});

Deno.test("placement.parsePlacement - permanent roundtrip", () => {
  const original = "permanent/1/3";
  const parsed = Result.unwrap(parsePlacement(original));
  const serialized = serializePlacement(parsed);
  assertEquals(serialized, original);
});
