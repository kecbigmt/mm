/**
 * CLI command for mm doctor rebuild-index
 *
 * Rebuilds .index/graph and .index/aliases from Item frontmatter.
 */

import { Command } from "@cliffy/command";
import { join } from "@std/path";
import { createWorkspaceScanner } from "../../../../infrastructure/fileSystem/workspace_scanner.ts";
import { rebuildFromItems } from "../../../../infrastructure/fileSystem/index_rebuilder.ts";
import {
  replaceIndex,
  writeAliasIndex,
  writeGraphIndex,
} from "../../../../infrastructure/fileSystem/index_writer.ts";
import { Item } from "../../../../domain/models/item.ts";
import { loadCliDependencies } from "../../dependencies.ts";

/**
 * Clean up temporary index directories
 */
const cleanupTempDirs = async (workspaceRoot: string): Promise<void> => {
  try {
    await Deno.remove(join(workspaceRoot, ".index", ".tmp-graph"), { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
  try {
    await Deno.remove(join(workspaceRoot, ".index", ".tmp-aliases"), { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
};

/**
 * Create the rebuild-index command
 */
export const createRebuildIndexCommand = () =>
  new Command()
    .description("Rebuild .index/ from Item frontmatter")
    .action(async () => {
      console.log("Rebuilding workspace index...\n");

      // Load dependencies to get workspace root
      const depsResult = await loadCliDependencies();
      if (depsResult.type === "error") {
        const error = depsResult.error;
        const message = error.type === "repository" ? error.error.message : error.message;
        console.error(`Error: ${message}`);
        Deno.exit(2);
      }
      const workspaceRoot = depsResult.value.root;

      // Create scanner and scan all items
      const scanner = createWorkspaceScanner(workspaceRoot);
      const items: Item[] = [];
      const parseErrors: Array<{ path: string; message: string }> = [];

      let scannedCount = 0;
      for await (const result of scanner.scanAllItems()) {
        if (result.type === "error") {
          parseErrors.push({
            path: result.error.path,
            message: result.error.message,
          });
          continue;
        }
        items.push(result.value);
        scannedCount++;

        // Show progress every 100 items
        if (scannedCount % 100 === 0) {
          console.log(`  Scanned ${scannedCount} items...`);
        }
      }

      console.log(`✓ Scanned ${items.length} items`);

      // Report parse errors if any
      if (parseErrors.length > 0) {
        console.log(`\n⚠ ${parseErrors.length} items could not be parsed:`);
        for (const error of parseErrors.slice(0, 10)) {
          console.log(`  • ${error.path}: ${error.message}`);
        }
        if (parseErrors.length > 10) {
          console.log(`  ... and ${parseErrors.length - 10} more`);
        }
        console.log("");
      }

      // Rebuild index from items
      const rebuildResult = await rebuildFromItems(items);
      if (rebuildResult.type === "error") {
        console.error(`Error: ${rebuildResult.error.message}`);
        Deno.exit(1);
      }

      const { graphEdges, aliases, edgesCreated, aliasesCreated } = rebuildResult.value;

      // Count edges by type
      let dateEdges = 0;
      let parentEdges = 0;
      for (const [dirPath, edges] of graphEdges) {
        if (dirPath.startsWith("dates/")) {
          dateEdges += edges.length;
        } else {
          parentEdges += edges.length;
        }
      }

      // Write graph index to temporary location
      const graphWriteResult = await writeGraphIndex(workspaceRoot, graphEdges, { temp: true });
      if (graphWriteResult.type === "error") {
        console.error(`Error writing graph index: ${graphWriteResult.error.message}`);
        Deno.exit(1);
      }

      // Write alias index to temporary location
      const aliasWriteResult = await writeAliasIndex(workspaceRoot, aliases, { temp: true });
      if (aliasWriteResult.type === "error") {
        console.error(`Error writing alias index: ${aliasWriteResult.error.message}`);
        await cleanupTempDirs(workspaceRoot);
        Deno.exit(1);
      }

      // Replace existing index with new one
      const replaceResult = await replaceIndex(workspaceRoot);
      if (replaceResult.type === "error") {
        console.error(`Error replacing index: ${replaceResult.error.message}`);
        await cleanupTempDirs(workspaceRoot);
        Deno.exit(1);
      }

      // Display results
      console.log(`✓ Built graph index (${edgesCreated} edges)`);
      console.log(`  - Date sections: ${dateEdges} edges`);
      console.log(`  - Parent sections: ${parentEdges} edges`);
      console.log(`✓ Built alias index (${aliasesCreated} aliases)`);
      console.log("\nIndex rebuild complete.");

      // Exit with error if any items failed to parse
      if (parseErrors.length > 0) {
        Deno.exit(1);
      }
    });
