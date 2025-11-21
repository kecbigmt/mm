#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { Command } from "@cliffy/command";
import { createNoteCommand } from "./presentation/cli/commands/note.ts";
import { createTaskCommand } from "./presentation/cli/commands/task.ts";
import { createEventCommand } from "./presentation/cli/commands/event.ts";
import { createCloseCommand } from "./presentation/cli/commands/close.ts";
import { createReopenCommand } from "./presentation/cli/commands/reopen.ts";
import { createWorkspaceCommand } from "./presentation/cli/commands/workspace.ts";
import { createCdCommand } from "./presentation/cli/commands/cd.ts";
import { createPwdCommand } from "./presentation/cli/commands/pwd.ts";
import { createLsCommand } from "./presentation/cli/commands/ls.ts";
import { createWhereCommand } from "./presentation/cli/commands/where.ts";
import { createMvCommand } from "./presentation/cli/commands/mv.ts";
import { createDoctorCommand } from "./presentation/cli/commands/doctor/mod.ts";

async function main() {
  const cli = new Command()
    .name("mm")
    .version("0.1.0")
    .description("Personal knowledge management CLI tool")
    .command("note", createNoteCommand().description("Create a new note")).alias("n")
    .command("task", createTaskCommand().description("Create a new task")).alias("t")
    .command("event", createEventCommand().description("Create a new event")).alias("ev")
    .command("close", createCloseCommand().description("Close items"))
    .command("reopen", createReopenCommand().description("Reopen closed items"))
    .command("workspace", createWorkspaceCommand().description("Workspace management")).alias("ws")
    .command("cd", createCdCommand().description("Change current working directory"))
    .command("pwd", createPwdCommand().description("Print current working directory"))
    .command("ls", createLsCommand().description("List items"))
    .command(
      "where",
      createWhereCommand().description("Show logical and physical paths for an item"),
    )
    .command("mv", createMvCommand().description("Move item to a new placement"))
    .command("doctor", createDoctorCommand().description("Workspace validation and maintenance"));

  await cli.parse(Deno.args);
}

if (import.meta.main) {
  await main();
}
