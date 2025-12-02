import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { SnoozeItemWorkflow } from "../../../domain/workflows/snooze_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";
import { parsePathExpression } from "../path_expression.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import { parseFutureDateTime } from "../utils/future_date_time.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createSnoozeCommand() {
  return new Command()
    .description("Snooze item until a future datetime")
    .arguments("<locator:string> [until:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-c, --clear", "Clear snooze (unsnooze item)")
    .action(async (options: Record<string, unknown>, itemLocator: string, until?: string) => {
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

      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(occurredAtResult.error.message);
        return;
      }

      const clearFlag = options.clear === true;

      // Resolve item expression to ItemId
      const itemExprResult = parsePathExpression(itemLocator);
      if (itemExprResult.type === "error") {
        console.error(itemExprResult.error.message);
        return;
      }

      const pathResolver = createPathResolver({
        aliasRepository: deps.aliasRepository,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
        today: now,
      });

      const itemPlacementResult = await pathResolver.resolvePath(
        cwdResult.value,
        itemExprResult.value,
      );
      if (itemPlacementResult.type === "error") {
        console.error(itemPlacementResult.error.message);
        return;
      }

      if (itemPlacementResult.value.head.kind !== "item") {
        console.error("Item expression must resolve to an item, not a date");
        return;
      }

      const itemId = itemPlacementResult.value.head.id;

      // Resolve snoozeUntil expression to DateTime (if provided)
      let snoozeUntil = undefined;
      if (until && !clearFlag) {
        const parseResult = parseFutureDateTime(until, {
          referenceDate: now,
          timezone: deps.timezone,
        });
        if (parseResult.type === "error") {
          console.error(parseResult.error.message);
          return;
        }
        snoozeUntil = parseResult.value;
      }

      const workflowResult = await SnoozeItemWorkflow.execute(
        {
          itemId,
          snoozeUntil,
          clear: clearFlag,
          timezone: deps.timezone,
          occurredAt: occurredAtResult.value,
        },
        {
          itemRepository: deps.itemRepository,
        },
      );

      if (workflowResult.type === "error") {
        console.error(workflowResult.error.message);
        return;
      }

      const { item } = workflowResult.value;
      const label = formatItemLabel(item);

      if (item.data.snoozeUntil) {
        console.log(
          `✅ Snoozed [${label}] ${item.data.title.toString()} until ${item.data.snoozeUntil.toString()}`,
        );
      } else {
        console.log(
          `✅ Unsnoozed [${label}] ${item.data.title.toString()}`,
        );
      }
    });
}
