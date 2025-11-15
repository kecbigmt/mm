import { assertEquals } from "@std/assert";
import { parsePathExpression, parseRangeExpression } from "./path_expression.ts";

Deno.test("path_expression.parsePathExpression - absolute path", () => {
  const result = parsePathExpression("/2025-11-15");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, true);
    assertEquals(expr.segments.length, 1);
    assertEquals(expr.segments[0].kind, "relativeDate");
    if (expr.segments[0].kind === "relativeDate") {
      assertEquals(expr.segments[0].expr, "2025-11-15");
    }
  }
});

Deno.test("path_expression.parsePathExpression - relative path", () => {
  const result = parsePathExpression("today");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, false);
    assertEquals(expr.segments.length, 1);
    assertEquals(expr.segments[0].kind, "relativeDate");
    if (expr.segments[0].kind === "relativeDate") {
      assertEquals(expr.segments[0].expr, "today");
    }
  }
});

Deno.test("path_expression.parsePathExpression - dot token", () => {
  const result = parsePathExpression(".");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, false);
    assertEquals(expr.segments.length, 1);
    assertEquals(expr.segments[0].kind, "dot");
  }
});

Deno.test("path_expression.parsePathExpression - dotdot token", () => {
  const result = parsePathExpression("..");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, false);
    assertEquals(expr.segments.length, 1);
    assertEquals(expr.segments[0].kind, "dotdot");
  }
});

Deno.test("path_expression.parsePathExpression - numeric token", () => {
  const result = parsePathExpression("1");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, false);
    assertEquals(expr.segments.length, 1);
    assertEquals(expr.segments[0].kind, "numeric");
    if (expr.segments[0].kind === "numeric") {
      assertEquals(expr.segments[0].value, 1);
    }
  }
});

Deno.test("path_expression.parsePathExpression - idOrAlias token", () => {
  const result = parsePathExpression("book");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, false);
    assertEquals(expr.segments.length, 1);
    assertEquals(expr.segments[0].kind, "idOrAlias");
    if (expr.segments[0].kind === "idOrAlias") {
      assertEquals(expr.segments[0].value, "book");
    }
  }
});

Deno.test("path_expression.parsePathExpression - complex path", () => {
  const result = parsePathExpression("../book/1");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.isAbsolute, false);
    assertEquals(expr.segments.length, 3);

    assertEquals(expr.segments[0].kind, "dotdot");

    assertEquals(expr.segments[1].kind, "idOrAlias");
    if (expr.segments[1].kind === "idOrAlias") {
      assertEquals(expr.segments[1].value, "book");
    }

    assertEquals(expr.segments[2].kind, "numeric");
    if (expr.segments[2].kind === "numeric") {
      assertEquals(expr.segments[2].value, 1);
    }
  }
});

Deno.test("path_expression.parsePathExpression - relative date tokens", () => {
  const cases = [
    { input: "today", expected: "today" },
    { input: "td", expected: "td" },
    { input: "tomorrow", expected: "tomorrow" },
    { input: "tm", expected: "tm" },
    { input: "yesterday", expected: "yesterday" },
    { input: "yd", expected: "yd" },
    { input: "+2w", expected: "+2w" },
    { input: "~mon", expected: "~mon" },
    { input: "+fri", expected: "+fri" },
  ];

  for (const { input, expected } of cases) {
    const result = parsePathExpression(input);
    assertEquals(result.type, "ok", `Failed to parse: ${input}`);

    if (result.type === "ok") {
      assertEquals(result.value.segments.length, 1);
      assertEquals(result.value.segments[0].kind, "relativeDate");
      if (result.value.segments[0].kind === "relativeDate") {
        assertEquals(result.value.segments[0].expr, expected);
      }
    }
  }
});

Deno.test("path_expression.parsePathExpression - empty string", () => {
  const result = parsePathExpression("");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "empty");
  }
});

Deno.test("path_expression.parsePathExpression - non-string", () => {
  const result = parsePathExpression(123);
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "type");
  }
});

Deno.test("range_expression.parseRangeExpression - single path", () => {
  const result = parseRangeExpression("2025-11-15");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.kind, "single");
    if (expr.kind === "single") {
      assertEquals(expr.path.segments.length, 1);
      assertEquals(expr.path.segments[0].kind, "relativeDate");
    }
  }
});

Deno.test("range_expression.parseRangeExpression - date range", () => {
  const result = parseRangeExpression("2025-11-15..2025-11-30");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.kind, "range");
    if (expr.kind === "range") {
      assertEquals(expr.from.segments.length, 1);
      assertEquals(expr.from.segments[0].kind, "relativeDate");
      if (expr.from.segments[0].kind === "relativeDate") {
        assertEquals(expr.from.segments[0].expr, "2025-11-15");
      }

      assertEquals(expr.to.segments.length, 1);
      assertEquals(expr.to.segments[0].kind, "relativeDate");
      if (expr.to.segments[0].kind === "relativeDate") {
        assertEquals(expr.to.segments[0].expr, "2025-11-30");
      }
    }
  }
});

Deno.test("range_expression.parseRangeExpression - numeric range", () => {
  const result = parseRangeExpression("1..5");
  assertEquals(result.type, "ok");

  if (result.type === "ok") {
    const expr = result.value;
    assertEquals(expr.kind, "range");
    if (expr.kind === "range") {
      assertEquals(expr.from.segments.length, 1);
      assertEquals(expr.from.segments[0].kind, "numeric");
      if (expr.from.segments[0].kind === "numeric") {
        assertEquals(expr.from.segments[0].value, 1);
      }

      assertEquals(expr.to.segments.length, 1);
      assertEquals(expr.to.segments[0].kind, "numeric");
      if (expr.to.segments[0].kind === "numeric") {
        assertEquals(expr.to.segments[0].value, 5);
      }
    }
  }
});

Deno.test("range_expression.parseRangeExpression - empty string", () => {
  const result = parseRangeExpression("");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "empty");
  }
});

Deno.test("range_expression.parseRangeExpression - empty range start", () => {
  const result = parseRangeExpression("..5");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "empty");
  }
});

Deno.test("range_expression.parseRangeExpression - empty range end", () => {
  const result = parseRangeExpression("1..");
  assertEquals(result.type, "error");

  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "empty");
  }
});
