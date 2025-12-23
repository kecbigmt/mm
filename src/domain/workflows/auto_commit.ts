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

export type AutoCommitError =
  | { type: "network_error"; operation: "pull" | "push" }
  | { type: "pull_failed"; details: string }
  | { type: "push_failed"; details: string }
  | { type: "no_remote_configured" }
  | { type: "no_branch_configured" }
  | { type: "stage_failed"; details: string }
  | { type: "commit_failed"; details: string }
  | { type: "get_current_branch_failed"; details: string };

export type AutoCommitResult = {
  committed: boolean;
  pushed?: boolean;
  error?: AutoCommitError;
};

/**
 * Checks if an error message indicates a network connectivity issue.
 *
 * Based on actual Git error messages observed in testing:
 * - SSH: "ssh: connect to host github.com port 22: Undefined error: 0"
 */
function isNetworkConnectivityError(errorMessage: string): boolean {
  const lowerMsg = errorMessage.toLowerCase();

  // SSH connection errors (verified in testing)
  if (lowerMsg.includes("ssh: connect to host")) {
    return true;
  }

  return false;
}

/**
 * Auto-commit workflow
 *
 * Automatically commits changes when sync.mode is "auto-commit" or "auto-sync".
 *
 * For "auto-sync" mode, follows commit→pull(rebase)→push pattern:
 * - Commits are always created first (offline resilience)
 * - Pull with rebase integrates remote changes
 * - Push completes synchronization
 *
 * This workflow is designed to be failure-tolerant:
 * - If Git is not configured or disabled, it silently skips
 * - If any Git operation fails, it logs a warning but doesn't fail the overall operation
 * - Filesystem changes and commits are never rolled back
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

    // 2. Check if sync is enabled
    if (!settings.data.sync.enabled) {
      // Sync not enabled - skip
      return Result.ok({ committed: false });
    }

    // 3. Check sync mode (auto-commit or auto-sync)
    const mode = settings.data.sync.mode;
    if (mode !== "auto-commit" && mode !== "auto-sync") {
      // Not in auto-commit or auto-sync mode - skip
      return Result.ok({ committed: false });
    }

    // 4. Stage files
    const filesToStage = ["items", "tags", "workspace.json"];
    const stageResult = await deps.versionControlService.stage(input.workspaceRoot, filesToStage);
    if (stageResult.type === "error") {
      // Stage failed
      return Result.ok({
        committed: false,
        error: { type: "stage_failed", details: stageResult.error.message },
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
      // Other errors
      return Result.ok({
        committed: false,
        error: { type: "commit_failed", details: commitResult.error.message },
      });
    }

    // 6. Auto-sync: pull and push after commit if mode is "auto-sync"
    if (mode === "auto-sync") {
      // Get remote and branch configuration
      const remote = settings.data.sync.git?.remote;
      const branch = settings.data.sync.git?.branch;

      if (!remote) {
        return Result.ok({
          committed: true,
          pushed: false,
          error: { type: "no_remote_configured" },
        });
      }

      if (!branch) {
        return Result.ok({
          committed: true,
          pushed: false,
          error: { type: "no_branch_configured" },
        });
      }

      // Pull with rebase to integrate remote changes
      const pullResult = await deps.versionControlService.pull(
        input.workspaceRoot,
        remote,
        branch,
      );

      if (pullResult.type === "error") {
        // Pull/rebase failed - could be network error, conflict, or missing remote branch
        const errorMsg = pullResult.error.message;

        if (isNetworkConnectivityError(errorMsg)) {
          return Result.ok({
            committed: true,
            pushed: false,
            error: { type: "network_error", operation: "pull" },
          });
        }

        // Check if this is a "remote branch doesn't exist" error
        // This happens on first push to a new remote repository
        const isNoRemoteBranch = errorMsg.toLowerCase().includes("couldn't find remote ref") ||
          errorMsg.toLowerCase().includes("does not exist") ||
          errorMsg.toLowerCase().includes("no such ref");

        if (!isNoRemoteBranch) {
          // Conflict or other rebase errors
          return Result.ok({
            committed: true,
            pushed: false,
            error: { type: "pull_failed", details: errorMsg },
          });
        }

        // Remote branch doesn't exist yet - skip pull and proceed to push
        // This is expected for first push after sync init
      }

      // Get current branch
      const currentBranchResult = await deps.versionControlService.getCurrentBranch(
        input.workspaceRoot,
      );
      if (currentBranchResult.type === "error") {
        return Result.ok({
          committed: true,
          pushed: false,
          error: { type: "get_current_branch_failed", details: currentBranchResult.error.message },
        });
      }

      const currentBranch = currentBranchResult.value;

      // Push to remote
      // Use --set-upstream for the first push or when remote branch doesn't exist
      const pushResult = await deps.versionControlService.push(
        input.workspaceRoot,
        remote,
        currentBranch,
        { setUpstream: true },
      );

      if (pushResult.type === "ok") {
        // Push succeeded
        return Result.ok({
          committed: true,
          pushed: true,
        });
      }

      // Push failed
      const pushErrorMsg = pushResult.error.message;

      if (isNetworkConnectivityError(pushErrorMsg)) {
        return Result.ok({
          committed: true,
          pushed: false,
          error: { type: "network_error", operation: "push" },
        });
      }

      return Result.ok({
        committed: true,
        pushed: false,
        error: { type: "push_failed", details: pushErrorMsg },
      });
    }

    // Auto-commit mode (no push)
    return Result.ok({
      committed: true,
      pushed: false,
    });
  },
};
