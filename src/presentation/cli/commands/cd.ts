import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import {
  CwdResolutionService,
  CwdSaveDependencies,
} from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_parser.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import {
  formatPlacementForDisplay,
  PlacementDisplayDependencies,
} from "../../../domain/services/placement_display_service.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { Placement } from "../../../domain/primitives/mod.ts";

type SaveAndDisplayDeps = CwdSaveDependencies & PlacementDisplayDependencies;

/**
 * Saves the placement to session and displays it.
 * Returns true on success, false on error (errors are logged to stderr).
 */
async function saveAndDisplayPlacement(
  placement: Placement,
  deps: SaveAndDisplayDeps,
  debug: boolean,
  previousPlacement?: Placement,
): Promise<boolean> {
  const saveResult = await CwdResolutionService.setCwd(placement, deps, previousPlacement);
  if (saveResult.type === "error") {
    console.error(formatError(saveResult.error, debug));
    return false;
  }

  const displayResult = await formatPlacementForDisplay(placement, deps);
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
        const todayPlacementResult = CwdResolutionService.createTodayPlacement(now, deps.timezone);
        if (todayPlacementResult.type === "error") {
          console.error(formatError(todayPlacementResult.error, debug));
          return;
        }

        // Load current cwd to save as previous
        const cwdResult = await CwdResolutionService.getCwd(cwdDeps);
        const currentPlacement = cwdResult.type === "ok" ? cwdResult.value.placement : undefined;

        await saveAndDisplayPlacement(
          todayPlacementResult.value,
          cwdDeps,
          debug,
          currentPlacement,
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
        const currentPlacement = cwdResult.type === "ok" ? cwdResult.value.placement : undefined;

        await saveAndDisplayPlacement(previousResult.value, cwdDeps, debug, currentPlacement);
        return;
      }

      // Get current placement
      const cwdPlacementResult = await CwdResolutionService.getCwd(cwdDeps);
      if (cwdPlacementResult.type === "error") {
        console.error(formatError(cwdPlacementResult.error, debug));
        return;
      }
      if (cwdPlacementResult.value.warning) {
        console.error(`Warning: ${cwdPlacementResult.value.warning}`);
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

      // Resolve expression to placement
      const placementResult = await pathResolver.resolvePath(
        cwdPlacementResult.value.placement,
        exprResult.value,
      );

      if (placementResult.type === "error") {
        console.error(formatError(placementResult.error, debug));
        return;
      }

      // Validate placement (for item placements, check existence)
      const validateResult = await CwdResolutionService.validatePlacement(
        placementResult.value,
        {
          itemRepository: deps.itemRepository,
        },
      );

      if (validateResult.type === "error") {
        console.error(formatError(validateResult.error, debug));
        return;
      }

      await saveAndDisplayPlacement(
        validateResult.value,
        cwdDeps,
        debug,
        cwdPlacementResult.value.placement,
      );
    });
}
