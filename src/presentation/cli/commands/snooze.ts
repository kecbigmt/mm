import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { SnoozeItemWorkflow } from "../../../domain/workflows/snooze_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";
import { parsePathExpression } from "../path_parser.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import { parseFutureDateTime } from "../utils/future_date_time.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createSnoozeCommand() {
  return new Command()
    .description("Snooze items until a future datetime")
    .arguments("<ids...:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-c, --clear", "Clear snooze (unsnooze items)")
    .action(async (options: Record<string, unknown>, ...args: string[]) => {
      // Parse arguments: try to determine if last arg is "until" time or an item ref
      if (args.length === 0) {
        console.error("Error: At least one item id is required");
        return;
      }

      const clearFlag = options.clear === true;
      let itemRefs: string[];
      let until: string | undefined;

      // If clearFlag is set, all args are item refs
      // Otherwise, try to parse: if we have multiple args, last might be "until"
      if (clearFlag || args.length === 1) {
        itemRefs = args;
        until = undefined;
      } else {
        // Assume last arg might be "until" - we'll validate it later
        // For now, treat last arg as potentially "until"
        itemRefs = args.slice(0, -1);
        until = args[args.length - 1];
      }

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

      const pathResolver = createPathResolver({
        aliasRepository: deps.aliasRepository,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
        today: now,
      });

      // Resolve snoozeUntil expression to DateTime (if provided)
      let snoozeUntil = undefined;
      if (until && !clearFlag) {
        const parseResult = parseFutureDateTime(until, {
          referenceDate: now,
          timezone: deps.timezone,
        });
        if (parseResult.type === "error") {
          // If parsing "until" fails, treat it as an item ref instead
          itemRefs.push(until);
          until = undefined;
        } else {
          snoozeUntil = parseResult.value;
        }
      }

      // Process each item
      for (const itemRef of itemRefs) {
        // Resolve item expression to ItemId
        const itemExprResult = parsePathExpression(itemRef);
        if (itemExprResult.type === "error") {
          console.error(`Error processing ${itemRef}: ${itemExprResult.error.message}`);
          continue;
        }

        const itemPlacementResult = await pathResolver.resolvePath(
          cwdResult.value,
          itemExprResult.value,
        );
        if (itemPlacementResult.type === "error") {
          console.error(`Error processing ${itemRef}: ${itemPlacementResult.error.message}`);
          continue;
        }

        if (itemPlacementResult.value.head.kind !== "item") {
          console.error(
            `Error processing ${itemRef}: expression must resolve to an item, not a date`,
          );
          continue;
        }

        const itemId = itemPlacementResult.value.head.id;

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
            rankService: deps.rankService,
          },
        );

        if (workflowResult.type === "error") {
          console.error(`Error processing ${itemRef}: ${workflowResult.error.message}`);
          continue;
        }

        const { item } = workflowResult.value;
        const label = formatItemLabel(item);

        if (item.data.snoozeUntil) {
          // Format snoozeUntil in workspace timezone (YYYY-MM-DD HH:MM)
          const date = item.data.snoozeUntil.toDate();
          const dateFormatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: deps.timezone.toString(),
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const timeFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: deps.timezone.toString(),
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const datePart = dateFormatter.format(date); // YYYY-MM-DD
          const timePart = timeFormatter.format(date); // HH:MM
          const formattedTime = `${datePart} ${timePart}`;

          console.log(
            `💤 [${label}] "${item.data.title.toString()}" is snoozing until ${formattedTime}`,
          );
        } else {
          console.log(
            `[${label}] "${item.data.title.toString()}" is no longer snoozing`,
          );
        }
      }
    });
}
