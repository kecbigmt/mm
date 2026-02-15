import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { deriveFilePathFromId } from "../../../infrastructure/fileSystem/item_repository.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { createItemLocatorService } from "../../../domain/services/item_locator_service.ts";
import { createValidationError, createValidationIssue } from "../../../shared/errors.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

export function createWhereCommand() {
  return new Command()
    .description("Show logical and physical paths for an item")
    .arguments("<id:string>")
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
        return;
      }

      const deps = depsResult.value;

      const locatorService = createItemLocatorService({
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
        timezone: deps.timezone,
      });
      const resolveResult = await locatorService.resolve(itemRef);
      if (resolveResult.type === "error") {
        const locatorError = resolveResult.error;
        if (locatorError.kind === "repository_error") {
          console.error(formatError(locatorError.error, debug));
        } else if (locatorError.kind === "ambiguous_prefix") {
          console.error(formatError(
            createValidationError("ItemLocator", [
              createValidationIssue(
                `Ambiguous prefix '${locatorError.locator}': matches ${
                  locatorError.candidates.join(", ")
                }`,
                { code: "ambiguous_prefix" },
              ),
            ]),
            debug,
          ));
        } else {
          console.error(formatError(
            createValidationError("ItemLocator", [
              createValidationIssue(`Item not found: ${locatorError.locator}`, {
                code: "not_found",
              }),
            ]),
            debug,
          ));
        }
        return;
      }

      const item = resolveResult.value;

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
