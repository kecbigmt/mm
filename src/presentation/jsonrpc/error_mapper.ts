import { isValidationError } from "../../shared/errors.ts";
import { isRepositoryError } from "../../domain/repositories/repository_error.ts";
import type { CoreDependencyError } from "../../application/runtime.ts";
import {
  createErrorResponse,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_REPOSITORY_ERROR,
  JSON_RPC_VALIDATION_ERROR,
  JSON_RPC_WORKSPACE_ERROR,
  type JsonRpcErrorResponse,
  type JsonRpcId,
} from "./envelope.ts";

const isCoreDependencyError = (value: unknown): value is CoreDependencyError =>
  typeof value === "object" && value !== null && "type" in value &&
  ((value as CoreDependencyError).type === "workspace" ||
    (value as CoreDependencyError).type === "repository");

/**
 * Map a domain error to a JSON-RPC error response.
 * Recognizes ValidationError, RepositoryError, and CoreDependencyError;
 * everything else becomes an internal error.
 */
export const mapErrorToJsonRpc = (
  id: JsonRpcId | null,
  error: unknown,
): JsonRpcErrorResponse => {
  if (isValidationError(error)) {
    return createErrorResponse(
      id,
      JSON_RPC_VALIDATION_ERROR,
      error.message,
      { objectKind: error.objectKind, issues: error.issues },
    );
  }

  if (isRepositoryError(error)) {
    return createErrorResponse(
      id,
      JSON_RPC_REPOSITORY_ERROR,
      error.message,
      { scope: error.scope, operation: error.operation, identifier: error.identifier },
    );
  }

  if (isCoreDependencyError(error)) {
    if (error.type === "workspace") {
      return createErrorResponse(id, JSON_RPC_WORKSPACE_ERROR, error.message);
    }
    return createErrorResponse(
      id,
      JSON_RPC_REPOSITORY_ERROR,
      error.error.message,
      {
        scope: error.error.scope,
        operation: error.error.operation,
        identifier: error.error.identifier,
      },
    );
  }

  const message = error instanceof Error ? error.message : "Internal error";
  return createErrorResponse(id, JSON_RPC_INTERNAL_ERROR, message);
};
