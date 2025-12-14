import { Command } from "@cliffy/command";
import { loadCliDependencies, resolveMmHome } from "../dependencies.ts";
import { RemoveItemWorkflow } from "../../../domain/workflows/remove_item.ts";
import { Item } from "../../../domain/models/item.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";
import { CacheRepository } from "../../../infrastructure/completion_cache/cache_repository.ts";
import { workspaceNameFromString } from "../../../domain/primitives/workspace_name.ts";
import { createFileSystemWorkspaceRepository } from "../../../infrastructure/fileSystem/mod.ts";
import { createFileSystemConfigRepository } from "../../../infrastructure/fileSystem/config_repository.ts";

const formatItemLabel = (item: Item): string =>
  item.data.alias ? item.data.alias.toString() : item.data.id.toString();

async function getWorkspaceRootForCompletion(workspaceName?: string): Promise<string | null> {
  try {
    const homeResult = resolveMmHome();
    if (homeResult.type === "error") {
      return null;
    }
    const home = homeResult.value;

    if (workspaceName) {
      // If workspace name is provided, try to resolve it
      const parsedName = workspaceNameFromString(workspaceName);
      if (parsedName.type === "error") {
        return null;
      }
      const repository = createFileSystemWorkspaceRepository({ home });
      const existsResult = await repository.exists(parsedName.value);
      if (existsResult.type === "error" || !existsResult.value) {
        return null;
      }
      return repository.pathFor(parsedName.value);
    }

    // Get current workspace from config
    const configRepository = createFileSystemConfigRepository({ home });
    const currentResult = await configRepository.getCurrentWorkspace();
    if (currentResult.type === "error") {
      return null;
    }

    const currentName = currentResult.value ?? "home";
    const parsedName = workspaceNameFromString(currentName);
    if (parsedName.type === "error") {
      return null;
    }

    const repository = createFileSystemWorkspaceRepository({ home });
    const existsResult = await repository.exists(parsedName.value);
    if (existsResult.type === "error" || !existsResult.value) {
      return null;
    }

    return repository.pathFor(parsedName.value);
  } catch {
    return null;
  }
}

export function createRemoveCommand() {
  return new Command()
    .description("Remove items (tasks/notes/events)")
    .arguments("<ids...:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .complete("ids", async () => {
      try {
        const workspaceRoot = await getWorkspaceRootForCompletion();
        if (!workspaceRoot) {
          return [];
        }
        const cacheRepo = new CacheRepository(workspaceRoot);
        const aliases = await cacheRepo.readAliases();
        return aliases;
      } catch {
        return [];
      }
    })
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
