// JSON-RPC 2.0 envelope types

export type JsonRpcId = string | number;

export type JsonRpcRequest = Readonly<{
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly id: JsonRpcId;
}>;

export type JsonRpcSuccessResponse<T = unknown> = Readonly<{
  readonly jsonrpc: "2.0";
  readonly result: T;
  readonly id: JsonRpcId;
}>;

export type JsonRpcErrorData = Readonly<{
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}>;

export type JsonRpcErrorResponse = Readonly<{
  readonly jsonrpc: "2.0";
  readonly error: JsonRpcErrorData;
  readonly id: JsonRpcId | null;
}>;

export type JsonRpcResponse<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse;

// Standard JSON-RPC 2.0 error codes
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;

// Application-specific error codes (reserved range: -32000 to -32099)
export const JSON_RPC_VALIDATION_ERROR = -32001;
export const JSON_RPC_REPOSITORY_ERROR = -32002;
export const JSON_RPC_WORKSPACE_ERROR = -32003;

export const createSuccessResponse = <T>(
  id: JsonRpcId,
  result: T,
): JsonRpcSuccessResponse<T> =>
  Object.freeze({
    jsonrpc: "2.0" as const,
    result,
    id,
  });

export const createErrorResponse = (
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse =>
  Object.freeze({
    jsonrpc: "2.0" as const,
    error: Object.freeze({
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    }),
    id,
  });
