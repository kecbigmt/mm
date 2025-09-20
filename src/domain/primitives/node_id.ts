import { Result } from "../../shared/result.ts";
import {
  ValidationError,
  createValidationError,
  createValidationIssue,
} from "../../shared/errors.ts";

const NODE_ID_KIND = "NodeId" as const;
const NODE_ID_BRAND: unique symbol = Symbol(NODE_ID_KIND);
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NodeId = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  equals(other: NodeId): boolean;
  toJSON(): string;
  readonly [NODE_ID_BRAND]: true;
}>;

const toString = function (this: NodeId): string {
  return this.data.value;
};

const equals = function (this: NodeId, other: NodeId): boolean {
  return this.data.value === other.data.value;
};

const toJSON = function (this: NodeId): string {
  return this.toString();
};

const instantiate = (value: string): NodeId =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    equals,
    toJSON,
    [NODE_ID_BRAND]: true,
  });

export type NodeIdValidationError = ValidationError<typeof NODE_ID_KIND>;

export const isNodeId = (value: unknown): value is NodeId =>
  typeof value === "object" && value !== null && NODE_ID_BRAND in value;

export const parseNodeId = (
  input: unknown,
): Result<NodeId, NodeIdValidationError> => {
  if (isNodeId(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(NODE_ID_KIND, [
        createValidationIssue("id must be a string", { path: ["value"] }),
      ]),
    );
  }

  const candidate = input.trim().toLowerCase();
  if (!UUID_V7_REGEX.test(candidate)) {
    return Result.error(
      createValidationError(NODE_ID_KIND, [
        createValidationIssue("value must be a UUID v7", { path: ["value"] }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate));
};

export const nodeIdFromString = (
  input: string,
): Result<NodeId, NodeIdValidationError> => parseNodeId(input);
