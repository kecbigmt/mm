import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { formatPlacementForDisplay } from "../../../domain/services/placement_display_service.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";

export function createPwdCommand() {
  return new Command()
    .description("Print current working directory")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>) => {
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

      const cwdResult = await CwdResolutionService.getCwd(
        {
          getEnv: (name) => Deno.env.get(name),
          itemRepository: deps.itemRepository,
          timezone: deps.timezone,
        },
      );

      if (cwdResult.type === "error") {
        console.error(formatError(cwdResult.error, debug));
        return;
      }

      if (cwdResult.value.warning) {
        console.error(`Warning: ${cwdResult.value.warning}`);
      }

      // Display placement with aliases
      const displayResult = await formatPlacementForDisplay(cwdResult.value.placement, {
        itemRepository: deps.itemRepository,
      });
      if (displayResult.type === "error") {
        console.error(formatError(displayResult.error, debug));
        return;
      }
      console.log(displayResult.value);
    });
}
