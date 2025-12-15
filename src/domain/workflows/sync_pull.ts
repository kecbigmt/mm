import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createWorkspaceSettings } from "../models/workspace.ts";

export type SyncPullInput = {
  workspaceRoot: string;
};

export type SyncPullDependencies = {
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

export type SyncPullValidationError =
  | { type: "git_not_enabled" }
  | { type: "no_remote_configured" }
  | { type: "uncommitted_changes" }
  | { type: "branch_mismatch"; currentBranch: string; configuredBranch: string };

export type SyncPullError =
  | VersionControlError
  | RepositoryError
  | SyncPullValidationError;

export const SyncPullWorkflow = {
  execute: async (
    input: SyncPullInput,
    deps: SyncPullDependencies,
  ): Promise<Result<string, SyncPullError>> => {
    // 1. Load workspace settings
    const settingsResult = await deps.workspaceRepository.load(input.workspaceRoot);
    if (settingsResult.type === "error") {
      return Result.error(settingsResult.error);
    }
    let settings = settingsResult.value;

    // 2. Validate sync is enabled
    if (!settings.data.sync.enabled) {
      return Result.error({ type: "git_not_enabled" });
    }

    // 3. Validate remote is configured
    const remote = settings.data.sync.git?.remote;
    if (!remote) {
      return Result.error({ type: "no_remote_configured" });
    }

    // 4. Get or resolve branch
    let branch = settings.data.sync.git?.branch;
    if (!branch) {
      // Resolve remote default branch
      const remoteBranchResult = await deps.gitService.getRemoteDefaultBranch(
        input.workspaceRoot,
        remote,
      );
      if (remoteBranchResult.type === "error") {
        return Result.error(remoteBranchResult.error);
      }
      branch = remoteBranchResult.value;

      // Persist resolved branch to workspace.json
      const updatedSettings = createWorkspaceSettings({
        ...settings.data,
        sync: {
          ...settings.data.sync,
          git: {
            ...settings.data.sync.git!,
            branch,
          },
        },
      });
      const saveResult = await deps.workspaceRepository.save(
        input.workspaceRoot,
        updatedSettings,
      );
      if (saveResult.type === "error") {
        return Result.error(saveResult.error);
      }
      settings = updatedSettings;
    }

    // 5. Check for uncommitted changes (also validates git repository exists)
    const uncommittedResult = await deps.gitService.hasUncommittedChanges(
      input.workspaceRoot,
    );
    if (uncommittedResult.type === "error") {
      return Result.error(uncommittedResult.error);
    }
    if (uncommittedResult.value) {
      return Result.error({ type: "uncommitted_changes" });
    }

    // 6. Validate current branch matches configured branch
    const currentBranchResult = await deps.gitService.getCurrentBranch(input.workspaceRoot);
    if (currentBranchResult.type === "error") {
      return Result.error(currentBranchResult.error);
    }
    const currentBranch = currentBranchResult.value;
    if (currentBranch !== branch) {
      return Result.error({
        type: "branch_mismatch",
        currentBranch,
        configuredBranch: branch,
      });
    }

    // 7. Execute pull
    const pullResult = await deps.gitService.pull(
      input.workspaceRoot,
      remote,
      branch,
    );
    if (pullResult.type === "error") {
      return Result.error(pullResult.error);
    }

    return Result.ok(pullResult.value);
  },
};
