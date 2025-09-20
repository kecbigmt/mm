import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";

const CONTAINER_PATH_KIND = "ContainerPath" as const;
const CONTAINER_PATH_BRAND: unique symbol = Symbol(CONTAINER_PATH_KIND);

export type ContainerPath = Readonly<{
  readonly data: Readonly<{
    readonly segments: ReadonlyArray<string>;
    readonly value: string;
  }>;
  toString(): string;
  toJSON(): string;
  segments(): ReadonlyArray<string>;
  isRoot(): boolean;
  append(segment: string): Result<ContainerPath, ContainerPathValidationError>;
  readonly [CONTAINER_PATH_BRAND]: true;
}>;

const toString = function (this: ContainerPath): string {
  return this.data.value;
};

const toJSON = function (this: ContainerPath): string {
  return this.toString();
};

const segments = function (this: ContainerPath): ReadonlyArray<string> {
  return this.data.segments;
};

const isRoot = function (this: ContainerPath): boolean {
  return this.data.segments.length === 0;
};

const append = function (
  this: ContainerPath,
  segment: string,
): Result<ContainerPath, ContainerPathValidationError> {
  const candidate = [...this.data.segments, segment];
  return createFromSegments(candidate);
};

const instantiate = (segmentsValue: ReadonlyArray<string>): ContainerPath =>
  Object.freeze({
    data: Object.freeze({
      segments: Object.freeze([...segmentsValue]),
      value: segmentsValue.join("/"),
    }),
    toString,
    toJSON,
    segments,
    isRoot,
    append,
    [CONTAINER_PATH_BRAND]: true,
  });

export type ContainerPathValidationError = ValidationError<typeof CONTAINER_PATH_KIND>;

export const isContainerPath = (value: unknown): value is ContainerPath =>
  typeof value === "object" && value !== null && CONTAINER_PATH_BRAND in value;

const SEGMENT_REGEX = /^[A-Za-z0-9][A-Za-z0-9-_]*$/;
const SEGMENT_MIN_LENGTH = 1;
const SEGMENT_MAX_LENGTH = 64;
const MAX_SEGMENT_COUNT = 32;

const validateSegment = (
  segment: string,
  index: number,
): Result<string, ContainerPathValidationError> => {
  const trimmed = segment.trim();
  if (trimmed.length < SEGMENT_MIN_LENGTH) {
    return Result.error(
      createValidationError(CONTAINER_PATH_KIND, [
        createValidationIssue("segment cannot be empty", {
          path: ["segments", index],
          code: "empty",
        }),
      ]),
    );
  }

  if (trimmed.length > SEGMENT_MAX_LENGTH) {
    return Result.error(
      createValidationError(CONTAINER_PATH_KIND, [
        createValidationIssue("segment is too long", {
          path: ["segments", index],
          code: "max_length",
        }),
      ]),
    );
  }

  if (!SEGMENT_REGEX.test(trimmed)) {
    return Result.error(
      createValidationError(CONTAINER_PATH_KIND, [
        createValidationIssue("segment contains invalid characters", {
          path: ["segments", index],
          code: "format",
        }),
      ]),
    );
  }

  return Result.ok(trimmed);
};

const createFromSegments = (
  segmentsValue: ReadonlyArray<string>,
): Result<ContainerPath, ContainerPathValidationError> => {
  if (segmentsValue.length > MAX_SEGMENT_COUNT) {
    return Result.error(
      createValidationError(CONTAINER_PATH_KIND, [
        createValidationIssue("too many segments", {
          path: ["segments"],
          code: "max_segments",
        }),
      ]),
    );
  }

  const normalized: string[] = [];
  for (const [index, segment] of segmentsValue.entries()) {
    const result = validateSegment(segment, index);
    if (result.type === "error") {
      return result;
    }
    normalized.push(result.value);
  }

  return Result.ok(instantiate(normalized));
};

export const parseContainerPath = (
  input: unknown,
): Result<ContainerPath, ContainerPathValidationError> => {
  if (isContainerPath(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(CONTAINER_PATH_KIND, [
        createValidationIssue("path must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "/") {
    return Result.ok(instantiate([]));
  }

  const parts = trimmed.split("/");
  return createFromSegments(parts);
};

export const containerPathFromSegments = (
  segmentsValue: ReadonlyArray<string>,
): Result<ContainerPath, ContainerPathValidationError> => createFromSegments(segmentsValue);
