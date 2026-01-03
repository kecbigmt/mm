import { Result } from "../../shared/result.ts";
import { VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";

export type PrePullInput = {
  workspaceRoot: string;
  /** Optional wrapper for pull operation (e.g., to show loading indicator) */
  onPull?: <T>(operation: () => Promise<T>) => Promise<T>;
};

export type PrePullDependencies = {
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

export type PrePullWarning =
  | { type: "network_error" }
  | { type: "pull_failed"; details: string }
  | { type: "no_remote_configured" }
  | { type: "no_branch_configured" };

export type PrePullResult = {
  pulled: boolean;
  skipped: boolean;
  warning?: PrePullWarning;
};

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

/**
 * Pre-pull workflow
 *
 * Pulls remote changes before file operations when sync.mode is "auto-sync" or "lazy-sync".
 *
 * This workflow is designed to be failure-tolerant:
 * - If sync is not enabled or mode is auto-commit, it silently skips
 * - If pull fails (network error, conflicts), it returns a warning but doesn't fail
 * - The calling code should proceed with the file operation regardless
 */
export const PrePullWorkflow = {
  execute: async (
    input: PrePullInput,
    deps: PrePullDependencies,
  ): Promise<Result<PrePullResult, never>> => {
    // 1. Load workspace settings
    const settingsResult = await deps.workspaceRepository.load(input.workspaceRoot);
    if (settingsResult.type === "error") {
      // Cannot load settings - skip pre-pull
      return Result.ok({ pulled: false, skipped: true });
    }

    const settings = settingsResult.value;

    // 2. Check if sync is enabled
    if (!settings.data.sync.enabled) {
      return Result.ok({ pulled: false, skipped: true });
    }

    // 3. Check sync mode - only auto-sync and lazy-sync need pre-pull
    const mode = settings.data.sync.mode;
    if (mode !== "auto-sync" && mode !== "lazy-sync") {
      return Result.ok({ pulled: false, skipped: true });
    }

    // 4. Check remote configuration
    const remote = settings.data.sync.git?.remote;
    if (!remote) {
      return Result.ok({ pulled: false, skipped: true });
    }

    // 5. Determine branch (use configured or fetch default)
    let branch = settings.data.sync.git?.branch;
    if (!branch) {
      const defaultBranchResult = await deps.versionControlService.getRemoteDefaultBranch(
        input.workspaceRoot,
        remote,
      );
      if (defaultBranchResult.type === "error") {
        // Can't determine branch - use "main" as fallback
        branch = "main";
      } else {
        branch = defaultBranchResult.value;
      }
    }

    // 6. Perform pull
    const performPull = async (): Promise<PrePullResult> => {
      const pullResult = await deps.versionControlService.pull(
        input.workspaceRoot,
        remote,
        branch!,
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
    };

    // Execute with optional callback wrapper
    if (input.onPull) {
      return Result.ok(await input.onPull(performPull));
    }

    return Result.ok(await performPull());
  },
};
