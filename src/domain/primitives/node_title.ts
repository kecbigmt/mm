import { Result } from "../../shared/result.ts";
import {
  ValidationError,
  createValidationError,
  createValidationIssue,
} from "../../shared/errors.ts";

const NODE_TITLE_KIND = "NodeTitle" as const;
const NODE_TITLE_BRAND: unique symbol = Symbol(NODE_TITLE_KIND);

export type NodeTitle = Readonly<{
  readonly data: Readonly<{
    readonly value: string;
  }>;
  toString(): string;
  equals(other: NodeTitle): boolean;
  toJSON(): string;
  readonly [NODE_TITLE_BRAND]: true;
}>;

const toString = function (this: NodeTitle): string {
  return this.data.value;
};

const equals = function (this: NodeTitle, other: NodeTitle): boolean {
  return this.data.value.localeCompare(other.data.value) === 0;
};

const toJSON = function (this: NodeTitle): string {
  return this.toString();
};

const instantiate = (value: string): NodeTitle =>
  Object.freeze({
    data: Object.freeze({ value }),
    toString,
    equals,
    toJSON,
    [NODE_TITLE_BRAND]: true,
  });

export type NodeTitleValidationError = ValidationError<typeof NODE_TITLE_KIND>;

export const isNodeTitle = (value: unknown): value is NodeTitle =>
  typeof value === "object" && value !== null && NODE_TITLE_BRAND in value;

const MAX_LENGTH = 200;

export const parseNodeTitle = (
  input: unknown,
): Result<NodeTitle, NodeTitleValidationError> => {
  if (isNodeTitle(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(NODE_TITLE_KIND, [
        createValidationIssue("title must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return Result.error(
      createValidationError(NODE_TITLE_KIND, [
        createValidationIssue("title cannot be empty", {
          path: ["value"],
          code: "empty",
        }),
      ]),
    );
  }

  if (trimmed.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(NODE_TITLE_KIND, [
        createValidationIssue("title is too long", {
          path: ["value"],
          code: "max_length",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(trimmed));
};

export const nodeTitleFromString = (
  input: string,
): Result<NodeTitle, NodeTitleValidationError> => parseNodeTitle(input);
