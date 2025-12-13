import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";
import { createWorkspaceSettings } from "../models/workspace.ts";

export type SyncPullInput = {
  workspaceRoot: string;
};

export type SyncPullDependencies = {
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

export type SyncPullError =
  | VersionControlError
  | RepositoryError
  | ValidationError<string>;

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

    // 2. Validate Git is enabled
    if (!settings.data.git?.enabled) {
      return Result.error(createValidationError("SyncPullInput", [
        {
          message: "Git sync is not enabled. Run 'mm sync init <remote-url>' first.",
          path: ["git", "enabled"],
        },
      ]));
    }

    // 3. Validate remote is configured
    const remote = settings.data.git.remote;
    if (!remote) {
      return Result.error(createValidationError("SyncPullInput", [
        {
          message: "No remote configured. Run 'mm sync init <remote-url>' first.",
          path: ["git", "remote"],
        },
      ]));
    }

    // 4. Get or resolve branch
    let branch = settings.data.git.branch;
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
        git: {
          ...settings.data.git,
          branch,
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

    // 5. Validate current branch matches configured branch
    const currentBranchResult = await deps.gitService.getCurrentBranch(input.workspaceRoot);
    if (currentBranchResult.type === "error") {
      return Result.error(currentBranchResult.error);
    }
    const currentBranch = currentBranchResult.value;
    if (currentBranch !== branch) {
      return Result.error(createValidationError("SyncPullInput", [
        {
          message:
            `Current branch '${currentBranch}' does not match configured branch '${branch}'. ` +
            `Checkout '${branch}' or update workspace.json to match current branch.`,
          path: ["git", "branch"],
        },
      ]));
    }

    // 6. Check for uncommitted changes
    const uncommittedResult = await deps.gitService.hasUncommittedChanges(
      input.workspaceRoot,
    );
    if (uncommittedResult.type === "error") {
      return Result.error(uncommittedResult.error);
    }
    if (uncommittedResult.value) {
      return Result.error(createValidationError("SyncPullInput", [
        {
          message: "Working tree has uncommitted changes. Commit or stash changes before pulling.",
          path: ["workingTree"],
        },
      ]));
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
