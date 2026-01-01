import { Command } from "@cliffy/command";
import { join } from "@std/path";
import { loadCliDependencies } from "../dependencies.ts";
import { SyncInitWorkflow } from "../../../domain/workflows/sync_init.ts";
import { SyncPushValidationError, SyncPushWorkflow } from "../../../domain/workflows/sync_push.ts";
import { SyncPullValidationError, SyncPullWorkflow } from "../../../domain/workflows/sync_pull.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { VersionControlService } from "../../../domain/services/version_control_service.ts";
import { createWorkspaceScanner } from "../../../infrastructure/fileSystem/workspace_scanner.ts";
import { rebuildFromItems } from "../../../infrastructure/fileSystem/index_rebuilder.ts";
import {
  replaceIndex,
  writeAliasIndex,
  writeGraphIndex,
} from "../../../infrastructure/fileSystem/index_writer.ts";
import { Item } from "../../../domain/models/item.ts";
import { withLoadingIndicator } from "../utils/loading_indicator.ts";

type IndexRebuildResult =
  | { status: "rebuilt"; itemsProcessed: number; edgesCreated: number; aliasesCreated: number }
  | { status: "skipped"; reason: "no_changes" }
  | { status: "skipped"; reason: "diff_failed"; message: string }
  | { status: "failed"; message: string };

async function cleanupTempDirs(workspaceRoot: string): Promise<void> {
  try {
    await Deno.remove(join(workspaceRoot, ".index", ".tmp-graph"), { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
  try {
    await Deno.remove(join(workspaceRoot, ".index", ".tmp-aliases"), { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function rebuildIndexIfNeeded(
  workspaceRoot: string,
  gitService: VersionControlService,
): Promise<IndexRebuildResult> {
  // Check if items changed after pull
  // Use ORIG_HEAD instead of HEAD@{1} because:
  // - git pull --rebase sets ORIG_HEAD to the pre-rebase HEAD
  // - HEAD@{1} after rebase points to the last cherry-pick step, not pre-rebase state
  // - This ensures we detect upstream changes even when local commits are rebased
  const diffResult = await gitService.hasChangesInPath(
    workspaceRoot,
    "ORIG_HEAD",
    "HEAD",
    "items/",
  );

  if (diffResult.type === "error") {
    return {
      status: "skipped",
      reason: "diff_failed",
      message: diffResult.error.message,
    };
  }

  if (!diffResult.value) {
    return { status: "skipped", reason: "no_changes" };
  }

  // Items changed, rebuild index
  const scanner = createWorkspaceScanner(workspaceRoot);
  const items: Item[] = [];

  for await (const result of scanner.scanAllItems()) {
    if (result.type === "error") {
      return {
        status: "failed",
        message: `Failed to scan items: ${result.error.message}`,
      };
    }
    items.push(result.value);
  }

  const rebuildResult = await rebuildFromItems(items);
  if (rebuildResult.type === "error") {
    return {
      status: "failed",
      message: `Failed to rebuild index: ${rebuildResult.error.message}`,
    };
  }

  const { graphEdges, aliases, itemsProcessed, edgesCreated, aliasesCreated } = rebuildResult.value;

  // Write to temp directories
  const graphWriteResult = await writeGraphIndex(workspaceRoot, graphEdges, { temp: true });
  if (graphWriteResult.type === "error") {
    await cleanupTempDirs(workspaceRoot);
    return {
      status: "failed",
      message: `Failed to write graph index: ${graphWriteResult.error.message}`,
    };
  }

  const aliasWriteResult = await writeAliasIndex(workspaceRoot, aliases, { temp: true });
  if (aliasWriteResult.type === "error") {
    await cleanupTempDirs(workspaceRoot);
    return {
      status: "failed",
      message: `Failed to write alias index: ${aliasWriteResult.error.message}`,
    };
  }

  // Replace index atomically
  const replaceResult = await replaceIndex(workspaceRoot);
  if (replaceResult.type === "error") {
    await cleanupTempDirs(workspaceRoot);
    return {
      status: "failed",
      message: `Failed to replace index: ${replaceResult.error.message}`,
    };
  }

  return {
    status: "rebuilt",
    itemsProcessed,
    edgesCreated,
    aliasesCreated,
  };
}

function formatSyncPushError(error: SyncPushValidationError): string {
  switch (error.type) {
    case "git_not_enabled":
      return "Git sync is not enabled. Run 'mm sync init <remote-url>' first.";
    case "no_remote_configured":
      return "No remote configured. Run 'mm sync init <remote-url>' first.";
    case "branch_mismatch":
      return `Current branch "${error.currentBranch}" does not match configured branch "${error.configuredBranch}". Check out "${error.configuredBranch}" or update workspace.json.`;
  }
}

function formatSyncPullError(error: SyncPullValidationError): string {
  switch (error.type) {
    case "git_not_enabled":
      return "Git sync is not enabled. Run 'mm sync init <remote-url>' first.";
    case "no_remote_configured":
      return "No remote configured. Run 'mm sync init <remote-url>' first.";
    case "uncommitted_changes":
      return "Working tree has uncommitted changes. Commit or stash changes before pulling.";
    case "branch_mismatch":
      return `Current branch '${error.currentBranch}' does not match configured branch '${error.configuredBranch}'. Checkout '${error.configuredBranch}' or update workspace.json to match current branch.`;
  }
}

function isSyncPushValidationError(error: unknown): error is SyncPushValidationError {
  return (
    typeof error === "object" && error !== null &&
    "type" in error &&
    (error.type === "git_not_enabled" ||
      error.type === "no_remote_configured" ||
      error.type === "branch_mismatch")
  );
}

function isSyncPullValidationError(error: unknown): error is SyncPullValidationError {
  return (
    typeof error === "object" && error !== null &&
    "type" in error &&
    (error.type === "git_not_enabled" ||
      error.type === "no_remote_configured" ||
      error.type === "uncommitted_changes" ||
      error.type === "branch_mismatch")
  );
}

export const createSyncCommand = () => {
  const initCommand = new Command()
    .description("Initialize git sync with remote")
    .arguments("<remote-url:string>")
    .option("-b, --branch <branch:string>", "Branch to sync with (default: main)")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-f, --force", "Force overwrite existing remote config")
    .action(async (options: Record<string, unknown>, remoteUrl: string) => {
      const workspace = typeof options.workspace === "string" ? options.workspace : undefined;
      const branch = typeof options.branch === "string" ? options.branch : undefined;
      const force = options.force === true;
      const depsResult = await loadCliDependencies(workspace);
      if (depsResult.type === "error") {
        console.error(depsResult.error);
        Deno.exit(1);
      }
      const deps = depsResult.value;

      const result = await SyncInitWorkflow.execute(
        {
          workspaceRoot: deps.root,
          remoteUrl,
          branch,
          force,
        },
        {
          gitService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
          writeFile: (path, content) => Deno.writeTextFile(path, content),
          readFile: (path) => Deno.readTextFile(path),
          fileExists: async (path) => {
            try {
              await Deno.stat(path);
              return true;
            } catch {
              return false;
            }
          },
        },
      );

      if (result.type === "error") {
        const error = result.error;
        const debug = isDebugMode();
        console.error(formatError(error, debug));
        Deno.exit(1);
      }

      console.log("Workspace git repository initialized and configured.");
    });

  const pushCommand = new Command()
    .description("Push local commits to remote repository")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-f, --force", "Force push to remote")
    .action(async (options: Record<string, unknown>) => {
      const workspace = typeof options.workspace === "string" ? options.workspace : undefined;
      const force = options.force === true;
      const depsResult = await loadCliDependencies(workspace);
      if (depsResult.type === "error") {
        console.error(depsResult.error);
        Deno.exit(1);
      }
      const deps = depsResult.value;

      const result = await withLoadingIndicator("Pushing...", () =>
        SyncPushWorkflow.execute(
          {
            workspaceRoot: deps.root,
            force,
          },
          {
            gitService: deps.versionControlService,
            workspaceRepository: deps.workspaceRepository,
          },
        ));

      if (result.type === "error") {
        const error = result.error;
        if (isSyncPushValidationError(error)) {
          console.error(`error: ${formatSyncPushError(error)}`);
        } else {
          const debug = isDebugMode();
          console.error(formatError(error, debug));
        }
        Deno.exit(1);
      }

      // Silent on success
      const output = result.value.trim();
      if (output && !output.toLowerCase().includes("everything up-to-date")) {
        console.log(output);
      }
    });

  const pullCommand = new Command()
    .description("Pull changes from remote repository")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>) => {
      const workspace = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspace);
      if (depsResult.type === "error") {
        console.error(depsResult.error);
        Deno.exit(1);
      }
      const deps = depsResult.value;

      const result = await withLoadingIndicator("Pulling...", () =>
        SyncPullWorkflow.execute(
          {
            workspaceRoot: deps.root,
          },
          {
            gitService: deps.versionControlService,
            workspaceRepository: deps.workspaceRepository,
          },
        ));

      if (result.type === "error") {
        const error = result.error;
        if (isSyncPullValidationError(error)) {
          console.error(`error: ${formatSyncPullError(error)}`);
        } else {
          const debug = isDebugMode();
          console.error(formatError(error, debug));

          // Provide actionable guidance for specific error types
          if (
            typeof error === "object" && error !== null &&
            "kind" in error && error.kind === "VersionControlNotInitializedError"
          ) {
            console.error("\nRun 'mm sync init <remote-url>' or 'git init' to initialize.");
          }
        }

        Deno.exit(1);
      }

      // Silent on success
      const output = result.value.trim();
      if (output && !output.toLowerCase().includes("already up to date")) {
        console.log(output);
      }

      // Rebuild index if items changed
      const rebuildResult = await rebuildIndexIfNeeded(
        deps.root,
        deps.versionControlService,
      );

      switch (rebuildResult.status) {
        case "rebuilt":
          console.log(
            `Index rebuilt: ${rebuildResult.itemsProcessed} items, ${rebuildResult.edgesCreated} edges, ${rebuildResult.aliasesCreated} aliases`,
          );
          break;
        case "skipped":
          if (rebuildResult.reason === "diff_failed") {
            console.warn(`Warning: Could not detect item changes: ${rebuildResult.message}`);
          }
          // no_changes: silent, no message needed
          break;
        case "failed":
          console.warn(`Warning: Index rebuild failed: ${rebuildResult.message}`);
          break;
      }
    });

  return new Command()
    .description("Sync workspace with remote repository")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>) => {
      // Default action when no subcommand is specified: pull + push
      const workspace = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspace);
      if (depsResult.type === "error") {
        console.error(depsResult.error);
        Deno.exit(1);
      }
      const deps = depsResult.value;

      // Pull with loading indicator
      const pullResult = await withLoadingIndicator("Pulling...", () =>
        SyncPullWorkflow.execute(
          { workspaceRoot: deps.root },
          {
            gitService: deps.versionControlService,
            workspaceRepository: deps.workspaceRepository,
          },
        ));

      if (pullResult.type === "error") {
        const error = pullResult.error;
        if (isSyncPullValidationError(error)) {
          console.error(`error: ${formatSyncPullError(error)}`);
        } else {
          const debug = isDebugMode();
          console.error(formatError(error, debug));
        }
        Deno.exit(1);
      }

      // Rebuild index if items changed during pull
      const rebuildResult = await rebuildIndexIfNeeded(
        deps.root,
        deps.versionControlService,
      );

      switch (rebuildResult.status) {
        case "rebuilt":
          console.log(
            `Index rebuilt: ${rebuildResult.itemsProcessed} items, ${rebuildResult.edgesCreated} edges, ${rebuildResult.aliasesCreated} aliases`,
          );
          break;
        case "skipped":
          if (rebuildResult.reason === "diff_failed") {
            console.warn(`Warning: Could not detect item changes: ${rebuildResult.message}`);
          }
          // no_changes: silent, no message needed
          break;
        case "failed":
          console.warn(`Warning: Index rebuild failed: ${rebuildResult.message}`);
          break;
      }

      // Push with loading indicator
      const pushResult = await withLoadingIndicator("Pushing...", () =>
        SyncPushWorkflow.execute(
          { workspaceRoot: deps.root, force: false },
          {
            gitService: deps.versionControlService,
            workspaceRepository: deps.workspaceRepository,
          },
        ));

      if (pushResult.type === "error") {
        const error = pushResult.error;
        if (isSyncPushValidationError(error)) {
          console.error(`error: ${formatSyncPushError(error)}`);
        } else {
          const debug = isDebugMode();
          console.error(formatError(error, debug));
        }
        Deno.exit(1);
      }

      // Silent on success - no output needed
    })
    .command("init", initCommand)
    .command("push", pushCommand)
    .command("pull", pullCommand);
};
