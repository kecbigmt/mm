import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { ChangeItemStatusWorkflow } from "../../../domain/workflows/change_item_status.ts";
import { dateTimeFromDate } from "../../../domain/primitives/date_time.ts";
import { Item } from "../../../domain/models/item.ts";

const formatShortId = (item: Item): string => item.data.id.toShortId().toString();

export function createReopenCommand() {
  return new Command()
    .description("Reopen closed items (tasks/notes/events)")
    .arguments("<ids...:string>")
    .action(async (_options, ...ids: string[]) => {
      const workspaceOption = undefined; // TODO: handle workspace option
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

      if (ids.length === 0) {
        console.error("At least one item ID is required");
        return;
      }

      const now = new Date();
      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(occurredAtResult.error.message);
        return;
      }

      const workflowResult = await ChangeItemStatusWorkflow.execute({
        itemIds: ids,
        action: "reopen",
        occurredAt: occurredAtResult.value,
      }, {
        itemRepository: deps.itemRepository,
      });

      if (workflowResult.type === "error") {
        console.error(
          workflowResult.error.kind === "ValidationError"
            ? workflowResult.error.message
            : workflowResult.error.error.message,
        );
        return;
      }

      const { succeeded, failed } = workflowResult.value;

      // Display successful reopens
      if (succeeded.length > 0) {
        if (succeeded.length === 1) {
          const item = succeeded[0];
          const shortId = formatShortId(item);
          console.log(`✅ Reopened [${shortId}] ${item.data.title.toString()}`);
        } else {
          console.log(`✅ Reopened ${succeeded.length} item(s):`);
          for (const item of succeeded) {
            const shortId = formatShortId(item);
            console.log(`  [${shortId}] ${item.data.title.toString()}`);
          }
        }
      }

      // Display failures
      if (failed.length > 0) {
        console.error(`\n❌ ${failed.length} error(s) occurred:`);
        for (const { itemId, error } of failed) {
          const errorMessage = error.kind === "ValidationError"
            ? error.message
            : error.error.message;
          console.error(`  ${itemId}: ${errorMessage}`);
        }
      }

      // Exit with error code if any failures occurred
      if (failed.length > 0) {
        Deno.exit(1);
      }
    });
}
