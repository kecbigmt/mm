import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_parser.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import { formatPlacementForDisplay } from "../../../domain/services/placement_display_service.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { createDatePlacement, parseCalendarDay } from "../../../domain/primitives/mod.ts";

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

      if (!pathArg) {
        // Navigate to today's date (home) - matching bash cd behavior
        const todayStr = computeTodayInTimezone(now, deps.timezone.toString());
        const calendarDayResult = parseCalendarDay(todayStr);
        if (calendarDayResult.type === "error") {
          console.error(formatError(calendarDayResult.error, debug));
          return;
        }
        const todayPlacement = createDatePlacement(calendarDayResult.value);

        const saveResult = await CwdResolutionService.setCwd(todayPlacement, {
          sessionRepository: deps.sessionRepository,
          workspacePath: deps.root,
        });

        if (saveResult.type === "error") {
          console.error(formatError(saveResult.error, debug));
          return;
        }

        // Display placement with aliases
        const displayResult = await formatPlacementForDisplay(todayPlacement, {
          itemRepository: deps.itemRepository,
        });
        if (displayResult.type === "error") {
          console.error(formatError(displayResult.error, debug));
          return;
        }
        console.log(displayResult.value);
        return;
      }

      // Get current placement
      const cwdPlacementResult = await CwdResolutionService.getCwd({
        sessionRepository: deps.sessionRepository,
        workspacePath: deps.root,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
      });
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

      // Save to session file
      const saveResult = await CwdResolutionService.setCwd(validateResult.value, {
        sessionRepository: deps.sessionRepository,
        workspacePath: deps.root,
      });

      if (saveResult.type === "error") {
        console.error(formatError(saveResult.error, debug));
        return;
      }

      // Display placement with aliases
      const displayResult = await formatPlacementForDisplay(validateResult.value, {
        itemRepository: deps.itemRepository,
      });
      if (displayResult.type === "error") {
        console.error(formatError(displayResult.error, debug));
        return;
      }
      console.log(displayResult.value);
    });
}

/**
 * Compute today's date in the given timezone.
 */
const computeTodayInTimezone = (now: Date, timezone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
};
