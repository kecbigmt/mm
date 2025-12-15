import { Result } from "../../shared/result.ts";

import { BaseError } from "../../shared/errors.ts";

export type VersionControlNotAvailableError = BaseError<"VersionControlNotAvailableError">;
export type VersionControlNotInitializedError = BaseError<"VersionControlNotInitializedError">;
export type VersionControlCommandFailedError = BaseError<"VersionControlCommandFailedError">;

export type VersionControlError =
  | VersionControlNotAvailableError
  | VersionControlNotInitializedError
  | VersionControlCommandFailedError;

export const createVersionControlNotAvailableError = (): VersionControlNotAvailableError => ({
  kind: "VersionControlNotAvailableError",
  message: "Version control system is not available",
  cause: undefined,
  toString: () => "VersionControlNotAvailableError: Version control system is not available",
});

export const createVersionControlNotInitializedError = (): VersionControlNotInitializedError => ({
  kind: "VersionControlNotInitializedError",
  message: "Version control repository is not initialized",
  cause: undefined,
  toString: () =>
    "VersionControlNotInitializedError: Version control repository is not initialized",
});

export const createVersionControlCommandFailedError = (
  message: string,
  options?: { cause?: unknown },
): VersionControlCommandFailedError => ({
  kind: "VersionControlCommandFailedError",
  message,
  cause: options?.cause,
  toString: () => `VersionControlCommandFailedError: ${message}`,
});

export interface VersionControlService {
  init(cwd: string): Promise<Result<void, VersionControlError>>;
  setRemote(
    cwd: string,
    name: string,
    url: string,
    options?: { force?: boolean },
  ): Promise<Result<void, VersionControlError>>;
  stage(cwd: string, paths: string[]): Promise<Result<void, VersionControlError>>;
  commit(cwd: string, message: string): Promise<Result<void, VersionControlError>>;
  validateBranchName(cwd: string, branch: string): Promise<Result<void, VersionControlError>>;
  push(
    cwd: string,
    remote: string,
    branch: string,
    options?: { force?: boolean; setUpstream?: boolean },
  ): Promise<Result<string, VersionControlError>>;
  pull(
    cwd: string,
    remote: string,
    branch: string,
  ): Promise<Result<string, VersionControlError>>;
  getCurrentBranch(cwd: string): Promise<Result<string, VersionControlError>>;
  checkoutBranch(
    cwd: string,
    branch: string,
    create: boolean,
  ): Promise<Result<void, VersionControlError>>;
  hasUncommittedChanges(cwd: string): Promise<Result<boolean, VersionControlError>>;
  getRemoteDefaultBranch(cwd: string, remote: string): Promise<Result<string, VersionControlError>>;
}
