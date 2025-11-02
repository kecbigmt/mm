import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { MoveItemWorkflow } from "../../../domain/workflows/move_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";

const formatItemLabel = (item: { data: { id: { toString(): string }; alias?: { toString(): string } } }): string =>
  item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createMvCommand() {
  return new Command()
    .description("Move item to a new placement")
    .arguments("<locator:string> <placement:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, itemLocator: string, placement: string) => {
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

      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(occurredAtResult.error.message);
        return;
      }

      const workflowResult = await MoveItemWorkflow.execute(
        {
          itemLocator,
          placement,
          cwd: cwdResult.value,
          today: now,
          occurredAt: occurredAtResult.value,
        },
        {
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
          rankService: deps.rankService,
        },
      );

      if (workflowResult.type === "error") {
        console.error(workflowResult.error.message);
        return;
      }

      const { item } = workflowResult.value;
      const label = formatItemLabel(item);
      console.log(`✅ Moved [${label}] ${item.data.title.toString()} to ${item.data.path.toString()}`);
    });
}

