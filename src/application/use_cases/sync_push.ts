import { Result } from "../../shared/result.ts";
import {
  VersionControlError,
  VersionControlService,
} from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";

export type SyncPushRequest = Readonly<{
  workspaceRoot: string;
  force?: boolean;
}>;

export type SyncPushDeps = Readonly<{
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
}>;

export type SyncPushValidationError =
  | { type: "git_not_enabled" }
  | { type: "no_remote_configured" }
  | { type: "branch_mismatch"; currentBranch: string; configuredBranch: string };

export type SyncPushApplicationError =
  | VersionControlError
  | RepositoryError
  | SyncPushValidationError;

export type SyncPushResponse = Readonly<{
  output: string;
  remote: string;
  branch: string;
}>;

export const isSyncPushValidationError = (
  error: unknown,
): error is SyncPushValidationError =>
  typeof error === "object" && error !== null &&
  "type" in error &&
  ((error as { type: string }).type === "git_not_enabled" ||
    (error as { type: string }).type === "no_remote_configured" ||
    (error as { type: string }).type === "branch_mismatch");

export const syncPush = async (
  input: SyncPushRequest,
  deps: SyncPushDeps,
): Promise<Result<SyncPushResponse, SyncPushApplicationError>> => {
  // 1. Load workspace settings
  const settingsResult = await deps.workspaceRepository.load(input.workspaceRoot);
  if (settingsResult.type === "error") {
    return Result.error(settingsResult.error);
  }
  const settings = settingsResult.value;

  // 2. Validate sync is enabled
  if (!settings.data.sync.enabled) {
    return Result.error({ type: "git_not_enabled" });
  }

  // 3. Validate remote is configured
  const remote = settings.data.sync.git?.remote;
  if (!remote) {
    return Result.error({ type: "no_remote_configured" });
  }

  // 4. Get current branch
  const currentBranchResult = await deps.gitService.getCurrentBranch(input.workspaceRoot);
  if (currentBranchResult.type === "error") {
    return Result.error(currentBranchResult.error);
  }
  const currentBranch = currentBranchResult.value;

  // 5. Get configured branch (default to "main")
  const configuredBranch = settings.data.sync.git?.branch ?? "main";

  // 6. Validate current branch matches configured branch
  if (currentBranch !== configuredBranch) {
    return Result.error({
      type: "branch_mismatch",
      currentBranch,
      configuredBranch,
    });
  }

  // 7. Execute push to origin/<current-branch>
  const pushResult = await deps.gitService.push(
    input.workspaceRoot,
    "origin",
    currentBranch,
    { force: input.force },
  );
  if (pushResult.type === "error") {
    return Result.error(pushResult.error);
  }

  return Result.ok(Object.freeze({
    output: pushResult.value,
    remote: "origin",
    branch: currentBranch,
  }));
};
