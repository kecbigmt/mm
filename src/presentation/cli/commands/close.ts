import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { ChangeItemStatusWorkflow } from "../../../domain/workflows/change_item_status.ts";
import { dateTimeFromDate } from "../../../domain/primitives/date_time.ts";
import { Item } from "../../../domain/models/item.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";
import { executePrePull } from "../pre_pull_helper.ts";

const formatItemLabel = (item: Item): string =>
  item.data.alias ? item.data.alias.toString() : item.data.id.toString();

export function createCloseCommand() {
  return new Command()
    .description("Close items (tasks/notes/events)")
    .arguments("<ids...:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, ...ids: string[]) => {
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

      if (ids.length === 0) {
        console.error("At least one item ID is required");
        return;
      }

      // Pre-pull to get latest changes before file operation
      await executePrePull({
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
      });

      const now = new Date();
      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(formatError(occurredAtResult.error, debug));
        return;
      }

      const workflowResult = await ChangeItemStatusWorkflow.execute({
        itemIds: ids,
        action: "close",
        occurredAt: occurredAtResult.value,
        timezone: deps.timezone,
      }, {
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
        prefixCandidates: () => deps.cacheUpdateService.getAliases(),
      });

      if (workflowResult.type === "error") {
        console.error(formatError(workflowResult.error, debug));
        return;
      }

      const { succeeded, failed } = workflowResult.value;

      // Update cache with successfully closed items
      if (succeeded.length > 0) {
        await deps.cacheUpdateService.updateFromItems(succeeded);
      }

      // Display successful closes
      if (succeeded.length > 0) {
        if (succeeded.length === 1) {
          const item = succeeded[0];
          const label = formatItemLabel(item);
          console.log(`✅ Closed [${label}] ${item.data.title.toString()}`);
        } else {
          console.log(`✅ Closed ${succeeded.length} item(s):`);
          for (const item of succeeded) {
            const label = formatItemLabel(item);
            console.log(`  [${label}] ${item.data.title.toString()}`);
          }
        }

        // Auto-commit if there were successful closes
        const autoCommitDeps = {
          workspaceRoot: deps.root,
          versionControlService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
          stateRepository: deps.stateRepository,
        };
        await executeAutoCommit(autoCommitDeps, `close ${succeeded.length} item(s)`);
      }

      // Display failures
      if (failed.length > 0) {
        console.error(`\n❌ ${failed.length} error(s) occurred:`);
        for (const { itemId, error } of failed) {
          console.error(`  ${itemId}: ${error.message}`);
        }
      }

      // Exit with error code if any failures occurred
      if (failed.length > 0) {
        Deno.exit(1);
      }
    });
}
