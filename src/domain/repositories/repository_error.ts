import { BaseError } from "../../shared/errors.ts";

export type RepositoryScope =
  | "workspace"
  | "container"
  | "item"
  | "alias"
  | "context"
  | "config";

export type RepositoryOperation =
  | "load"
  | "save"
  | "delete"
  | "list"
  | "replace"
  | "ensure"
  | "findByShortId";

export type RepositoryError = Readonly<
  & BaseError<"RepositoryError">
  & {
    readonly scope: RepositoryScope;
    readonly operation: RepositoryOperation;
    readonly identifier?: string;
  }
>;

const repositoryErrorToString = function (this: RepositoryError): string {
  const target = this.identifier ? `${this.scope}:${this.identifier}` : this.scope;
  return `${this.kind}(${this.operation}:${target}): ${this.message}`;
};

export const createRepositoryError = (
  scope: RepositoryScope,
  operation: RepositoryOperation,
  message: string,
  options?: {
    readonly identifier?: string;
    readonly cause?: unknown;
  },
): RepositoryError =>
  Object.freeze({
    kind: "RepositoryError" as const,
    scope,
    operation,
    message,
    identifier: options?.identifier,
    cause: options?.cause,
    toString: repositoryErrorToString,
  });
