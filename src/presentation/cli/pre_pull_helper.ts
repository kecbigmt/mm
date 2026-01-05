import { createSyncService, PullWarning } from "../../infrastructure/git/sync_service.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { withLoadingIndicator } from "./utils/loading_indicator.ts";

export type PrePullHelperDeps = {
  workspaceRoot: string;
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
};

function formatPullWarning(warning: PullWarning): string {
  switch (warning.type) {
    case "network_error":
      return "Warning: Pre-sync pull failed - cannot connect to remote repository.\nProceeding with local data.";
    case "pull_failed":
      return `Warning: Pre-sync pull failed: ${warning.details}\nProceeding with local data.`;
  }
}

/**
 * Helper function to execute pull before a state-changing command
 *
 * This function orchestrates the pull operation in the Imperative Shell (CLI):
 * 1. Loads workspace settings to determine sync configuration
 * 2. Calls SyncService.pull() with the appropriate parameters
 * 3. Displays warnings if pull fails (but doesn't block the operation)
 *
 * Usage:
 * ```ts
 * await executePrePull({
 *   workspaceRoot: deps.root,
 *   versionControlService: deps.versionControlService,
 *   workspaceRepository: deps.workspaceRepository,
 * });
 * // ... proceed with domain workflow ...
 * ```
 *
 * This function is failure-tolerant and will not throw errors.
 * Pull runs silently on success.
 * If pull fails, it logs a warning but does not block the command.
 */
export async function executePrePull(deps: PrePullHelperDeps): Promise<void> {
  // 1. Load workspace settings
  const settingsResult = await deps.workspaceRepository.load(deps.workspaceRoot);
  if (settingsResult.type === "error") {
    // Cannot load settings - skip pull silently
    return;
  }

  const settings = settingsResult.value;

  // 2. Create SyncService and execute pull
  const syncService = createSyncService({
    versionControlService: deps.versionControlService,
  });

  const pullResult = await withLoadingIndicator("Syncing...", () =>
    syncService.pull({
      workspaceRoot: deps.workspaceRoot,
      syncEnabled: settings.data.sync.enabled,
      syncMode: settings.data.sync.mode,
      remote: settings.data.sync.git?.remote ?? undefined,
      branch: settings.data.sync.git?.branch,
    }));

  // 3. Display warning messages for errors
  if (pullResult.warning) {
    console.warn(formatPullWarning(pullResult.warning));
  }
}
