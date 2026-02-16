import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { MoveItemWorkflow } from "../../../domain/workflows/move_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";
import { executePrePull } from "../pre_pull_helper.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createMoveCommand() {
  return new Command()
    .description("Move items to a new directory")
    .arguments("<args...:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, ...args: string[]) => {
      // Parse arguments: all but last are item refs, last is directory
      if (args.length < 2) {
        console.error("Error: At least one item id and a directory are required");
        return;
      }

      const itemRefs = args.slice(0, -1);
      const destination = args[args.length - 1];

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

      // Pre-pull to get latest changes before file operation
      await executePrePull({
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
      });

      const now = new Date();

      const cwdResult = await CwdResolutionService.getCwd({
        sessionRepository: deps.sessionRepository,
        workspacePath: deps.root,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
      });

      if (cwdResult.type === "error") {
        console.error(formatError(cwdResult.error, debug));
        return;
      }

      if (cwdResult.value.warning) {
        console.error(`Warning: ${cwdResult.value.warning}`);
      }

      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(formatError(occurredAtResult.error, debug));
        return;
      }

      // Move each item in order
      // For multiple items, after the first, use after:<previous-id> to maintain order
      let previousItemId: string | null = null;

      for (const itemRef of itemRefs) {
        const targetExpression = previousItemId ? `after:${previousItemId}` : destination;

        const workflowResult = await MoveItemWorkflow.execute(
          {
            itemExpression: itemRef,
            targetExpression,
            cwd: cwdResult.value.directory,
            today: now,
            occurredAt: occurredAtResult.value,
            timezone: deps.timezone,
          },
          {
            itemRepository: deps.itemRepository,
            aliasRepository: deps.aliasRepository,
            rankService: deps.rankService,
            prefixCandidates: () => deps.cacheUpdateService.getAliases(),
          },
        );

        if (workflowResult.type === "error") {
          console.error(formatError(workflowResult.error, debug));
          return;
        }

        const { item } = workflowResult.value;
        previousItemId = item.data.id.toString();

        const label = formatItemLabel(item);
        console.log(
          `✅ Moved [${label}] ${item.data.title.toString()} to ${item.data.directory.toString()}`,
        );
      }

      // Auto-commit if enabled
      const autoCommitDeps = {
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
        stateRepository: deps.stateRepository,
      };
      const commitMessage = itemRefs.length === 1
        ? `move item to ${destination}`
        : `move ${itemRefs.length} items to ${destination}`;
      await executeAutoCommit(autoCommitDeps, commitMessage);
    });
}
