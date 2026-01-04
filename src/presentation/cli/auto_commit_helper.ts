import {
  AutoCommitError,
  createSyncService,
  SyncService,
} from "../../infrastructure/git/sync_service.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { StateRepository } from "../../domain/repositories/state_repository.ts";
import { withLoadingIndicator } from "./utils/loading_indicator.ts";

export type AutoCommitHelperDeps = {
  workspaceRoot: string;
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
  stateRepository: StateRepository;
  syncService?: SyncService;
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
    case "state_save_failed":
      return `Warning: Failed to save sync state: ${error.details}`;
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
 *   stateRepository: deps.stateRepository,
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
  // Load workspace settings
  const settingsResult = await deps.workspaceRepository.load(deps.workspaceRoot);
  if (settingsResult.type === "error") {
    // Cannot load settings - skip auto-commit
    return;
  }

  const settings = settingsResult.value;

  // Check if sync is enabled
  if (!settings.data.sync.enabled) {
    return;
  }

  const syncService = deps.syncService ??
    createSyncService({ versionControlService: deps.versionControlService });

  const result = await syncService.autoCommit(
    {
      workspaceRoot: deps.workspaceRoot,
      summary,
      syncEnabled: settings.data.sync.enabled,
      syncMode: settings.data.sync.mode,
      remote: settings.data.sync.git?.remote ?? undefined,
      branch: settings.data.sync.git?.branch ?? undefined,
      lazy: settings.data.sync.lazy ?? undefined,
      onSync: (operation) => withLoadingIndicator("Syncing...", operation),
    },
    { stateRepository: deps.stateRepository },
  );

  // Display warning messages for errors
  if (result.error) {
    console.warn(formatAutoCommitError(result.error));
  }
}
