import { assertEquals } from "@std/assert";
import {
  createErrorResponse,
  createSuccessResponse,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_METHOD_NOT_FOUND,
} from "./envelope.ts";

Deno.test("createSuccessResponse", async (t) => {
  await t.step("produces a valid JSON-RPC 2.0 success envelope", () => {
    const res = createSuccessResponse(1, { items: ["a", "b"] });

    assertEquals(res.jsonrpc, "2.0");
    assertEquals(res.id, 1);
    assertEquals(res.result, { items: ["a", "b"] });
  });

  await t.step("preserves string id", () => {
    const res = createSuccessResponse("req-42", "ok");

    assertEquals(res.id, "req-42");
    assertEquals(res.result, "ok");
  });

  await t.step("id in response correlates with request id", () => {
    const requestId = 99;
    const res = createSuccessResponse(requestId, null);

    assertEquals(res.id, requestId);
  });
});

Deno.test("createErrorResponse", async (t) => {
  await t.step("produces a valid JSON-RPC 2.0 error envelope", () => {
    const res = createErrorResponse(1, JSON_RPC_METHOD_NOT_FOUND, "Method not found");

    assertEquals(res.jsonrpc, "2.0");
    assertEquals(res.id, 1);
    assertEquals(res.error.code, JSON_RPC_METHOD_NOT_FOUND);
    assertEquals(res.error.message, "Method not found");
    assertEquals(res.error.data, undefined);
  });

  await t.step("includes optional data field when provided", () => {
    const data = { detail: "extra info" };
    const res = createErrorResponse(2, JSON_RPC_INTERNAL_ERROR, "Internal error", data);

    assertEquals(res.error.data, data);
  });

  await t.step("allows null id for parse errors", () => {
    const res = createErrorResponse(null, -32700, "Parse error");

    assertEquals(res.id, null);
  });

  await t.step("id in error response correlates with request id", () => {
    const requestId = "abc";
    const res = createErrorResponse(requestId, -32600, "Invalid Request");

    assertEquals(res.id, requestId);
  });
});
