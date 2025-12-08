import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { SyncInitWorkflow } from "../../../domain/workflows/sync_init.ts";

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
        console.error("Sync init failed:", result.error);
        Deno.exit(1);
      }

      console.log("Workspace git repository initialized and configured.");
    });

  return new Command()
    .description("Sync workspace with remote repository")
    .command("init", initCommand);
};
