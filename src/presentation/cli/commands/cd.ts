import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_expression.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import { parseTimezoneIdentifier } from "../../../domain/primitives/mod.ts";
import { formatPlacementForDisplay } from "../../../domain/services/placement_display_service.ts";

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
          console.error(depsResult.error.error.message);
        } else {
          console.error(depsResult.error.message);
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
          console.error(cwdResult.error.message);
          return;
        }
        // Display placement with aliases
        const displayResult = await formatPlacementForDisplay(cwdResult.value, {
          itemRepository: deps.itemRepository,
        });
        if (displayResult.type === "error") {
          console.error(displayResult.error.message);
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
        console.error(cwdPlacementResult.error.message);
        return;
      }

      // Parse path expression
      const exprResult = parsePathExpression(pathArg);
      if (exprResult.type === "error") {
        console.error(
          "Invalid path expression:",
          exprResult.error.issues.map((i) => i.message).join(", "),
        );
        return;
      }

      // Create path resolver
      const timezoneResult = parseTimezoneIdentifier("UTC");
      if (timezoneResult.type === "error") {
        console.error("Failed to parse timezone");
        return;
      }

      const pathResolver = createPathResolver({
        aliasRepository: deps.aliasRepository,
        itemRepository: deps.itemRepository,
        timezone: timezoneResult.value,
        today: now,
      });

      // Resolve expression to placement
      const placementResult = await pathResolver.resolvePath(
        cwdPlacementResult.value,
        exprResult.value,
      );

      if (placementResult.type === "error") {
        console.error(
          "Failed to resolve path:",
          placementResult.error.issues.map((i) => i.message).join(", "),
        );
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
        console.error(setResult.error.message);
        return;
      }

      // Display placement with aliases
      const displayResult = await formatPlacementForDisplay(setResult.value, {
        itemRepository: deps.itemRepository,
      });
      if (displayResult.type === "error") {
        console.error(displayResult.error.message);
        return;
      }
      console.log(displayResult.value);
    });
}
