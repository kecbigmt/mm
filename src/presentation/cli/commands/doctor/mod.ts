import { Command } from "@cliffy/command";
import { createRebuildIndexCommand } from "./rebuild_index.ts";

/**
 * Create the parent doctor command with all subcommands
 */
export const createDoctorCommand = () =>
  new Command()
    .description("Workspace validation and maintenance")
    .action(() => {
      // Show help when no subcommand provided
      console.log("Usage: mm doctor <command>\n");
      console.log("Commands:");
      console.log("  check           Inspect workspace integrity without modifications");
      console.log("  rebuild-index   Rebuild .index/ from Item frontmatter");
      console.log("  rebalance-rank  Rebalance LexoRank values for siblings");
      console.log("\nRun 'mm doctor <command> --help' for more information.");
    })
    .command("rebuild-index", createRebuildIndexCommand());
