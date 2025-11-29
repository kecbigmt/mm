import { assertEquals, assertStringIncludes } from "@std/assert";
import { stripAnsiCode } from "@std/fmt/colors";
import { formatError } from "./error_formatter.ts";
import { createValidationError, createValidationIssue } from "../../shared/errors.ts";

Deno.test("formatError - ValidationError in normal mode", () => {
  const error = createValidationError(
    "TestObject",
    [createValidationIssue("field is required", { path: ["field"], code: "required" })],
  );

  const result = formatError(error, false);
  const clean = stripAnsiCode(result);

  // Should contain "error:" prefix (without color codes in assertion)
  assertStringIncludes(clean, "error:");
  // Should contain the user-friendly message
  assertStringIncludes(clean, "field is required");
  // Should NOT contain technical details like "ValidationError" or "code:"
  assertEquals(clean.includes("ValidationError"), false);
  assertEquals(clean.includes("code:"), false);
});

Deno.test("formatError - ValidationError in debug mode", () => {
  const error = createValidationError(
    "TestObject",
    [createValidationIssue("field is required", { path: ["field"], code: "required" })],
  );

  const result = formatError(error, true);

  // Should contain technical details
  assertStringIncludes(result, "ValidationError");
  assertStringIncludes(result, "TestObject");
  assertStringIncludes(result, "code: required");
  // Should NOT have "error:" prefix in debug mode
  assertEquals(result.startsWith("error:"), false);
});

Deno.test("formatError - ValidationError with multiple issues in normal mode", () => {
  const error = createValidationError("TestObject", [
    createValidationIssue("field1 is required", { path: ["field1"], code: "required" }),
    createValidationIssue("field2 must be positive", { path: ["field2"], code: "min_value" }),
  ]);

  const result = formatError(error, false);

  // Should contain both messages
  assertStringIncludes(result, "field1 is required");
  assertStringIncludes(result, "field2 must be positive");
  // Should NOT contain codes
  assertEquals(result.includes("code:"), false);
});

Deno.test("formatError - ValidationError with no issues in normal mode", () => {
  const error = createValidationError("TestObject", [], {
    message: "Generic validation error",
  });

  const result = formatError(error, false);
  const clean = stripAnsiCode(result);

  // Should show the generic message
  assertStringIncludes(clean, "error:");
  assertStringIncludes(clean, "Generic validation error");
});

Deno.test("formatError - Error object in normal mode", () => {
  const error = new Error("Something went wrong");

  const result = formatError(error, false);
  const clean = stripAnsiCode(result);

  // Should show generic message in normal mode
  assertStringIncludes(clean, "error:");
  assertStringIncludes(clean, "An unexpected error occurred");
  // Should NOT expose the internal error message
  assertEquals(clean.includes("Something went wrong"), false);
});

Deno.test("formatError - Error object in debug mode", () => {
  const error = new Error("Something went wrong");

  const result = formatError(error, true);

  // Should show the actual error message in debug mode
  assertStringIncludes(result, "Something went wrong");
  // Should NOT have "error:" prefix
  assertEquals(result.includes("error:"), false);
});

Deno.test("formatError - string error in normal mode", () => {
  const error = "Plain string error";

  const result = formatError(error, false);
  const clean = stripAnsiCode(result);

  // Should show generic message
  assertStringIncludes(clean, "error:");
  assertStringIncludes(clean, "An unexpected error occurred");
  assertEquals(clean.includes("Plain string error"), false);
});

Deno.test("formatError - string error in debug mode", () => {
  const error = "Plain string error";

  const result = formatError(error, true);

  // Should show the actual string in debug mode
  assertEquals(result, "Plain string error");
});

Deno.test("formatError - object with toString in debug mode", () => {
  const error = {
    toString() {
      return "Custom error representation";
    },
  };

  const result = formatError(error, true);

  assertStringIncludes(result, "Custom error representation");
});

Deno.test("formatError - default isDebug parameter", () => {
  const error = createValidationError(
    "TestObject",
    [createValidationIssue("field is required", { path: ["field"], code: "required" })],
  );

  // Should default to normal mode (isDebug = false)
  const result = formatError(error);
  const clean = stripAnsiCode(result);

  assertStringIncludes(clean, "error:");
  assertStringIncludes(clean, "field is required");
  assertEquals(clean.includes("ValidationError"), false);
});
