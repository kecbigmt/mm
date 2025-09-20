import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const NODE_RANK_KIND = "NodeRank" as const;
const NODE_RANK_BRAND: unique symbol = Symbol(NODE_RANK_KIND);

export type NodeRank = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  toJSON(): string;
  compare(other: NodeRank): number;
  readonly [NODE_RANK_BRAND]: true;
}>;

const ORDER_KEY_REGEX = /^[0-9A-Za-z:]+$/;
const MIN_LENGTH = 1;
const MAX_LENGTH = 30;

const toString = function (this: NodeRank): string {
  return this.data.value;
};

const toJSON = function (this: NodeRank): string {
  return this.toString();
};

const compare = function (this: NodeRank, other: NodeRank): number {
  if (this.data.value === other.data.value) {
    return 0;
  }
  return this.data.value < other.data.value ? -1 : 1;
};

const instantiate = (value: string): NodeRank =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    toJSON,
    compare,
    [NODE_RANK_BRAND]: true,
  });

export type NodeRankValidationError = ValidationError<typeof NODE_RANK_KIND>;

export const isNodeRank = (value: unknown): value is NodeRank =>
  typeof value === "object" && value !== null && NODE_RANK_BRAND in value;

export const parseNodeRank = (
  input: unknown,
): Result<NodeRank, NodeRankValidationError> => {
  if (isNodeRank(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(NODE_RANK_KIND, [
        createValidationIssue("rank must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  if (trimmed.length < MIN_LENGTH) {
    return Result.error(
      createValidationError(NODE_RANK_KIND, [
        createValidationIssue("rank cannot be empty", {
          path: ["value"],
          code: "min_length",
        }),
      ]),
    );
  }

  if (trimmed.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(NODE_RANK_KIND, [
        createValidationIssue("rank is too long", {
          path: ["value"],
          code: "max_length",
        }),
      ]),
    );
  }

  if (!ORDER_KEY_REGEX.test(trimmed)) {
    return Result.error(
      createValidationError(NODE_RANK_KIND, [
        createValidationIssue("rank has invalid characters", {
          path: ["value"],
          code: "format",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(trimmed));
};

export const nodeRankFromString = (
  input: string,
): Result<NodeRank, NodeRankValidationError> => parseNodeRank(input);
