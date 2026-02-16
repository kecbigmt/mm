import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import {
  CwdResolutionService,
  CwdSaveDependencies,
} from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_parser.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import {
  DirectoryDisplayDependencies,
  formatDirectoryForDisplay,
} from "../../../domain/services/directory_display_service.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { Directory } from "../../../domain/primitives/mod.ts";

type SaveAndDisplayDeps = CwdSaveDependencies & DirectoryDisplayDependencies;

/**
 * Saves the directory to session and displays it.
 * Returns true on success, false on error (errors are logged to stderr).
 */
async function saveAndDisplayDirectory(
  dir: Directory,
  deps: SaveAndDisplayDeps,
  debug: boolean,
  previousDirectory?: Directory,
): Promise<boolean> {
  const saveResult = await CwdResolutionService.setCwd(dir, deps, previousDirectory);
  if (saveResult.type === "error") {
    console.error(formatError(saveResult.error, debug));
    return false;
  }

  const displayResult = await formatDirectoryForDisplay(dir, deps);
  if (displayResult.type === "error") {
    console.error(formatError(displayResult.error, debug));
    return false;
  }
  console.log(displayResult.value);
  return true;
}

export function createCdCommand() {
  return new Command()
    .description("Change current working directory")
    .arguments("[path:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, pathArg?: string) => {
      const debug = isDebugMode();
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(formatError(depsResult.error.error, debug));
        } else {
          console.error(formatError(depsResult.error, debug));
        }
        return;
      }

      const deps = depsResult.value;
      const now = new Date();
      const cwdDeps = {
        sessionRepository: deps.sessionRepository,
        workspacePath: deps.root,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
      };

      // Detect shell-expanded ~ (e.g., /Users/foo or /home/foo)
      const systemHome = Deno.env.get("HOME");
      const isHome = !pathArg || pathArg === "~" ||
        (systemHome !== undefined && pathArg === systemHome);

      if (isHome) {
        // Navigate to today's date (home) - matching bash cd behavior
        const todayDirectoryResult = CwdResolutionService.createTodayDirectory(now, deps.timezone);
        if (todayDirectoryResult.type === "error") {
          console.error(formatError(todayDirectoryResult.error, debug));
          return;
        }

        // Load current cwd to save as previous
        const cwdResult = await CwdResolutionService.getCwd(cwdDeps);
        const currentDirectory = cwdResult.type === "ok" ? cwdResult.value.directory : undefined;

        await saveAndDisplayDirectory(
          todayDirectoryResult.value,
          cwdDeps,
          debug,
          currentDirectory,
        );
        return;
      }

      if (pathArg === "-") {
        // Navigate to previous directory - matching bash cd - behavior
        const previousResult = await CwdResolutionService.getPreviousCwd(cwdDeps);
        if (previousResult.type === "error") {
          console.error(formatError(previousResult.error, debug));
          Deno.exitCode = 1;
          return;
        }

        // Load current cwd to save as previous (for toggle behavior)
        const cwdResult = await CwdResolutionService.getCwd(cwdDeps);
        const currentDirectory = cwdResult.type === "ok" ? cwdResult.value.directory : undefined;

        await saveAndDisplayDirectory(previousResult.value, cwdDeps, debug, currentDirectory);
        return;
      }

      // Get current directory
      const cwdDirectoryResult = await CwdResolutionService.getCwd(cwdDeps);
      if (cwdDirectoryResult.type === "error") {
        console.error(formatError(cwdDirectoryResult.error, debug));
        return;
      }
      if (cwdDirectoryResult.value.warning) {
        console.error(`Warning: ${cwdDirectoryResult.value.warning}`);
      }

      // Parse path expression
      const exprResult = parsePathExpression(pathArg);
      if (exprResult.type === "error") {
        console.error(formatError(exprResult.error, debug));
        return;
      }

      // Create path resolver
      const pathResolver = createPathResolver({
        aliasRepository: deps.aliasRepository,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
        today: now,
        prefixCandidates: () => deps.cacheUpdateService.getAliases(),
      });

      // Resolve expression to directory
      const directoryResult = await pathResolver.resolvePath(
        cwdDirectoryResult.value.directory,
        exprResult.value,
      );

      if (directoryResult.type === "error") {
        console.error(formatError(directoryResult.error, debug));
        return;
      }

      // Validate directory (for item directories, check existence)
      const validateResult = await CwdResolutionService.validateDirectory(
        directoryResult.value,
        {
          itemRepository: deps.itemRepository,
        },
      );

      if (validateResult.type === "error") {
        console.error(formatError(validateResult.error, debug));
        return;
      }

      await saveAndDisplayDirectory(
        validateResult.value,
        cwdDeps,
        debug,
        cwdDirectoryResult.value.directory,
      );
    });
}
