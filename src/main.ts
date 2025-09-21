#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { Command } from "jsr:@cliffy/command@1.0.0-rc.4";
import { createNoteCommand } from "./presentation/cli/commands/note.ts";
import { createCloseCommand } from "./presentation/cli/commands/close.ts";
import { createReopenCommand } from "./presentation/cli/commands/reopen.ts";

async function main() {
  const cli = new Command()
    .name("mm")
    .version("0.1.0")
    .description("Personal knowledge management CLI tool")
    .globalOption("-w, --workspace <workspace:string>", "Workspace to use")
    .command("note", createNoteCommand().description("Create a new note")).alias("n")
    .command("close", createCloseCommand().description("Close items"))
    .command("reopen", createReopenCommand().description("Reopen closed items"));

  await cli.parse(Deno.args);
}

if (import.meta.main) {
  await main();
}
