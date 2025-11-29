import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import { parseAliasSlug } from "../../../domain/primitives/alias_slug.ts";
import { deriveFilePathFromId } from "../../../infrastructure/fileSystem/item_repository.ts";
import { formatError } from "../error_formatter.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createWhereCommand() {
  return new Command()
    .description("Show logical and physical paths for an item")
    .arguments("<locator:string>")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, locatorArg: string) => {
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(formatError(depsResult.error.error));
        } else {
          console.error(formatError(depsResult.error));
        }
        return;
      }

      const deps = depsResult.value;

      // Try to resolve as UUID first, then as alias
      let item;
      const uuidResult = parseItemId(locatorArg);

      if (uuidResult.type === "ok") {
        // It's a valid UUID
        const loadResult = await deps.itemRepository.load(uuidResult.value);
        if (loadResult.type === "error") {
          console.error(formatError(loadResult.error));
          return;
        }
        item = loadResult.value;
      } else {
        // Try as alias
        const aliasResult = parseAliasSlug(locatorArg);
        if (aliasResult.type === "ok") {
          const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
          if (aliasLoadResult.type === "error") {
            console.error(formatError(aliasLoadResult.error));
            return;
          }
          const alias = aliasLoadResult.value;
          if (alias) {
            const itemLoadResult = await deps.itemRepository.load(alias.data.itemId);
            if (itemLoadResult.type === "error") {
              console.error(formatError(itemLoadResult.error));
              return;
            }
            item = itemLoadResult.value;
          }
        }
      }

      if (!item) {
        console.error(`Item not found: ${locatorArg}`);
        return;
      }

      const label = formatItemLabel(item);
      console.log(`Item [${label}]:`);

      // Build logical path with alias if present (add leading / for display)
      const placementStr = item.data.placement.toString();
      const logicalPath = item.data.alias
        ? `/${placementStr}/${item.data.alias.toString()}`
        : `/${placementStr}`;
      console.log(`  Logical:  ${logicalPath}`);
      console.log(`  Rank:     ${item.data.rank.toString()}`);

      const physicalPath = deriveFilePathFromId(
        { root: deps.root, timezone: deps.timezone },
        item.data.id.toString(),
      );
      if (physicalPath) {
        console.log(`  Physical: ${physicalPath}`);
      }
    });
}
