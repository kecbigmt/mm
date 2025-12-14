import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { SyncInitWorkflow } from "../../../domain/workflows/sync_init.ts";
import { SyncPushValidationError, SyncPushWorkflow } from "../../../domain/workflows/sync_push.ts";
import { SyncPullValidationError, SyncPullWorkflow } from "../../../domain/workflows/sync_pull.ts";
import { SyncWorkflow } from "../../../domain/workflows/sync.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";

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

      const result = await SyncPushWorkflow.execute(
        {
          workspaceRoot: deps.root,
          force,
        },
        {
          gitService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
        },
      );

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

      console.log(result.value.trim());
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

      const result = await SyncPullWorkflow.execute(
        {
          workspaceRoot: deps.root,
        },
        {
          gitService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
        },
      );

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

      console.log(result.value.trim());
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

      const result = await SyncWorkflow.execute(
        { workspaceRoot: deps.root },
        {
          gitService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
        },
      );

      if (result.type === "error") {
        const error = result.error;
        if (isSyncPullValidationError(error)) {
          console.error(`error: ${formatSyncPullError(error)}`);
        } else if (isSyncPushValidationError(error)) {
          console.error(`error: ${formatSyncPushError(error)}`);
        } else {
          const debug = isDebugMode();
          console.error(formatError(error, debug));
        }
        Deno.exit(1);
      }

      console.log(result.value.trim());
    })
    .command("init", initCommand)
    .command("push", pushCommand)
    .command("pull", pullCommand);
};
