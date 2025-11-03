import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";

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
          aliasRepository: deps.aliasRepository,
        },
        now,
      );

      if (cwdResult.type === "error") {
        console.error(cwdResult.error.message);
        return;
      }

      console.log(cwdResult.value.toString());
    });
}
