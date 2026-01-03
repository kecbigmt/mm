import { PrePullWarning, PrePullWorkflow } from "../../domain/workflows/pre_pull.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { withLoadingIndicator } from "./utils/loading_indicator.ts";

export type PrePullHelperDeps = {
  workspaceRoot: string;
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

function formatPrePullWarning(warning: PrePullWarning): string {
  switch (warning.type) {
    case "network_error":
      return "Warning: Pre-sync pull failed - cannot connect to remote repository.\nProceeding with local data.";
    case "pull_failed":
      return `Warning: Pre-sync pull failed: ${warning.details}\nProceeding with local data.`;
    case "no_remote_configured":
      return "Warning: Pre-sync pull skipped - no remote configured.";
    case "no_branch_configured":
      return "Warning: Pre-sync pull skipped - no branch configured.";
  }
}

/**
 * Helper function to execute pre-pull before a state-changing command
 *
 * Usage:
 * ```ts
 * await executePrePull({
 *   workspaceRoot: deps.root,
 *   versionControlService: deps.versionControlService,
 *   workspaceRepository: deps.workspaceRepository,
 * });
 * ```
 *
 * This function is failure-tolerant and will not throw errors.
 * Pre-pull runs silently on success.
 * If pre-pull fails, it logs a warning but does not block the command.
 */
export async function executePrePull(deps: PrePullHelperDeps): Promise<void> {
  const result = await PrePullWorkflow.execute(
    {
      workspaceRoot: deps.workspaceRoot,
      onPull: (operation) => withLoadingIndicator("Syncing...", operation),
    },
    {
      versionControlService: deps.versionControlService,
      workspaceRepository: deps.workspaceRepository,
    },
  );

  // PrePullWorkflow never returns error (Result<T, never>)
  if (result.type === "ok") {
    const prePullResult = result.value;

    // Display warning messages for errors
    if (prePullResult.warning) {
      console.warn(formatPrePullWarning(prePullResult.warning));
    }
  }
}
