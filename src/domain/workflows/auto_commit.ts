import { Result } from "../../shared/result.ts";
import { VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { StateRepository } from "../repositories/state_repository.ts";
import { DEFAULT_LAZY_SYNC_SETTINGS } from "../models/workspace.ts";

export type AutoCommitInput = {
  workspaceRoot: string;
  summary: string;
};

export type AutoCommitDependencies = {
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
  stateRepository: StateRepository;
};

export type AutoCommitError =
  | { type: "network_error"; operation: "pull" | "push" }
  | { type: "pull_failed"; details: string }
  | { type: "push_failed"; details: string }
  | { type: "no_remote_configured" }
  | { type: "no_branch_configured" }
  | { type: "stage_failed"; details: string }
  | { type: "commit_failed"; details: string }
  | { type: "get_current_branch_failed"; details: string }
  | { type: "state_save_failed"; details: string };

export type AutoCommitResult = {
  committed: boolean;
  pushed?: boolean;
  syncTriggered?: boolean;
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
 * Automatically commits changes when sync.mode is "auto-commit", "auto-sync", or "lazy-sync".
 *
 * For "auto-sync" mode, follows commit→pull(rebase)→push pattern:
 * - Commits are always created first (offline resilience)
 * - Pull with rebase integrates remote changes
 * - Push completes synchronization
 *
 * For "lazy-sync" mode:
 * - Commits are created immediately (like auto-commit)
 * - Sync is triggered when either threshold is met:
 *   - Commit count threshold (default: 10)
 *   - Time threshold (default: 600 seconds)
 * - When triggered, follows same commit→pull(rebase)→push pattern
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

    // 3. Check sync mode (auto-commit, auto-sync, or lazy-sync)
    const mode = settings.data.sync.mode;
    if (mode !== "auto-commit" && mode !== "auto-sync" && mode !== "lazy-sync") {
      // Not in a recognized auto-commit mode - skip
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

    // Helper function to perform sync (pull + push)
    const performSync = async (): Promise<AutoCommitResult> => {
      const remote = settings.data.sync.git?.remote;
      const branch = settings.data.sync.git?.branch;

      if (!remote) {
        return {
          committed: true,
          pushed: false,
          error: { type: "no_remote_configured" },
        };
      }

      if (!branch) {
        return {
          committed: true,
          pushed: false,
          error: { type: "no_branch_configured" },
        };
      }

      // Pull with rebase to integrate remote changes
      const pullResult = await deps.versionControlService.pull(
        input.workspaceRoot,
        remote,
        branch,
      );

      if (pullResult.type === "error") {
        const errorMsg = pullResult.error.message;

        if (isNetworkConnectivityError(errorMsg)) {
          return {
            committed: true,
            pushed: false,
            error: { type: "network_error", operation: "pull" },
          };
        }

        // Check if this is a "remote branch doesn't exist" error
        const isNoRemoteBranch = errorMsg.toLowerCase().includes("couldn't find remote ref") ||
          errorMsg.toLowerCase().includes("does not exist") ||
          errorMsg.toLowerCase().includes("no such ref");

        if (!isNoRemoteBranch) {
          return {
            committed: true,
            pushed: false,
            error: { type: "pull_failed", details: errorMsg },
          };
        }
        // Remote branch doesn't exist yet - proceed to push
      }

      // Get current branch
      const currentBranchResult = await deps.versionControlService.getCurrentBranch(
        input.workspaceRoot,
      );
      if (currentBranchResult.type === "error") {
        return {
          committed: true,
          pushed: false,
          error: { type: "get_current_branch_failed", details: currentBranchResult.error.message },
        };
      }

      const currentBranch = currentBranchResult.value;

      // Push to remote
      const pushResult = await deps.versionControlService.push(
        input.workspaceRoot,
        remote,
        currentBranch,
        { setUpstream: true },
      );

      if (pushResult.type === "ok") {
        return { committed: true, pushed: true };
      }

      const pushErrorMsg = pushResult.error.message;

      if (isNetworkConnectivityError(pushErrorMsg)) {
        return {
          committed: true,
          pushed: false,
          error: { type: "network_error", operation: "push" },
        };
      }

      return {
        committed: true,
        pushed: false,
        error: { type: "push_failed", details: pushErrorMsg },
      };
    };

    // 6. Handle sync based on mode
    if (mode === "auto-sync") {
      // Auto-sync: always sync after commit
      return Result.ok(await performSync());
    }

    if (mode === "lazy-sync") {
      // Lazy-sync: sync only when thresholds are met
      const lazySettings = settings.data.sync.lazy ?? DEFAULT_LAZY_SYNC_SETTINGS;

      // Load current sync state
      const syncStateResult = await deps.stateRepository.loadSyncState();
      if (syncStateResult.type === "error") {
        // Can't load state - just commit without sync
        return Result.ok({ committed: true, pushed: false });
      }

      const syncState = syncStateResult.value;
      const newCommitCount = syncState.commitsSinceLastSync + 1;
      const now = Date.now();

      // Check thresholds (OR condition)
      const commitThresholdMet = newCommitCount >= lazySettings.commits;
      const timeThresholdMet = syncState.lastSyncTimestamp !== null &&
        (now - syncState.lastSyncTimestamp) >= lazySettings.minutes * 60 * 1000;

      const shouldSync = commitThresholdMet || timeThresholdMet;

      if (shouldSync) {
        // Perform sync
        const syncResult = await performSync();

        if (syncResult.pushed) {
          // Sync succeeded - reset state
          await deps.stateRepository.saveSyncState({
            commitsSinceLastSync: 0,
            lastSyncTimestamp: now,
          });
          return Result.ok({ ...syncResult, syncTriggered: true });
        }

        // Sync failed - don't reset count, but save incremented count
        await deps.stateRepository.saveSyncState({
          commitsSinceLastSync: newCommitCount,
          lastSyncTimestamp: syncState.lastSyncTimestamp,
        });
        return Result.ok({ ...syncResult, syncTriggered: true });
      }

      // Thresholds not met - just save incremented count
      const saveResult = await deps.stateRepository.saveSyncState({
        commitsSinceLastSync: newCommitCount,
        lastSyncTimestamp: syncState.lastSyncTimestamp,
      });

      if (saveResult.type === "error") {
        return Result.ok({
          committed: true,
          pushed: false,
          error: { type: "state_save_failed", details: saveResult.error.message },
        });
      }

      return Result.ok({ committed: true, pushed: false });
    }

    // Auto-commit mode (no push)
    return Result.ok({
      committed: true,
      pushed: false,
    });
  },
};
