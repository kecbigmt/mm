import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { EditItemWorkflow } from "../../../domain/workflows/edit_item.ts";
import { dateTimeFromDate } from "../../../domain/primitives/date_time.ts";
import { deriveFilePathFromId } from "../../../infrastructure/fileSystem/item_repository.ts";

const hasMetadataOptions = (options: Record<string, unknown>): boolean => {
  return (
    options.title !== undefined || options.icon !== undefined || options.body !== undefined ||
    options.startAt !== undefined || options.duration !== undefined ||
    options.dueAt !== undefined ||
    options.alias !== undefined || options.context !== undefined
  );
};

const launchEditor = async (filePath: string): Promise<void> => {
  const editor = Deno.env.get("EDITOR") || "vi";
  const command = new Deno.Command(editor, {
    args: [filePath],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = command.spawn();
  const status = await child.status;
  if (!status.success) {
    throw new Error(`Editor '${editor}' exited with non-zero status`);
  }
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
    .arguments("<locator:string>")
    .option("--title <title:string>", "Update title")
    .option("--icon <icon:string>", "Update icon")
    .option("--body <body:string>", "Update body")
    .option("--start-at <startAt:string>", "Update start time (ISO8601 format)")
    .option("--duration <duration:string>", "Update duration (e.g., 30m, 2h)")
    .option("--due-at <dueAt:string>", "Update due date (ISO8601 format)")
    .option("--alias <alias:string>", "Update alias")
    .option("-c, --context <context:string>", "Update context tag")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, itemLocator: string) => {
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(depsResult.error.error.message);
        } else {
          console.error(depsResult.error.message);
        }
        Deno.exit(1);
      }

      const deps = depsResult.value;
      const now = new Date();
      const occurredAtResult = dateTimeFromDate(now);
      if (occurredAtResult.type === "error") {
        console.error(occurredAtResult.error.message);
        Deno.exit(1);
      }

      if (!hasMetadataOptions(options)) {
        const loadResult = await EditItemWorkflow.execute(
          {
            itemLocator,
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
            console.error(loadResult.error.message);
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
          console.error(`Could not determine file path for item: ${itemLocator}`);
          Deno.exit(1);
        }

        try {
          await launchEditor(filePath);
          const reloadResult = await deps.itemRepository.load(item.data.id);

          if (reloadResult.type === "error") {
            console.error(`Failed to reload item after edit: ${reloadResult.error.message}`);
            Deno.exit(1);
          }

          if (!reloadResult.value) {
            console.error("Failed to reload item after edit: item not found");
            Deno.exit(1);
          }

          const updatedItem = reloadResult.value;
          const newAlias = updatedItem.data.alias;

          // Update alias index if alias changed
          const oldAliasStr = oldAlias?.toString();
          const newAliasStr = newAlias?.toString();
          if (oldAliasStr !== newAliasStr) {
            // Check for alias collision before updating
            if (newAlias) {
              const existingAliasResult = await deps.aliasRepository.load(newAlias);
              if (existingAliasResult.type === "error") {
                console.error(
                  `Failed to check alias collision: ${existingAliasResult.error.message}`,
                );
                Deno.exit(1);
              }
              if (existingAliasResult.value) {
                // Alias exists and points to a different item
                if (!existingAliasResult.value.data.itemId.equals(updatedItem.data.id)) {
                  console.error(
                    `Alias '${newAlias.toString()}' is already in use by another item`,
                  );
                  Deno.exit(1);
                }
              }
            }

            // Delete old alias if it exists
            if (oldAlias) {
              const deleteResult = await deps.aliasRepository.delete(oldAlias);
              if (deleteResult.type === "error") {
                console.error(`Failed to delete old alias: ${deleteResult.error.message}`);
                Deno.exit(1);
              }
            }

            // Save new alias if it exists
            if (newAlias) {
              const { createAlias } = await import("../../../domain/models/alias.ts");
              const aliasModel = createAlias({
                slug: newAlias,
                itemId: updatedItem.data.id,
                createdAt: occurredAtResult.value,
              });
              const aliasSaveResult = await deps.aliasRepository.save(aliasModel);
              if (aliasSaveResult.type === "error") {
                console.error(`Failed to save new alias: ${aliasSaveResult.error.message}`);
                Deno.exit(1);
              }
            }
          }

          console.log(`✅ Updated ${formatItem(updatedItem)}`);
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
        context?: string;
      } = {};

      if (typeof options.title === "string") updates.title = options.title;
      if (typeof options.icon === "string") updates.icon = options.icon;
      if (typeof options.body === "string") updates.body = options.body;
      if (typeof options.startAt === "string") updates.startAt = options.startAt;
      if (typeof options.duration === "string") updates.duration = options.duration;
      if (typeof options.dueAt === "string") updates.dueAt = options.dueAt;
      if (typeof options.alias === "string") updates.alias = options.alias;
      if (typeof options.context === "string") updates.context = options.context;

      const result = await EditItemWorkflow.execute(
        {
          itemLocator,
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
          console.error(result.error.message);
        } else {
          console.error("Unknown error");
        }
        Deno.exit(1);
      }

      console.log(`✅ Updated ${formatItem(result.value)}`);
    });
}
