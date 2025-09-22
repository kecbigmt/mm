import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const WORKSPACE_NAME_KIND = "WorkspaceName" as const;
const workspaceNameFactory = createStringPrimitiveFactory({
  kind: WORKSPACE_NAME_KIND,
});

export type WorkspaceName = StringPrimitive<
  typeof workspaceNameFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): WorkspaceName => workspaceNameFactory.instantiate(value);

export type WorkspaceNameValidationError = ValidationError<typeof WORKSPACE_NAME_KIND>;

const MIN_LENGTH = 1;
const MAX_LENGTH = 50;
const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$/;

export const isWorkspaceName = (value: unknown): value is WorkspaceName =>
  workspaceNameFactory.is(value);

export const parseWorkspaceName = (
  input: unknown,
): Result<WorkspaceName, WorkspaceNameValidationError> => {
  if (isWorkspaceName(input)) {
    return Result.ok(input);
  }

  if (typeof input !== "string") {
    return Result.error(
      createValidationError(WORKSPACE_NAME_KIND, [
        createValidationIssue("workspace name must be a string", {
          code: "not_string",
          path: ["value"],
        }),
      ]),
    );
  }

  const trimmed = input.trim();
  if (trimmed.length < MIN_LENGTH) {
    return Result.error(
      createValidationError(WORKSPACE_NAME_KIND, [
        createValidationIssue("workspace name cannot be empty", {
          code: "empty",
          path: ["value"],
        }),
      ]),
    );
  }

  if (trimmed.length > MAX_LENGTH) {
    return Result.error(
      createValidationError(WORKSPACE_NAME_KIND, [
        createValidationIssue("workspace name is too long", {
          code: "max_length",
          path: ["value"],
        }),
      ]),
    );
  }

  if (!NAME_PATTERN.test(trimmed)) {
    return Result.error(
      createValidationError(WORKSPACE_NAME_KIND, [
        createValidationIssue(
          "workspace name must start with a letter or digit and use only lower-case letters, digits, hyphens, or underscores",
          {
            code: "pattern",
            path: ["value"],
          },
        ),
      ]),
    );
  }

  return Result.ok(instantiate(trimmed));
};

export const workspaceNameFromString = (
  input: string,
): Result<WorkspaceName, WorkspaceNameValidationError> => parseWorkspaceName(input);
