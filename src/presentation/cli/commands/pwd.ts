import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { formatPlacementForDisplay } from "../../../domain/services/placement_display_service.ts";

export function createPwdCommand() {
  return new Command()
    .description("Print current working directory")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>) => {
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
    });
}
