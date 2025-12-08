import { Result } from "../../shared/result.ts";

import { BaseError } from "../../shared/errors.ts";

export type VersionControlError = BaseError<"VersionControlError">;

export const createVersionControlError = (
  message: string,
  options?: { cause?: unknown },
): VersionControlError => ({
  kind: "VersionControlError",
  message,
  cause: options?.cause,
  toString: () => `VersionControlError: ${message}`,
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
    options?: { force?: boolean },
  ): Promise<Result<string, VersionControlError>>;
  getCurrentBranch(cwd: string): Promise<Result<string, VersionControlError>>;
}
