#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run

import { Command } from "@cliffy/command";
import { bold } from "@std/fmt/colors";
import { createNoteCommand } from "./presentation/cli/commands/note.ts";
import { createTaskCommand } from "./presentation/cli/commands/task.ts";
import { createEventCommand } from "./presentation/cli/commands/event.ts";
import { createCloseCommand } from "./presentation/cli/commands/close.ts";
import { createReopenCommand } from "./presentation/cli/commands/reopen.ts";
import { createRemoveCommand } from "./presentation/cli/commands/remove.ts";
import { createWorkspaceCommand } from "./presentation/cli/commands/workspace.ts";
import { createCdCommand } from "./presentation/cli/commands/cd.ts";
import { createPwdCommand } from "./presentation/cli/commands/pwd.ts";
import { createListCommand, listAction } from "./presentation/cli/commands/list.ts";
import { createWhereCommand } from "./presentation/cli/commands/where.ts";
import { createMoveCommand } from "./presentation/cli/commands/move.ts";
import { createDoctorCommand } from "./presentation/cli/commands/doctor/mod.ts";
import { createEditCommand } from "./presentation/cli/commands/edit.ts";
import { createShowCommand } from "./presentation/cli/commands/show.ts";
import { createSnoozeCommand } from "./presentation/cli/commands/snooze.ts";
import { createSyncCommand } from "./presentation/cli/commands/sync.ts";
import { createConfigCommand } from "./presentation/cli/commands/config.ts";
import { createCompletionsCommand } from "./presentation/cli/commands/completions.ts";

/**
 * Default action for `mm` with no arguments.
 * Shows hint message followed by a simple item list.
 */
async function defaultListAction() {
  console.log(`${bold("Hint:")} Use \`mm -h\` for a list of available commands.`);
  console.log("");
  await listAction({}, undefined);
}

async function main() {
  const cli = new Command()
    .name("mm")
    .version(Deno.env.get("MM_VERSION") ?? "0.1.0")
    .description("Personal knowledge management CLI tool")
    .action(defaultListAction)
    .command("note", createNoteCommand().description("Create a new note")).alias("n")
    .command("task", createTaskCommand().description("Create a new task")).alias("t")
    .command("event", createEventCommand().description("Create a new event")).alias("ev")
    .command("close", createCloseCommand().description("Close items")).alias("cl")
    .command("reopen", createReopenCommand().description("Reopen closed items")).alias("op")
    .command("remove", createRemoveCommand().description("Remove items")).alias("rm")
    .command("edit", createEditCommand().description("Edit an item")).alias("e")
    .command("show", createShowCommand().description("Show item details")).alias("s")
    .command("workspace", createWorkspaceCommand().description("Workspace management")).alias("ws")
    .command("cd", createCdCommand().description("Navigate to location in knowledge graph"))
    .command("pwd", createPwdCommand().description("Show current location in knowledge graph"))
    .command("list", createListCommand().description("List items")).alias("ls")
    .command(
      "where",
      createWhereCommand().description("Show logical and physical paths for an item"),
    )
    .command("move", createMoveCommand().description("Move items to a new placement")).alias("mv")
    .command("snooze", createSnoozeCommand().description("Snooze item until a future datetime"))
    .alias("sn")
    .command("doctor", createDoctorCommand().description("Workspace validation and maintenance"))
    .command("sync", createSyncCommand())
    .command("config", createConfigCommand())
    .command(
      "completions",
      createCompletionsCommand().description("Generate shell completion script"),
    );

  await cli.parse(Deno.args);
}

if (import.meta.main) {
  await main();
}
