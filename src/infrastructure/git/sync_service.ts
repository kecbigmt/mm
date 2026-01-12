/**
 * SyncService - Infrastructure service for Git synchronization operations
 *
 * This service handles Git-based sync operations as infrastructure concerns,
 * not domain workflows. Following DMMF's "Functional Core, Imperative Shell"
 * pattern, these I/O operations belong in the infrastructure layer.
 *
 * The CLI (Imperative Shell) orchestrates:
 *   1. pull() - fetch remote changes before file operations
 *   2. Domain Workflow - pure business logic
 *   3. commit() + push() - commit and push after file operations
 */

import { VersionControlService } from "../../domain/services/version_control_service.ts";

// ============================================================================
// Pull Types
// ============================================================================

export type PullWarning =
  | { type: "network_error" }
  | { type: "pull_failed"; details: string };

export type PullResult = {
  pulled: boolean;
  skipped: boolean;
  warning?: PullWarning;
};

export type PullInput = {
  workspaceRoot: string;
  syncEnabled: boolean;
  syncMode: "auto-commit" | "auto-sync" | "lazy-sync";
  remote?: string;
  branch?: string;
};

// ============================================================================
// Commit Types
// ============================================================================

export type CommitError =
  | { type: "stage_failed"; details: string }
  | { type: "commit_failed"; details: string };

export type CommitResult = {
  committed: boolean;
  error?: CommitError;
};

export type CommitInput = {
  workspaceRoot: string;
  summary: string;
};

// ============================================================================
// Push Types
// ============================================================================

export type PushError =
  | { type: "network_error" }
  | { type: "push_failed"; details: string }
  | { type: "no_remote_configured" }
  | { type: "no_branch_configured" }
  | { type: "get_current_branch_failed"; details: string };

export type PushResult = {
  pushed: boolean;
  error?: PushError;
};

export type PushInput = {
  workspaceRoot: string;
  remote?: string;
  branch?: string;
};

// ============================================================================
// Combined Types (for helper layer)
// ============================================================================

export type AutoSyncError = CommitError | PushError | {
  type: "state_save_failed";
  details: string;
};

export type AutoSyncResult = {
  committed: boolean;
  pushed: boolean;
  syncTriggered?: boolean;
  error?: AutoSyncError;
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
 * const pullResult = await syncService.pull(input);
 * if (pullResult.warning) showWarning(pullResult.warning);
 *
 * // Domain workflow (pure)
 * const result = await EditItemWorkflow.execute(...);
 *
 * // After file operation
 * const commitResult = await syncService.commit({ workspaceRoot, summary });
 * if (commitResult.committed && shouldPush) {
 *   await syncService.push({ workspaceRoot, remote, branch });
 * }
 * ```
 */
export function createSyncService(deps: SyncServiceDeps) {
  return {
    /**
     * Pull: Fetch remote changes.
     *
     * This is a failure-tolerant operation:
     * - If sync is disabled or mode is auto-commit, silently skips
     * - If pull fails (network error, conflicts), returns warning but doesn't fail
     * - The calling code should proceed with the file operation regardless
     */
    pull: async (input: PullInput): Promise<PullResult> => {
      // 1. Check if sync is enabled
      if (!input.syncEnabled) {
        return { pulled: false, skipped: true };
      }

      // 2. Check sync mode - only auto-sync and lazy-sync need pull
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
     * Commit: Stage and commit changes.
     *
     * This is a failure-tolerant operation:
     * - Returns error details in result, but never throws
     * - "nothing to commit" is treated as success (committed: false, no error)
     */
    commit: async (input: CommitInput): Promise<CommitResult> => {
      // 1. Stage files
      const filesToStage = ["items", "tags", "workspace.json"];
      const stageResult = await deps.versionControlService.stage(input.workspaceRoot, filesToStage);
      if (stageResult.type === "error") {
        return {
          committed: false,
          error: { type: "stage_failed", details: stageResult.error.message },
        };
      }

      // 2. Create commit
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

      return { committed: true };
    },

    /**
     * Push: Push commits to remote.
     *
     * This is a failure-tolerant operation:
     * - Returns error details in result, but never throws
     * - Does NOT pull before push (intentional design choice - see auto_commit_helper.ts)
     * - If push fails due to non-fast-forward, caller should handle gracefully
     */
    push: async (input: PushInput): Promise<PushResult> => {
      const { remote, branch } = input;

      if (!remote) {
        return {
          pushed: false,
          error: { type: "no_remote_configured" },
        };
      }

      if (!branch) {
        return {
          pushed: false,
          error: { type: "no_branch_configured" },
        };
      }

      // Get current branch
      const currentBranchResult = await deps.versionControlService.getCurrentBranch(
        input.workspaceRoot,
      );
      if (currentBranchResult.type === "error") {
        return {
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
        return { pushed: true };
      }

      const pushErrorMsg = pushResult.error.message;

      if (isNetworkConnectivityError(pushErrorMsg)) {
        return {
          pushed: false,
          error: { type: "network_error" },
        };
      }

      return {
        pushed: false,
        error: { type: "push_failed", details: pushErrorMsg },
      };
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
