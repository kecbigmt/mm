import { Result } from "../../shared/result.ts";
import { VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";

export type AutoCommitInput = {
  workspaceRoot: string;
  summary: string;
};

export type AutoCommitDependencies = {
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

export type AutoCommitResult = {
  committed: boolean;
  message?: string;
};

/**
 * Auto-commit workflow
 *
 * Automatically commits changes when git.sync_mode is "auto-commit" or "auto-sync".
 * This workflow is designed to be failure-tolerant:
 * - If Git is not configured or disabled, it silently skips
 * - If commit fails, it logs a warning but doesn't fail the overall operation
 */
export const AutoCommitWorkflow = {
  execute: async (
    input: AutoCommitInput,
    deps: AutoCommitDependencies,
  ): Promise<Result<AutoCommitResult, never>> => {
    // 1. Load workspace settings
    const settingsResult = await deps.workspaceRepository.load(input.workspaceRoot);
    if (settingsResult.type === "error") {
      // Cannot load settings - skip auto-commit
      return Result.ok({ committed: false });
    }

    const settings = settingsResult.value;

    // 2. Check if Git sync is enabled
    if (!settings.data.git?.enabled) {
      // Git sync not enabled - skip
      return Result.ok({ committed: false });
    }

    // 3. Check sync mode (auto-commit or auto-sync)
    const syncMode = settings.data.git.syncMode;
    if (syncMode !== "auto-commit" && syncMode !== "auto-sync") {
      // Not in auto-commit or auto-sync mode - skip
      return Result.ok({ committed: false });
    }

    // 4. Stage files
    const filesToStage = ["items", "tags", "workspace.json"];
    const stageResult = await deps.versionControlService.stage(input.workspaceRoot, filesToStage);
    if (stageResult.type === "error") {
      // Stage failed - return warning message
      return Result.ok({
        committed: false,
        message: `Warning: Auto-commit stage failed: ${stageResult.error.message}`,
      });
    }

    // 5. Create commit
    const commitMessage = `mm: ${input.summary}`;
    const commitResult = await deps.versionControlService.commit(
      input.workspaceRoot,
      commitMessage,
    );
    if (commitResult.type === "error") {
      const errorMsg = commitResult.error.message.toLowerCase();
      // "nothing to commit" is OK - no changes to commit
      if (errorMsg.includes("nothing to commit") || errorMsg.includes("clean")) {
        return Result.ok({ committed: false });
      }
      // Other errors - return warning message
      return Result.ok({
        committed: false,
        message: `Warning: Auto-commit failed: ${commitResult.error.message}`,
      });
    }

    return Result.ok({
      committed: true,
      message: `Auto-committed: ${commitMessage}`,
    });
  },
};
