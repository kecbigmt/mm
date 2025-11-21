/**
 * CLI command: mm doctor rebalance-rank <paths...>
 *
 * Rebalances LexoRank values for siblings within specified path(s)
 * to restore insertion headroom and optimize rank performance.
 */

import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../../dependencies.ts";
import {
  groupByPlacement,
  ItemRankUpdate,
  rebalanceGroup,
} from "../../../../infrastructure/fileSystem/rank_rebalancer.ts";
import { updateAllRanks } from "../../../../infrastructure/fileSystem/item_updater.ts";
import { Item } from "../../../../domain/models/item.ts";
import { parseDateTime } from "../../../../domain/primitives/mod.ts";
import { parseRangeExpression } from "../../path_expression.ts";
import { createPathResolver } from "../../../../domain/services/path_resolver.ts";
import { CwdResolutionService } from "../../../../domain/services/cwd_resolution_service.ts";

export const rebalanceRankCommand = new Command()
  .name("rebalance-rank")
  .description("Rebalance LexoRank values for siblings within specified paths")
  .arguments("<paths...:string>")
  .option("-w, --workspace <path:string>", "Workspace path or name")
  .action(async (options, ...paths: string[]) => {
    // Load dependencies
    const depsResult = await loadCliDependencies(options.workspace);
    if (depsResult.type === "error") {
      if (depsResult.error.type === "workspace") {
        console.error(`Error: ${depsResult.error.message}`);
      } else {
        console.error(`Error: ${depsResult.error.error.message}`);
      }
      Deno.exit(2);
    }

    const deps = depsResult.value;
    const now = new Date();

    console.log("Rebalancing ranks...\n");
    console.log(`Target paths: ${paths.join(", ")}\n`);

    // Get current CWD for path resolution
    const cwdResult = await CwdResolutionService.getCwd(
      {
        stateRepository: deps.stateRepository,
        itemRepository: deps.itemRepository,
      },
      now,
    );

    if (cwdResult.type === "error") {
      console.error(`Error resolving CWD: ${cwdResult.error.message}`);
      Deno.exit(1);
    }

    // Create path resolver
    const pathResolver = createPathResolver({
      aliasRepository: deps.aliasRepository,
      itemRepository: deps.itemRepository,
      timezone: deps.timezone,
      today: now,
    });

    // Resolve each path expression and collect items (deduplicated by item ID)
    const itemsMap = new Map<string, Item>();
    const resolveErrors: string[] = [];

    for (const pathExpr of paths) {
      // Parse path expression
      const rangeExprResult = parseRangeExpression(pathExpr);
      if (rangeExprResult.type === "error") {
        resolveErrors.push(`"${pathExpr}": invalid expression`);
        continue;
      }

      // Resolve to PlacementRange
      const resolveResult = await pathResolver.resolveRange(
        cwdResult.value,
        rangeExprResult.value,
      );
      if (resolveResult.type === "error") {
        resolveErrors.push(`"${pathExpr}": ${resolveResult.error.issues.join(", ")}`);
        continue;
      }

      // Query items efficiently using index
      const itemsResult = await deps.itemRepository.listByPlacement(resolveResult.value);
      if (itemsResult.type === "error") {
        resolveErrors.push(`"${pathExpr}": ${itemsResult.error.message}`);
        continue;
      }

      // Add items to map (deduplicates by item ID for overlapping paths)
      for (const item of itemsResult.value) {
        itemsMap.set(item.data.id.toString(), item);
      }
    }

    const items = Array.from(itemsMap.values());

    if (resolveErrors.length > 0) {
      console.log(`⚠ ${resolveErrors.length} path(s) could not be resolved:`);
      for (const err of resolveErrors.slice(0, 5)) {
        console.log(`  • ${err}`);
      }
      if (resolveErrors.length > 5) {
        console.log(`  ... and ${resolveErrors.length - 5} more`);
      }
      console.log("");
    }

    if (items.length === 0) {
      console.log(`✗ No items found in target paths.`);
      console.log(
        `  Make sure the path expressions are correct (e.g., "today", "2025-01-15", alias, or UUID).`,
      );
      Deno.exit(1);
    }

    console.log(`✓ Found ${items.length} items in target paths`);

    // Group by placement (items are already filtered to target paths)
    const groups = groupByPlacement(items);

    // Rebalance each group
    const allUpdates: ItemRankUpdate[] = [];
    const groupSummaries: Array<{ key: string; count: number }> = [];

    for (const group of groups) {
      const result = rebalanceGroup(group.siblings, deps.rankService);
      if (result.type === "error") {
        console.error(`Error rebalancing group ${group.placementKey}: ${result.error.message}`);
        continue;
      }

      if (result.value.length > 0) {
        allUpdates.push(...result.value);
        groupSummaries.push({
          key: group.placementKey,
          count: result.value.length,
        });
      }
    }

    if (allUpdates.length === 0) {
      console.log("\n✓ All ranks in target paths are already balanced. No changes needed.");
      Deno.exit(0);
    }

    // Get current timestamp for updated_at
    const nowIso = new Date().toISOString();
    const updatedAtResult = parseDateTime(nowIso);
    if (updatedAtResult.type === "error") {
      console.error("Error: failed to create timestamp");
      Deno.exit(1);
    }
    const updatedAt = updatedAtResult.value;

    // Apply updates
    const timezone = deps.timezone.toString();
    const updateResult = await updateAllRanks(deps.root, timezone, allUpdates, updatedAt);

    if (updateResult.type === "error") {
      console.error(`\nError updating items: ${updateResult.error.message}`);
      console.error(`  Item: ${updateResult.error.itemId}`);
      Deno.exit(1);
    }

    // Display results
    console.log(`✓ Rebalanced ${allUpdates.length} items`);

    // Show placement breakdown (first 10)
    const sortedSummaries = groupSummaries.sort((a, b) => b.count - a.count);
    for (const summary of sortedSummaries.slice(0, 10)) {
      console.log(`  - ${summary.key}: ${summary.count} items`);
    }
    if (sortedSummaries.length > 10) {
      console.log(`  - ... and ${sortedSummaries.length - 10} more placements`);
    }

    console.log("\nRank rebalance complete.\n");
    console.log("⚠ Changes made to Item files (frontmatter only).");
    console.log("  Run 'git status' to review changes before committing.");
  });
