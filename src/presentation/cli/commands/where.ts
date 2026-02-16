import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { deriveFilePathFromId } from "../../../infrastructure/fileSystem/item_repository.ts";
import { formatError, formatLocatorError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { createItemLocatorService } from "../../../domain/services/item_locator_service.ts";
import type { Item } from "../../../domain/models/item.ts";

/** Build a logical path string from an item's directory and optional alias. */
function buildLogicalPath(item: Item): string {
  const dir = item.data.directory.toString();
  const alias = item.data.alias?.toString();
  return alias ? `/${dir}/${alias}` : `/${dir}`;
}

export function createWhereCommand() {
  return new Command()
    .description("Print the physical file path for an item")
    .arguments("<id:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-l, --logical", "Print the logical path instead of the physical path")
    .action(async (options: Record<string, unknown>, itemRef: string) => {
      const debug = isDebugMode();
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const logical = options.logical === true;
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

      const locatorService = createItemLocatorService({
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
        timezone: deps.timezone,
        prefixCandidates: () => deps.cacheUpdateService.getAliases(),
      });
      const resolveResult = await locatorService.resolve(itemRef);
      if (resolveResult.type === "error") {
        console.error(formatLocatorError(resolveResult.error, debug));
        return;
      }

      const item = resolveResult.value;

      if (logical) {
        console.log(buildLogicalPath(item));
      } else {
        const physicalPath = deriveFilePathFromId(
          { root: deps.root, timezone: deps.timezone },
          item.data.id.toString(),
        );
        if (physicalPath) {
          console.log(physicalPath);
        }
      }
    });
}
