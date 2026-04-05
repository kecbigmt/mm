import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { snoozeItem } from "../../../application/use_cases/snooze_item.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";
import { parseFutureDateTime } from "../utils/future_date_time.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";
import { executePrePull } from "../pre_pull_helper.ts";

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

      // Pre-pull to get latest changes before file operation
      await executePrePull({
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
      });

      const now = new Date();

      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(occurredAtResult.error.message);
        return;
      }

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
      let successCount = 0;
      for (const itemRef of itemRefs) {
        const result = await snoozeItem({
          itemLocator: itemRef,
          snoozeUntil,
          clear: clearFlag,
          timezone: deps.timezone,
          occurredAt: occurredAtResult.value,
        }, {
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
          rankService: deps.rankService,
          prefixCandidates: () => deps.cacheUpdateService.getAliases(),
        });

        if (result.type === "error") {
          console.error(`Error processing ${itemRef}: ${result.error.message}`);
          continue;
        }

        const { item } = result.value;
        const label = item.alias ?? item.id.slice(-7);
        successCount++;

        if (item.snoozeUntil) {
          // Format snoozeUntil in workspace timezone (YYYY-MM-DD HH:MM)
          const date = new Date(item.snoozeUntil);
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
            `\u{1F4A4} [${label}] "${item.title}" is snoozing until ${formattedTime}`,
          );
        } else {
          console.log(
            `[${label}] "${item.title}" is no longer snoozing`,
          );
        }
      }

      // Auto-commit if there were successful snoozes
      if (successCount > 0) {
        const action = clearFlag ? "unsnooze" : "snooze";
        const autoCommitDeps = {
          workspaceRoot: deps.root,
          versionControlService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
          stateRepository: deps.stateRepository,
        };
        await executeAutoCommit(autoCommitDeps, `${action} ${successCount} item(s)`);
      }
    });
}
