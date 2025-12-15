import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { RemoveItemWorkflow } from "../../../domain/workflows/remove_item.ts";
import { Item } from "../../../domain/models/item.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";

const formatItemLabel = (item: Item): string =>
  item.data.alias ? item.data.alias.toString() : item.data.id.toString();

export function createRemoveCommand() {
  return new Command()
    .description("Remove items (tasks/notes/events)")
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

      const workflowResult = await RemoveItemWorkflow.execute({
        itemIds: ids,
      }, {
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
      });

      if (workflowResult.type === "error") {
        console.error(formatError(workflowResult.error, debug));
        return;
      }

      const { succeeded, failed } = workflowResult.value;

      // Display successful removals
      if (succeeded.length > 0) {
        if (succeeded.length === 1) {
          const item = succeeded[0];
          const label = formatItemLabel(item);
          console.log(`✅ Removed [${label}] ${item.data.title.toString()}`);
        } else {
          console.log(`✅ Removed ${succeeded.length} item(s):`);
          for (const item of succeeded) {
            const label = formatItemLabel(item);
            console.log(`  [${label}] ${item.data.title.toString()}`);
          }
        }

        // Auto-commit if there were successful removals
        const autoCommitDeps = {
          workspaceRoot: deps.root,
          versionControlService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
        };
        await executeAutoCommit(autoCommitDeps, `remove ${succeeded.length} item(s)`);
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
