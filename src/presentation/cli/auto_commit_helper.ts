import {
  AutoSyncError,
  createSyncService,
  SyncService,
} from "../../infrastructure/git/sync_service.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { StateRepository, SyncState } from "../../domain/repositories/state_repository.ts";
import { withLoadingIndicator } from "./utils/loading_indicator.ts";
import { DEFAULT_AUTO_SYNC_SETTINGS } from "../../domain/models/workspace.ts";

export type AutoCommitHelperDeps = {
  workspaceRoot: string;
  versionControlService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
  stateRepository: StateRepository;
  syncService?: SyncService;
};

function formatAutoCommitError(error: AutoSyncError): string {
  switch (error.type) {
    case "network_error":
      return "Warning: Auto-sync failed - cannot connect to remote repository.\nChanges are saved locally. Sync again when online with 'mm sync'.";
    case "no_remote_configured":
      return "Warning: Auto-sync skipped - no remote configured. Run 'mm sync init <remote-url>' first.";
    case "no_branch_configured":
      return "Warning: Auto-sync skipped - no branch configured.";
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
 * Determines if a sync should be triggered based on threshold settings.
 *
 * For auto-sync mode:
 * - Uses threshold settings from sync.lazy config or DEFAULT_AUTO_SYNC_SETTINGS
 * - Default is commits=1 (immediate sync) and minutes=0 (disabled)
 * - When minutes=0, time threshold is disabled
 */
function shouldTriggerSync(
  syncState: SyncState,
  lazyConfig: { commits?: number; minutes?: number } | undefined,
): boolean {
  // Use explicit lazy config if provided, otherwise use auto-sync defaults (immediate sync)
  const commitThreshold = lazyConfig?.commits ?? DEFAULT_AUTO_SYNC_SETTINGS.commits;
  const minuteThreshold = lazyConfig?.minutes ?? DEFAULT_AUTO_SYNC_SETTINGS.minutes;

  // Check commit count threshold (after incrementing)
  const newCommitCount = syncState.commitsSinceLastSync + 1;
  if (newCommitCount >= commitThreshold) {
    return true;
  }

  // Check time threshold (only if minutes > 0)
  if (minuteThreshold > 0 && syncState.lastSyncTimestamp !== null) {
    const minutesSinceLastSync = (Date.now() - syncState.lastSyncTimestamp) / (60 * 1000);
    if (minutesSinceLastSync >= minuteThreshold) {
      return true;
    }
  }

  return false;
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

  const syncMode = settings.data.sync.mode;
  const remote = settings.data.sync.git?.remote ?? undefined;
  const branch = settings.data.sync.git?.branch ?? undefined;
  const lazyConfig = settings.data.sync.lazy ?? undefined;

  // Step 1: Commit
  const commitResult = await syncService.commit({
    workspaceRoot: deps.workspaceRoot,
    summary,
  });

  if (commitResult.error) {
    console.warn(formatAutoCommitError(commitResult.error));
    return;
  }

  // If nothing was committed, no need to push
  if (!commitResult.committed) {
    return;
  }

  // Step 2: Determine if push is needed based on sync mode
  //
  // Note: We intentionally do NOT pull before push here.
  // - Pre-pull already happened before the file operation (in executePrePull)
  // - Adding another pull here would double the network latency for every operation
  // - This tool targets single-user multi-device sync, where concurrent edits are rare
  // - If push fails due to non-fast-forward, user can run `mm sync` manually
  //
  if (syncMode === "auto-commit") {
    // auto-commit mode: only commit, no push
    return;
  }

  if (syncMode === "auto-sync") {
    // auto-sync mode: push based on thresholds
    // Default is commits=1 (immediate sync), can be configured via sync.lazy settings
    const syncStateResult = await deps.stateRepository.loadSyncState();
    const syncState: SyncState = syncStateResult.type === "ok"
      ? syncStateResult.value
      : { commitsSinceLastSync: 0, lastSyncTimestamp: null };

    const shouldSync = shouldTriggerSync(syncState, lazyConfig);

    if (shouldSync) {
      // Trigger sync
      const pushResult = await withLoadingIndicator("Syncing...", () =>
        syncService.push({
          workspaceRoot: deps.workspaceRoot,
          remote,
          branch,
        }));

      if (pushResult.error) {
        // Sync failed - increment commit count but don't reset
        const newState: SyncState = {
          commitsSinceLastSync: syncState.commitsSinceLastSync + 1,
          lastSyncTimestamp: syncState.lastSyncTimestamp,
        };
        const saveResult = await deps.stateRepository.saveSyncState(newState);
        if (saveResult.type === "error") {
          console.warn(
            formatAutoCommitError({ type: "state_save_failed", details: saveResult.error.message }),
          );
        }
        console.warn(formatAutoCommitError(pushResult.error));
      } else {
        // Sync succeeded - reset commit count and update timestamp
        const newState: SyncState = {
          commitsSinceLastSync: 0,
          lastSyncTimestamp: Date.now(),
        };
        const saveResult = await deps.stateRepository.saveSyncState(newState);
        if (saveResult.type === "error") {
          console.warn(
            formatAutoCommitError({ type: "state_save_failed", details: saveResult.error.message }),
          );
        }
      }
    } else {
      // Threshold not met - just increment commit count
      const newState: SyncState = {
        commitsSinceLastSync: syncState.commitsSinceLastSync + 1,
        lastSyncTimestamp: syncState.lastSyncTimestamp,
      };
      const saveResult = await deps.stateRepository.saveSyncState(newState);
      if (saveResult.type === "error") {
        console.warn(
          formatAutoCommitError({ type: "state_save_failed", details: saveResult.error.message }),
        );
      }
    }
  }
}
