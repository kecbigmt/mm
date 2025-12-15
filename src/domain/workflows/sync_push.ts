import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type SyncPushInput = {
  workspaceRoot: string;
  force?: boolean;
};

export type SyncPushDependencies = {
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

export type SyncPushValidationError =
  | { type: "git_not_enabled" }
  | { type: "no_remote_configured" }
  | { type: "branch_mismatch"; currentBranch: string; configuredBranch: string };

export type SyncPushError =
  | VersionControlError
  | RepositoryError
  | SyncPushValidationError;

export const SyncPushWorkflow = {
  execute: async (
    input: SyncPushInput,
    deps: SyncPushDependencies,
  ): Promise<Result<string, SyncPushError>> => {
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

    return Result.ok(pushResult.value);
  },
};
