import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";

export type SyncPushInput = {
  workspaceRoot: string;
  force?: boolean;
};

export type SyncPushDependencies = {
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

export type SyncPushError =
  | VersionControlError
  | RepositoryError
  | ValidationError<string>;

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

    // 2. Validate Git is enabled
    if (!settings.data.git?.enabled) {
      return Result.error(createValidationError("SyncPushInput", [
        {
          message: "Git sync is not enabled. Run 'mm sync init <remote-url>' first.",
          path: ["git", "enabled"],
        },
      ]));
    }

    // 3. Validate remote is configured
    const remote = settings.data.git.remote;
    if (!remote) {
      return Result.error(createValidationError("SyncPushInput", [
        {
          message: "No remote configured. Run 'mm sync init <remote-url>' first.",
          path: ["git", "remote"],
        },
      ]));
    }

    // 4. Get current branch
    const currentBranchResult = await deps.gitService.getCurrentBranch(input.workspaceRoot);
    if (currentBranchResult.type === "error") {
      return Result.error(currentBranchResult.error);
    }
    const currentBranch = currentBranchResult.value;

    // 5. Get configured branch (default to "main")
    const configuredBranch = settings.data.git.branch ?? "main";

    // 6. Validate current branch matches configured branch
    if (currentBranch !== configuredBranch) {
      return Result.error(createValidationError("SyncPushInput", [
        {
          message:
            `Current branch "${currentBranch}" does not match configured branch "${configuredBranch}". Check out "${configuredBranch}" or update workspace.json.`,
          path: ["git", "branch"],
        },
      ]));
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
