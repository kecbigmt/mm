import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { parseLocator } from "../../../domain/primitives/locator.ts";
import { parsePath } from "../../../domain/primitives/path.ts";

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
            aliasRepository: deps.aliasRepository,
          },
          now,
        );
        if (cwdResult.type === "error") {
          console.error(cwdResult.error.message);
          return;
        }
      console.log(cwdResult.value.toString());
      return;
      }

      const locatorResult = parseLocator(pathArg, {
        today: now,
        cwd: await CwdResolutionService.getCwd(
          {
            stateRepository: deps.stateRepository,
            itemRepository: deps.itemRepository,
            aliasRepository: deps.aliasRepository,
          },
          now,
        ).then((r) => r.type === "ok" ? r.value : undefined),
      });

      if (locatorResult.type === "error") {
        console.error("Invalid path:", locatorResult.error.issues.map((i) => i.message).join(", "));
        return;
      }

      const targetPath = locatorResult.value.path;
      if (targetPath.isRange()) {
        console.error("cd does not accept ranges; use ls for ranges");
        return;
      }

      const setResult = await CwdResolutionService.setCwd(
        targetPath,
        {
          stateRepository: deps.stateRepository,
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
        },
      );

      if (setResult.type === "error") {
        console.error(setResult.error.message);
        return;
      }

      console.log(setResult.value.toString());
    });
}

