import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { formatItemDetail } from "../formatters/item_detail_formatter.ts";
import { outputWithPager } from "../pager.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import { parseAliasSlug } from "../../../domain/primitives/alias_slug.ts";

export function createShowCommand() {
  return new Command()
    .description("Show item details")
    .arguments("<id:string>")
    .option("--print", "Output directly without using pager")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>, itemLocator: string) => {
      const debug = isDebugMode();
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const usePrint = options.print === true;

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

      // Try to resolve item by UUID first, then by alias
      let item = undefined;
      const uuidResult = parseItemId(itemLocator);

      if (uuidResult.type === "ok") {
        const loadResult = await deps.itemRepository.load(uuidResult.value);
        if (loadResult.type === "error") {
          console.error(formatError(loadResult.error, debug));
          Deno.exit(1);
        }
        item = loadResult.value;
      } else {
        const aliasResult = parseAliasSlug(itemLocator);
        if (aliasResult.type === "ok") {
          const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
          if (aliasLoadResult.type === "error") {
            console.error(formatError(aliasLoadResult.error, debug));
            Deno.exit(1);
          }
          const alias = aliasLoadResult.value;
          if (alias) {
            const itemLoadResult = await deps.itemRepository.load(alias.data.itemId);
            if (itemLoadResult.type === "error") {
              console.error(formatError(itemLoadResult.error, debug));
              Deno.exit(1);
            }
            item = itemLoadResult.value;
          }
        }
      }

      if (!item) {
        console.error(formatError(new Error(`Item not found: ${itemLocator}`), debug));
        Deno.exit(1);
      }

      // Format item details
      const formatted = formatItemDetail(item);

      // Output with pager or directly
      if (usePrint) {
        console.log(formatted);
      } else {
        await outputWithPager(formatted);
      }
    });
}
