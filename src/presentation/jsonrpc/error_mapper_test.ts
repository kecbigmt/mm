import { assertEquals } from "@std/assert";
import { createValidationError, createValidationIssue } from "../../shared/errors.ts";
import { createRepositoryError } from "../../domain/repositories/repository_error.ts";
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_REPOSITORY_ERROR,
  JSON_RPC_VALIDATION_ERROR,
} from "./envelope.ts";
import { mapErrorToJsonRpc } from "./error_mapper.ts";

Deno.test("mapErrorToJsonRpc", async (t) => {
  await t.step("maps ValidationError to JSON_RPC_VALIDATION_ERROR", () => {
    const issue = createValidationIssue("must be non-empty", { path: ["title"] });
    const validationErr = createValidationError("Item", [issue]);

    const res = mapErrorToJsonRpc(1, validationErr);

    assertEquals(res.jsonrpc, "2.0");
    assertEquals(res.id, 1);
    assertEquals(res.error.code, JSON_RPC_VALIDATION_ERROR);
    assertEquals(res.error.message, "Item is invalid");

    const data = res.error.data as { objectKind: string; issues: unknown[] };
    assertEquals(data.objectKind, "Item");
    assertEquals(data.issues.length, 1);
  });

  await t.step("maps RepositoryError to JSON_RPC_REPOSITORY_ERROR", () => {
    const repoErr = createRepositoryError("item", "load", "not found", {
      identifier: "item-123",
    });

    const res = mapErrorToJsonRpc(2, repoErr);

    assertEquals(res.error.code, JSON_RPC_REPOSITORY_ERROR);
    assertEquals(res.error.message, "not found");

    const data = res.error.data as { scope: string; operation: string; identifier: string };
    assertEquals(data.scope, "item");
    assertEquals(data.operation, "load");
    assertEquals(data.identifier, "item-123");
  });

  await t.step("maps unknown errors to JSON_RPC_INTERNAL_ERROR", () => {
    const res = mapErrorToJsonRpc(3, new Error("boom"));

    assertEquals(res.error.code, JSON_RPC_INTERNAL_ERROR);
    assertEquals(res.error.message, "boom");
  });

  await t.step("maps non-Error unknowns to JSON_RPC_INTERNAL_ERROR with default message", () => {
    const res = mapErrorToJsonRpc(null, "something weird");

    assertEquals(res.error.code, JSON_RPC_INTERNAL_ERROR);
    assertEquals(res.error.message, "Internal error");
    assertEquals(res.id, null);
  });
});
