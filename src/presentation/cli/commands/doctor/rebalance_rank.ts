/**
 * CLI command: mm doctor rebalance-rank
 *
 * Rebalances LexoRank values for siblings within each (parent, section) group
 * to restore insertion headroom and optimize rank performance.
 */

import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../../dependencies.ts";
import { createWorkspaceScanner } from "../../../../infrastructure/fileSystem/workspace_scanner.ts";
import {
  groupByPlacement,
  ItemRankUpdate,
  rebalanceGroup,
} from "../../../../infrastructure/fileSystem/rank_rebalancer.ts";
import { updateAllRanks } from "../../../../infrastructure/fileSystem/item_updater.ts";
import { Item } from "../../../../domain/models/item.ts";
import { parseDateTime } from "../../../../domain/primitives/mod.ts";

export const rebalanceRankCommand = new Command()
  .name("rebalance-rank")
  .description("Rebalance LexoRank values for siblings")
  .option("-w, --workspace <path:string>", "Workspace path or name")
  .action(async (options) => {
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
    const scanner = createWorkspaceScanner(deps.root);

    console.log("Rebalancing ranks...\n");

    // Scan all items
    const items: Item[] = [];
    const scanErrors: string[] = [];

    for await (const result of scanner.scanAllItems()) {
      if (result.type === "error") {
        scanErrors.push(`${result.error.path}: ${result.error.message}`);
        continue;
      }
      items.push(result.value);
    }

    if (scanErrors.length > 0) {
      console.log(`⚠ ${scanErrors.length} items could not be scanned:`);
      for (const err of scanErrors.slice(0, 5)) {
        console.log(`  • ${err}`);
      }
      if (scanErrors.length > 5) {
        console.log(`  ... and ${scanErrors.length - 5} more`);
      }
      console.log("");
    }

    console.log(`✓ Scanned ${items.length} items`);

    // Group by placement
    const groups = groupByPlacement(items);
    console.log(`✓ Found ${groups.length} (parent, section) groups`);

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
      console.log("\n✓ All ranks are already balanced. No changes needed.");
      Deno.exit(0);
    }

    // Get current timestamp for updated_at
    const now = new Date().toISOString();
    const updatedAtResult = parseDateTime(now);
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
    console.log(`✓ Rebalanced ${allUpdates.length} items across ${groupSummaries.length} groups`);

    // Show group breakdown (first 10)
    const sortedSummaries = groupSummaries.sort((a, b) => b.count - a.count);
    for (const summary of sortedSummaries.slice(0, 10)) {
      console.log(`  - ${summary.key}: ${summary.count} items`);
    }
    if (sortedSummaries.length > 10) {
      console.log(`  - ... and ${sortedSummaries.length - 10} more groups`);
    }

    console.log("\nRank rebalance complete.\n");
    console.log("⚠ Changes made to Item files (frontmatter only).");
    console.log("  Run 'git status' to review changes before committing.");
  });
