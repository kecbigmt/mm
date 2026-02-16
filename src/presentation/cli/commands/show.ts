import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { formatError, formatLocatorError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { formatItemDetail } from "../formatters/item_detail_formatter.ts";
import type { ItemIdResolver } from "../formatters/list_formatter.ts";
import { outputWithPager } from "../pager.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import { createItemLocatorService } from "../../../domain/services/item_locator_service.ts";

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

      const locatorService = createItemLocatorService({
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
        timezone: deps.timezone,
      });
      const resolveResult = await locatorService.resolve(itemLocator);
      if (resolveResult.type === "error") {
        console.error(formatLocatorError(resolveResult.error, debug));
        Deno.exit(1);
      }

      const item = resolveResult.value;

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
