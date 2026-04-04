import { isValidationError } from "../../shared/errors.ts";
import { isRepositoryError } from "../../domain/repositories/repository_error.ts";
import {
  createErrorResponse,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_REPOSITORY_ERROR,
  JSON_RPC_VALIDATION_ERROR,
  type JsonRpcErrorResponse,
  type JsonRpcId,
} from "./envelope.ts";

/**
 * Map a domain error to a JSON-RPC error response.
 * Recognizes ValidationError and RepositoryError by their `kind` discriminant;
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

  const message = error instanceof Error ? error.message : "Internal error";
  return createErrorResponse(id, JSON_RPC_INTERNAL_ERROR, message);
};
