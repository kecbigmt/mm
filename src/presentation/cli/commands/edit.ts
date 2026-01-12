import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { EditItemWorkflow } from "../../../domain/workflows/edit_item.ts";
import { dateTimeFromDate } from "../../../domain/primitives/date_time.ts";
import { deriveFilePathFromId } from "../../../infrastructure/fileSystem/item_repository.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";
import { executePrePull } from "../pre_pull_helper.ts";
import { handlePostEditUpdates, launchEditor } from "../utils/edit_item_helper.ts";

const hasMetadataOptions = (options: Record<string, unknown>): boolean => {
  return (
    options.title !== undefined || options.icon !== undefined || options.body !== undefined ||
    options.startAt !== undefined || options.duration !== undefined ||
    options.dueAt !== undefined ||
    options.alias !== undefined || options.project !== undefined || options.context !== undefined
  );
};

const formatItem = (
  item: {
    data: {
      id: { toString(): string };
      title: { toString(): string };
      alias?: { toString(): string };
    };
  },
): string => {
  const idLabel = item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);
  return `[${idLabel}] ${item.data.title.toString()}`;
};

export function createEditCommand() {
  return new Command()
    .description("Edit an item")
    .arguments("<id:string>")
    .option("--title <title:string>", "Update title")
    .option("--icon <icon:string>", "Update icon")
    .option("--body <body:string>", "Update body")
    .option("--start-at <startAt:string>", "Update start time (ISO8601 format)")
    .option("--duration <duration:string>", "Update duration (e.g., 30m, 2h)")
    .option("--due-at <dueAt:string>", "Update due date (ISO8601 format)")
    .option("--alias <alias:string>", "Update alias")
    .option("--project <project:string>", "Update project reference (alias)")
    .option("-c, --context <context:string>", "Update context tags (repeatable)", { collect: true })
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, itemRef: string) => {
      const debug = isDebugMode();
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(formatError(depsResult.error.error, debug));
        } else {
          console.error(formatError(depsResult.error, debug));
        }
        Deno.exit(1);
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
        console.error(formatError(occurredAtResult.error, debug));
        Deno.exit(1);
      }

      if (!hasMetadataOptions(options)) {
        const loadResult = await EditItemWorkflow.execute(
          {
            itemLocator: itemRef,
            updates: {},
            updatedAt: occurredAtResult.value,
            timezone: deps.timezone,
          },
          {
            itemRepository: deps.itemRepository,
            aliasRepository: deps.aliasRepository,
          },
        );

        if (loadResult.type === "error") {
          if ("kind" in loadResult.error && loadResult.error.kind === "ValidationError") {
            console.error(loadResult.error.issues[0]?.message ?? "Validation error");
          } else if ("kind" in loadResult.error && loadResult.error.kind === "RepositoryError") {
            console.error(formatError(loadResult.error, debug));
          } else {
            console.error("Unknown error");
          }
          Deno.exit(1);
        }

        const item = loadResult.value;
        const oldAlias = item.data.alias;
        const filePath = deriveFilePathFromId(
          { root: deps.root, timezone: deps.timezone },
          item.data.id.toString(),
        );

        if (!filePath) {
          console.error(`Could not determine file path for item: ${itemRef}`);
          Deno.exit(1);
        }

        try {
          await launchEditor(filePath);
          const updatedItem = await handlePostEditUpdates(
            {
              itemRepository: deps.itemRepository,
              aliasRepository: deps.aliasRepository,
              cacheUpdateService: deps.cacheUpdateService,
            },
            {
              itemId: item.data.id,
              oldAlias: oldAlias,
              occurredAt: occurredAtResult.value,
            },
          );

          console.log(`✅ Updated ${formatItem(updatedItem)}`);

          // Auto-commit if enabled
          const autoCommitDeps = {
            workspaceRoot: deps.root,
            versionControlService: deps.versionControlService,
            workspaceRepository: deps.workspaceRepository,
            stateRepository: deps.stateRepository,
          };
          await executeAutoCommit(autoCommitDeps, `edit item via editor`);
        } catch (error) {
          console.error(
            `Failed to edit item: ${error instanceof Error ? error.message : String(error)}`,
          );
          Deno.exit(1);
        }
        return;
      }

      const updates: {
        title?: string;
        icon?: string;
        body?: string;
        startAt?: string;
        duration?: string;
        dueAt?: string;
        alias?: string;
        project?: string;
        contexts?: readonly string[];
      } = {};

      if (typeof options.title === "string") updates.title = options.title;
      if (typeof options.icon === "string") updates.icon = options.icon;
      if (typeof options.body === "string") updates.body = options.body;
      if (typeof options.startAt === "string") updates.startAt = options.startAt;
      if (typeof options.duration === "string") updates.duration = options.duration;
      if (typeof options.dueAt === "string") updates.dueAt = options.dueAt;
      if (typeof options.alias === "string") updates.alias = options.alias;
      if (typeof options.project === "string") updates.project = options.project;
      if (Array.isArray(options.context)) updates.contexts = options.context as string[];

      const result = await EditItemWorkflow.execute(
        {
          itemLocator: itemRef,
          updates,
          updatedAt: occurredAtResult.value,
          timezone: deps.timezone,
        },
        {
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
        },
      );

      if (result.type === "error") {
        if ("kind" in result.error && result.error.kind === "ValidationError") {
          for (const issue of result.error.issues) {
            console.error(issue.message);
          }
        } else if ("kind" in result.error && result.error.kind === "RepositoryError") {
          console.error(formatError(result.error, debug));
        } else {
          console.error("Unknown error");
        }
        Deno.exit(1);
      }

      // Update cache with edited item
      await deps.cacheUpdateService.updateFromItem(result.value);

      console.log(`✅ Updated ${formatItem(result.value)}`);

      // Auto-commit if enabled
      const autoCommitDeps = {
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
        stateRepository: deps.stateRepository,
      };
      await executeAutoCommit(autoCommitDeps, `edit item metadata`);
    });
}
