import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_expression.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import { formatPlacementForDisplay } from "../../../domain/services/placement_display_service.ts";
import { formatError } from "../error_formatter.ts";

export function createCdCommand() {
  return new Command()
    .description("Change current working directory")
    .arguments("[path:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, pathArg?: string) => {
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(formatError(depsResult.error.error));
        } else {
          console.error(formatError(depsResult.error));
        }
        return;
      }

      const deps = depsResult.value;
      const now = new Date();

      if (!pathArg) {
        const cwdResult = await CwdResolutionService.getCwd(
          {
            stateRepository: deps.stateRepository,
            itemRepository: deps.itemRepository,
          },
          now,
        );
        if (cwdResult.type === "error") {
          console.error(formatError(cwdResult.error));
          return;
        }
        // Display placement with aliases
        const displayResult = await formatPlacementForDisplay(cwdResult.value, {
          itemRepository: deps.itemRepository,
        });
        if (displayResult.type === "error") {
          console.error(formatError(displayResult.error));
          return;
        }
        console.log(displayResult.value);
        return;
      }

      // Get current placement
      const cwdPlacementResult = await CwdResolutionService.getCwd(
        {
          stateRepository: deps.stateRepository,
          itemRepository: deps.itemRepository,
        },
        now,
      );
      if (cwdPlacementResult.type === "error") {
        console.error(formatError(cwdPlacementResult.error));
        return;
      }

      // Parse path expression
      const exprResult = parsePathExpression(pathArg);
      if (exprResult.type === "error") {
        console.error(formatError(exprResult.error));
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
        cwdPlacementResult.value,
        exprResult.value,
      );

      if (placementResult.type === "error") {
        console.error(formatError(placementResult.error));
        return;
      }

      const setResult = await CwdResolutionService.setCwd(
        placementResult.value,
        {
          stateRepository: deps.stateRepository,
          itemRepository: deps.itemRepository,
        },
      );

      if (setResult.type === "error") {
        console.error(formatError(setResult.error));
        return;
      }

      // Display placement with aliases
      const displayResult = await formatPlacementForDisplay(setResult.value, {
        itemRepository: deps.itemRepository,
      });
      if (displayResult.type === "error") {
        console.error(formatError(displayResult.error));
        return;
      }
      console.log(displayResult.value);
    });
}
