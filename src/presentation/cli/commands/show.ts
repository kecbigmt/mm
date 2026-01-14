import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { formatItemDetail } from "../formatters/item_detail_formatter.ts";
import type { ItemIdResolver } from "../formatters/list_formatter.ts";
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

      // Build a resolver for project/context ItemIds
      const refItemAliasMap = new Map<string, string>();

      // Collect project/context IDs
      const projectContextIds = new Set<string>();
      if (item.data.project) {
        projectContextIds.add(item.data.project.toString());
      }
      if (item.data.contexts) {
        for (const ctx of item.data.contexts) {
          projectContextIds.add(ctx.toString());
        }
      }

      // Look up referenced items
      for (const refId of projectContextIds) {
        const parseResult = parseItemId(refId);
        if (parseResult.type === "ok") {
          const loadResult = await deps.itemRepository.load(parseResult.value);
          if (loadResult.type === "ok" && loadResult.value) {
            const refAlias = loadResult.value.data.alias?.toString();
            if (refAlias) {
              refItemAliasMap.set(refId, refAlias);
            }
          }
        }
      }

      const resolveItemId: ItemIdResolver = (id: string): string | undefined =>
        refItemAliasMap.get(id);

      // Format item details
      const formatted = formatItemDetail(item, resolveItemId);

      // Output with pager or directly
      if (usePrint) {
        console.log(formatted);
      } else {
        await outputWithPager(formatted);
      }
    });
}
