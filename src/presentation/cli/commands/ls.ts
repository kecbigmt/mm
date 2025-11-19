import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { ListItemsWorkflow } from "../../../domain/workflows/list_items.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";

const formatItem = (
  item: {
    data: {
      id: { toString(): string };
      title: { toString(): string };
      alias?: { toString(): string };
    };
  },
): string => {
  const id = item.data.id.toString().slice(-7);
  const alias = item.data.alias?.toString();
  const label = alias || id;
  const title = item.data.title.toString();
  return `[${label}] ${title}`;
};

export function createLsCommand() {
  return new Command()
    .description("List items in current directory or target path")
    .arguments("[locator:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, locatorArg?: string) => {
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

      const workflowResult = await ListItemsWorkflow.execute(
        {
          expression: locatorArg,
          cwd: cwdResult.value,
          today: now,
          timezone: deps.timezone,
        },
        {
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
        },
      );

      if (workflowResult.type === "error") {
        console.error(workflowResult.error.message);
        return;
      }

      const { items } = workflowResult.value;

      if (items.length === 0) {
        console.log("(empty)");
        return;
      }

      for (const item of items) {
        console.log(formatItem(item));
      }
    });
}
