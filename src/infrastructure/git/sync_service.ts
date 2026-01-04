/**
 * SyncService - Infrastructure service for Git synchronization operations
 *
 * This service handles Git-based sync operations as infrastructure concerns,
 * not domain workflows. Following DMMF's "Functional Core, Imperative Shell"
 * pattern, these I/O operations belong in the infrastructure layer.
 *
 * The CLI (Imperative Shell) orchestrates:
 *   1. prePull() - fetch remote changes before file operations
 *   2. Domain Workflow - pure business logic
 *   3. autoCommit() - commit and push after file operations
 */

import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { StateRepository } from "../../domain/repositories/state_repository.ts";

// ============================================================================
// Pre-Pull Types
// ============================================================================

export type PrePullWarning =
  | { type: "network_error" }
  | { type: "pull_failed"; details: string };

export type PrePullResult = {
  pulled: boolean;
  skipped: boolean;
  warning?: PrePullWarning;
};

export type PrePullInput = {
  workspaceRoot: string;
  syncEnabled: boolean;
  syncMode: "auto-commit" | "auto-sync" | "lazy-sync";
  remote?: string;
  branch?: string;
};

// ============================================================================
// Auto-Commit Types
// ============================================================================

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

export type AutoCommitInput = {
  workspaceRoot: string;
  summary: string;
  syncEnabled: boolean;
  syncMode: "auto-commit" | "auto-sync" | "lazy-sync";
  remote?: string;
  branch?: string;
  lazy?: { commits: number; minutes: number };
  onSync?: <T>(operation: () => Promise<T>) => Promise<T>;
};

export type AutoCommitDeps = {
  stateRepository: StateRepository;
};

const DEFAULT_LAZY_SYNC_SETTINGS = {
  commits: 10,
  minutes: 10,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if an error message indicates a network connectivity issue.
 */
function isNetworkConnectivityError(errorMessage: string): boolean {
  const lowerMsg = errorMessage.toLowerCase();

  // SSH connection errors
  if (lowerMsg.includes("ssh: connect to host")) {
    return true;
  }

  // Common network error patterns
  if (lowerMsg.includes("could not resolve host")) {
    return true;
  }

  if (lowerMsg.includes("connection refused")) {
    return true;
  }

  if (lowerMsg.includes("connection timed out")) {
    return true;
  }

  if (lowerMsg.includes("unable to access")) {
    return true;
  }

  return false;
}

// ============================================================================
// SyncService
// ============================================================================

export type SyncServiceDeps = {
  versionControlService: VersionControlService;
};

/**
 * Creates a SyncService instance for Git synchronization operations.
 *
 * Usage in CLI (Imperative Shell):
 * ```typescript
 * const syncService = createSyncService({ versionControlService });
 *
 * // Before file operation
 * const prePullResult = await syncService.prePull(input);
 * if (prePullResult.warning) showWarning(prePullResult.warning);
 *
 * // Domain workflow (pure)
 * const result = await EditItemWorkflow.execute(...);
 *
 * // After file operation (TODO: migrate autoCommit here)
 * await executeAutoCommit(...);
 * ```
 */
export function createSyncService(deps: SyncServiceDeps) {
  return {
    /**
     * Pre-pull: Fetch remote changes before file operations.
     *
     * This is a failure-tolerant operation:
     * - If sync is disabled or mode is auto-commit, silently skips
     * - If pull fails (network error, conflicts), returns warning but doesn't fail
     * - The calling code should proceed with the file operation regardless
     *
     * @param input - Configuration for pre-pull operation
     * @returns PrePullResult with pulled/skipped status and optional warning
     */
    prePull: async (input: PrePullInput): Promise<PrePullResult> => {
      // 1. Check if sync is enabled
      if (!input.syncEnabled) {
        return { pulled: false, skipped: true };
      }

      // 2. Check sync mode - only auto-sync and lazy-sync need pre-pull
      if (input.syncMode !== "auto-sync" && input.syncMode !== "lazy-sync") {
        return { pulled: false, skipped: true };
      }

      // 3. Check remote configuration
      if (!input.remote) {
        return { pulled: false, skipped: true };
      }

      // 4. Determine branch
      let branch = input.branch;
      if (!branch) {
        const defaultBranchResult = await deps.versionControlService.getRemoteDefaultBranch(
          input.workspaceRoot,
          input.remote,
        );
        if (defaultBranchResult.type === "error") {
          // Can't determine branch - use "main" as fallback
          branch = "main";
        } else {
          branch = defaultBranchResult.value;
        }
      }

      // 5. Perform pull
      const pullResult = await deps.versionControlService.pull(
        input.workspaceRoot,
        input.remote,
        branch,
      );

      if (pullResult.type === "error") {
        const errorMsg = pullResult.error.message;

        if (isNetworkConnectivityError(errorMsg)) {
          return {
            pulled: false,
            skipped: false,
            warning: { type: "network_error" },
          };
        }

        return {
          pulled: false,
          skipped: false,
          warning: { type: "pull_failed", details: errorMsg },
        };
      }

      return { pulled: true, skipped: false };
    },

    /**
     * Auto-commit: Stage, commit, and optionally push changes.
     *
     * Behavior depends on sync mode:
     * - auto-commit: Commits only (no push)
     * - auto-sync: Commits, then pull(rebase) + push
     * - lazy-sync: Commits, syncs only when threshold met
     *
     * This is a failure-tolerant operation:
     * - Returns error details in result, but never throws
     * - Commits are always created first (offline resilience)
     */
    autoCommit: async (
      input: AutoCommitInput,
      autoCommitDeps: AutoCommitDeps,
    ): Promise<AutoCommitResult> => {
      // 1. Check if sync is enabled
      if (!input.syncEnabled) {
        return { committed: false };
      }

      // 2. Check sync mode
      const mode = input.syncMode;
      if (mode !== "auto-commit" && mode !== "auto-sync" && mode !== "lazy-sync") {
        return { committed: false };
      }

      // 3. Stage files
      const filesToStage = ["items", "tags", "workspace.json"];
      const stageResult = await deps.versionControlService.stage(input.workspaceRoot, filesToStage);
      if (stageResult.type === "error") {
        return {
          committed: false,
          error: { type: "stage_failed", details: stageResult.error.message },
        };
      }

      // 4. Create commit
      const commitMessage = `mm: ${input.summary}`;
      const commitResult = await deps.versionControlService.commit(
        input.workspaceRoot,
        commitMessage,
      );
      if (commitResult.type === "error") {
        const errorMsg = commitResult.error.message.toLowerCase();
        // "nothing to commit" is OK - no changes to commit
        if (errorMsg.includes("nothing to commit") || errorMsg.includes("clean")) {
          return { committed: false };
        }
        return {
          committed: false,
          error: { type: "commit_failed", details: commitResult.error.message },
        };
      }

      // Helper function to perform sync (pull + push)
      const performSync = async (): Promise<AutoCommitResult> => {
        const remote = input.remote;
        const branch = input.branch;

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
            error: {
              type: "get_current_branch_failed",
              details: currentBranchResult.error.message,
            },
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

      // Helper to execute sync with optional wrapper (e.g., loading indicator)
      const executeSync = input.onSync ? () => input.onSync!(performSync) : performSync;

      // 5. Handle sync based on mode
      if (mode === "auto-sync") {
        // Auto-sync: always sync after commit
        return await executeSync();
      }

      if (mode === "lazy-sync") {
        // Lazy-sync: sync only when thresholds are met
        const lazySettings = input.lazy ?? DEFAULT_LAZY_SYNC_SETTINGS;

        // Load current sync state
        const syncStateResult = await autoCommitDeps.stateRepository.loadSyncState();
        if (syncStateResult.type === "error") {
          // Can't load state - just commit without sync
          return { committed: true, pushed: false };
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
          const syncResult = await executeSync();

          if (syncResult.pushed) {
            // Sync succeeded - reset state
            await autoCommitDeps.stateRepository.saveSyncState({
              commitsSinceLastSync: 0,
              lastSyncTimestamp: now,
            });
            return { ...syncResult, syncTriggered: true };
          }

          // Sync failed - don't reset count, but save incremented count
          await autoCommitDeps.stateRepository.saveSyncState({
            commitsSinceLastSync: newCommitCount,
            lastSyncTimestamp: syncState.lastSyncTimestamp,
          });
          return { ...syncResult, syncTriggered: true };
        }

        // Thresholds not met - just save incremented count
        const saveResult = await autoCommitDeps.stateRepository.saveSyncState({
          commitsSinceLastSync: newCommitCount,
          lastSyncTimestamp: syncState.lastSyncTimestamp,
        });

        if (saveResult.type === "error") {
          return {
            committed: true,
            pushed: false,
            error: { type: "state_save_failed", details: saveResult.error.message },
          };
        }

        return { committed: true, pushed: false };
      }

      // Auto-commit mode (no push)
      return {
        committed: true,
        pushed: false,
      };
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
