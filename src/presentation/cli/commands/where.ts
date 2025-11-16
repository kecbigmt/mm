import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import { parseAliasSlug } from "../../../domain/primitives/alias_slug.ts";
import { join } from "@std/path";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString().slice(-7);

const formatSegmentForTimezone = (
  date: Date,
  timezone: { toString(): string },
): [string, string, string] => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? String(date.getFullYear());
  const month = parts.find((p) => p.type === "month")?.value ??
    String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find((p) => p.type === "day")?.value ?? String(date.getDate()).padStart(2, "0");
  return [year, month, day];
};

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
          console.error(depsResult.error.error.message);
        } else {
          console.error(depsResult.error.message);
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
          console.error(loadResult.error.message);
          return;
        }
        item = loadResult.value;
      } else {
        // Try as alias
        const aliasResult = parseAliasSlug(locatorArg);
        if (aliasResult.type === "ok") {
          const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
          if (aliasLoadResult.type === "error") {
            console.error(aliasLoadResult.error.message);
            return;
          }
          const alias = aliasLoadResult.value;
          if (alias) {
            const itemLoadResult = await deps.itemRepository.load(alias.data.itemId);
            if (itemLoadResult.type === "error") {
              console.error(itemLoadResult.error.message);
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

      const idStr = item.data.id.toString();
      const normalized = idStr.replace(/-/g, "").toLowerCase();
      if (normalized.length === 32 && normalized[12] === "7") {
        const millisecondsHex = normalized.slice(0, 12);
        const value = Number.parseInt(millisecondsHex, 16);
        if (!Number.isNaN(value)) {
          const date = new Date(value);
          const [year, month, day] = formatSegmentForTimezone(date, deps.timezone);
          const physicalPath = join(deps.root, "items", year, month, day, idStr);
          console.log(`  Physical: ${physicalPath}`);
        }
      }
    });
}
