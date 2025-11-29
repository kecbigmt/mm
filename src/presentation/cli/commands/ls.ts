import { Command, EnumType } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { ListItemsStatusFilter, ListItemsWorkflow } from "../../../domain/workflows/list_items.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import type { Item } from "../../../domain/models/item.ts";
import type { ItemIconValue } from "../../../domain/primitives/item_icon.ts";

type LsOptions = {
  workspace?: string;
  type?: ItemIconValue;
  all?: boolean;
  print?: boolean;
  noPager?: boolean;
};

const itemTypeEnum = new EnumType(["note", "task", "event"]);

const getItemIcon = (item: Item, isClosed: boolean): string => {
  const icon = item.data.icon.toString();
  switch (icon) {
    case "note":
      return isClosed ? "🗞️" : "📝";
    case "task":
      return isClosed ? "✅" : "✔️";
    case "event":
      return "🕒";
    default:
      return "📄";
  }
};

const formatItemColored = (item: Item): string => {
  const isClosed = item.data.status.isClosed();
  const icon = getItemIcon(item, isClosed);
  const alias = item.data.alias?.toString();
  const id = item.data.id.toString();
  const label = alias || id;
  const title = item.data.title.toString();
  const context = item.data.context?.toString();
  const dueAt = item.data.dueAt?.toString().slice(0, 10); // YYYY-MM-DD

  let line = `${icon} ${label} ${title}`;
  if (context) {
    line += ` @${context}`;
  }
  if (dueAt) {
    line += ` →${dueAt}`;
  }
  return line;
};

const formatItemPrint = (item: Item, dateStr: string): string => {
  const alias = item.data.alias?.toString();
  const id = item.data.id.toString();
  const label = alias || id;
  const title = item.data.title.toString();
  const context = item.data.context?.toString();
  const dueAt = item.data.dueAt?.toString().slice(0, 10);

  let line = `${dateStr} ${label} ${title}`;
  if (context) {
    line += ` @${context}`;
  }
  if (dueAt) {
    line += ` ->${dueAt}`;
  }
  return line;
};

const getPlacementDate = (item: Item): string => {
  const head = item.data.placement.head;
  if (head.kind === "date") {
    return head.date.toString();
  }
  return "";
};

export function createLsCommand() {
  return new Command()
    .description("List items in current directory or target path")
    .arguments("[locator:string]")
    .type("itemType", itemTypeEnum)
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-t, --type <type:itemType>", "Filter by item type (note, task, event)")
    .option("-a, --all", "Include closed items")
    .option("-p, --print", "Plain output without colors (includes ISO date)")
    .option("--no-pager", "Do not use pager")
    .action(async (options: LsOptions, locatorArg?: string) => {
      const depsResult = await loadCliDependencies(options.workspace);
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

      const statusFilter: ListItemsStatusFilter = options.all ? "all" : "open";

      const workflowResult = await ListItemsWorkflow.execute(
        {
          expression: locatorArg,
          cwd: cwdResult.value,
          today: now,
          timezone: deps.timezone,
          status: statusFilter,
          icon: options.type,
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

      const isPrintMode = options.print === true;

      for (const item of items) {
        if (isPrintMode) {
          const dateStr = getPlacementDate(item);
          console.log(formatItemPrint(item, dateStr));
        } else {
          console.log(formatItemColored(item));
        }
      }
    });
}
