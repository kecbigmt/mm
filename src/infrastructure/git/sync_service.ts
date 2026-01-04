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
 *   3. autoCommit() - commit and push after file operations (TODO: migrate here)
 */

import { VersionControlService } from "../../domain/services/version_control_service.ts";

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
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
