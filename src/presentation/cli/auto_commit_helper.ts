import { AutoCommitWorkflow } from "../../domain/workflows/auto_commit.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";

export type AutoCommitHelperDeps = {
  workspaceRoot: string;
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

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

    // Only display warnings (failures), not success messages
    if (autoCommitResult.message?.startsWith("Warning:")) {
      console.warn(autoCommitResult.message);
    }
  }
}
