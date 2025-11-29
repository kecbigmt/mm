import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { MoveItemWorkflow } from "../../../domain/workflows/move_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createMvCommand() {
  return new Command()
    .description("Move item to a new placement")
    .arguments("<locator:string> <placement:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, itemLocator: string, placement: string) => {
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

      const cwdResult = await CwdResolutionService.getCwd(
        {
          stateRepository: deps.stateRepository,
          itemRepository: deps.itemRepository,
        },
        now,
      );

      if (cwdResult.type === "error") {
        console.error(formatError(cwdResult.error, debug));
        return;
      }

      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(formatError(occurredAtResult.error, debug));
        return;
      }

      const workflowResult = await MoveItemWorkflow.execute(
        {
          itemExpression: itemLocator,
          targetExpression: placement,
          cwd: cwdResult.value,
          today: now,
          occurredAt: occurredAtResult.value,
          timezone: deps.timezone,
        },
        {
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
          rankService: deps.rankService,
        },
      );

      if (workflowResult.type === "error") {
        console.error(formatError(workflowResult.error, debug));
        return;
      }

      const { item } = workflowResult.value;
      const label = formatItemLabel(item);
      console.log(
        `✅ Moved [${label}] ${item.data.title.toString()} to ${item.data.placement.toString()}`,
      );
    });
}
