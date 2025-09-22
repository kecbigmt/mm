import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const CONTEXT_TAG_KIND = "ContextTag" as const;
const contextTagFactory = createStringPrimitiveFactory({
  kind: CONTEXT_TAG_KIND,
});

export type ContextTag = StringPrimitive<
  typeof contextTagFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): ContextTag => contextTagFactory.instantiate(value);

export type ContextTagValidationError = ValidationError<typeof CONTEXT_TAG_KIND>;

export const isContextTag = (value: unknown): value is ContextTag => contextTagFactory.is(value);

const CONTEXT_TAG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MIN_LENGTH = 1;
const MAX_LENGTH = 32;

export const parseContextTag = (
  input: unknown,
): Result<ContextTag, ContextTagValidationError> => {
  if (isContextTag(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(CONTEXT_TAG_KIND, [
        createValidationIssue("context must be a string", {
          path: ["value"],
          code: "not_string",
        }),
      ]),
    );
  }

  let candidate = input.trim().toLowerCase();
  if (candidate.startsWith("@")) {
    candidate = candidate.slice(1);
  }

  if (candidate.length < MIN_LENGTH) {
    return Result.error(
      createValidationError(CONTEXT_TAG_KIND, [
        createValidationIssue("context cannot be empty", {
          path: ["value"],
          code: "min_length",
        }),
      ]),
    );
  }

  if (candidate.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(CONTEXT_TAG_KIND, [
        createValidationIssue("context is too long", {
          path: ["value"],
          code: "max_length",
        }),
      ]),
    );
  }

  if (!CONTEXT_TAG_REGEX.test(candidate)) {
    return Result.error(
      createValidationError(CONTEXT_TAG_KIND, [
        createValidationIssue("context contains invalid characters", {
          path: ["value"],
          code: "format",
        }),
      ]),
    );
  }

  return Result.ok(instantiate(candidate));
};

export const contextTagFromString = (
  input: string,
): Result<ContextTag, ContextTagValidationError> => parseContextTag(input);
