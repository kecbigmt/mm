import { AutoCommitError, AutoCommitWorkflow } from "../../domain/workflows/auto_commit.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";

export type AutoCommitHelperDeps = {
  workspaceRoot: string;
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

function formatAutoCommitError(error: AutoCommitError): string {
  switch (error.type) {
    case "network_error":
      return "Warning: Auto-sync failed - cannot connect to remote repository.\nChanges are saved locally. Sync again when online with 'mm sync'.";
    case "no_remote_configured":
      return "Warning: Auto-sync skipped - no remote configured. Run 'mm sync init <remote-url>' first.";
    case "no_branch_configured":
      return "Warning: Auto-sync skipped - no branch configured.";
    case "pull_failed":
      return `Warning: Auto-sync pull failed: ${error.details}`;
    case "push_failed":
      return `Warning: Auto-sync push failed: ${error.details}`;
    case "stage_failed":
      return `Warning: Auto-commit stage failed: ${error.details}`;
    case "commit_failed":
      return `Warning: Auto-commit failed: ${error.details}`;
    case "get_current_branch_failed":
      return `Warning: Auto-sync failed - cannot get current branch: ${error.details}`;
  }
}

/**
 * Helper function to trigger auto-commit after a state-changing command
 *
 * Usage:
 * ```ts
 * await executeAutoCommit({
 *   workspaceRoot: deps.root,
 *   versionControlService: deps.versionControlService,
 *   workspaceRepository: deps.workspaceRepository,
 * }, "create new note");
 * ```
 *
 * This function is failure-tolerant and will not throw errors.
 * Auto-commit runs silently on success.
 * If auto-commit fails, it logs a warning without blocking the command.
 */
export async function executeAutoCommit(
  deps: AutoCommitHelperDeps,
  summary: string,
): Promise<void> {
  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: deps.workspaceRoot,
      summary,
    },
    {
      versionControlService: deps.versionControlService,
      workspaceRepository: deps.workspaceRepository,
    },
  );

  // AutoCommitWorkflow never returns error (Result<T, never>)
  if (result.type === "ok") {
    const autoCommitResult = result.value;

    // Display warning messages for errors
    if (autoCommitResult.error) {
      console.warn(formatAutoCommitError(autoCommitResult.error));
    }
  }
}
