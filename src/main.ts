#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { Command } from "jsr:@cliffy/command@1.0.0-rc.4";
import { createNoteCommand } from "./presentation/cli/commands/note.ts";

async function main() {
  const cli = new Command()
    .name("mm")
    .version("0.1.0")
    .description("Personal knowledge management CLI tool")
    .globalOption("-w, --workspace <workspace:string>", "Workspace to use")
    .command("note", createNoteCommand().description("Create a new note")).alias("n");

  await cli.parse(Deno.args);
}

if (import.meta.main) {
  await main();
}
