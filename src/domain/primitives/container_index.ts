import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const CONTAINER_INDEX_KIND = "ContainerIndex" as const;
const CONTAINER_INDEX_BRAND: unique symbol = Symbol(CONTAINER_INDEX_KIND);

export type ContainerIndex = Readonly<{
  readonly data: Readonly<{
    readonly value: number;
  }>;
  value(): number;
  toJSON(): number;
  readonly [CONTAINER_INDEX_BRAND]: true;
}>;

const value = function (this: ContainerIndex): number {
  return this.data.value;
};

const toJSON = function (this: ContainerIndex): number {
  return this.value();
};

const instantiate = (index: number): ContainerIndex =>
  Object.freeze({
    data: Object.freeze({ value: index }),
    value,
    toJSON,
    [CONTAINER_INDEX_BRAND]: true,
  });

export type ContainerIndexValidationError = ValidationError<typeof CONTAINER_INDEX_KIND>;

export const isContainerIndex = (value: unknown): value is ContainerIndex =>
  typeof value === "object" && value !== null && CONTAINER_INDEX_BRAND in value;

const MIN_INDEX = 1;
const MAX_INDEX = 9999;

export const parseContainerIndex = (
  input: unknown,
): Result<ContainerIndex, ContainerIndexValidationError> => {
  if (isContainerIndex(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "number") {
    return Result.error(
      createValidationError(CONTAINER_INDEX_KIND, [
        createValidationIssue("index must be a number", {
          path: ["value"],
          code: "not_number",
        }),
      ]),
    );
  }

  if (!Number.isInteger(input)) {
    return Result.error(
      createValidationError(CONTAINER_INDEX_KIND, [
        createValidationIssue("index must be an integer", {
          path: ["value"],
          code: "not_integer",
        }),
      ]),
    );
  }

  if (input < MIN_INDEX) {
    return Result.error(
      createValidationError(CONTAINER_INDEX_KIND, [
        createValidationIssue("index must be at least 1", {
          path: ["value"],
          code: "min",
        }),
      ]),
    );
  }

  if (input > MAX_INDEX) {
    return Result.error(
      createValidationError(CONTAINER_INDEX_KIND, [
        createValidationIssue("index exceeds supported range", {
          path: ["value"],
          code: "max",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(input));
};

export const containerIndexFromNumber = (
  input: number,
): Result<ContainerIndex, ContainerIndexValidationError> => parseContainerIndex(input);
