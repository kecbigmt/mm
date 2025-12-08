import { Result } from "../../shared/result.ts";

export type VersionControlError = {
  kind: "VersionControlError";
  message: string;
};

export interface VersionControlService {
  init(cwd: string): Promise<Result<void, VersionControlError>>;
  setRemote(cwd: string, name: string, url: string, options?: { force?: boolean }): Promise<Result<void, VersionControlError>>;
  stage(cwd: string, paths: string[]): Promise<Result<void, VersionControlError>>;
  commit(cwd: string, message: string): Promise<Result<void, VersionControlError>>;
  validateBranchName(cwd: string, branch: string): Promise<Result<void, VersionControlError>>;
}
