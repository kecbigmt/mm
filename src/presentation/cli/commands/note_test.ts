import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Command } from "jsr:@cliffy/command@1.0.0-rc.4";
import { createNoteCommand } from "./note.ts";

const buildCli = () =>
  new Command()
    .name("mm")
    .version("0.1.0")
    .description("Test harness for mm CLI")
    .globalOption("-w, --workspace <workspace:string>", "Workspace to use")
    .command("note", createNoteCommand());

const captureConsole = () => {
  const logLines: string[] = [];
  const errorLines: string[] = [];
  const warnLines: string[] = [];
  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };
  console.log = (...args) => {
    logLines.push(args.map(String).join(" "));
  };
  console.error = (...args) => {
    errorLines.push(args.map(String).join(" "));
  };
  console.warn = (...args) => {
    warnLines.push(args.map(String).join(" "));
  };

  return {
    logs: logLines,
    errors: errorLines,
    warns: warnLines,
    restore() {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    },
  };
};

Deno.test({
  name: "note command persists note to workspace",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const workspace = await Deno.makeTempDir({ prefix: "mm-cli-integration-" });
    try {
      await Deno.writeTextFile(
        join(workspace, "workspace.json"),
        JSON.stringify({ timezone: "Asia/Tokyo" }, null, 2),
      );

      const noteConsole = captureConsole();
      try {
        await buildCli().parse([
          "note",
          "Integration note",
          "--date",
          "2024-01-05",
          "--workspace",
          workspace,
        ]);
      } finally {
        noteConsole.restore();
      }

      assert(
        noteConsole.errors.length === 0,
        `note command produced errors: ${noteConsole.errors}`,
      );
      const successLine = noteConsole.logs.find((line) => line.includes("Integration note"));
      assert(successLine, "note command did not report created note");

      const indexDirectory = join(workspace, "nodes", ".index");
      const indexFiles: string[] = [];
      for await (const entry of Deno.readDir(indexDirectory)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          indexFiles.push(entry.name);
        }
      }

      assertEquals(indexFiles.length, 1, "expected exactly one index entry");
      const indexFileName = indexFiles[0];
      const itemId = indexFileName.replace(/\.json$/, "");
      const indexSnapshot = JSON.parse(
        await Deno.readTextFile(join(indexDirectory, indexFileName)),
      ) as { readonly path: string };

      const metaPath = join(workspace, "nodes", indexSnapshot.path, itemId, "meta.json");
      const metaSnapshot = JSON.parse(await Deno.readTextFile(metaPath)) as {
        readonly title: string;
        readonly container: string;
      };

      assertEquals(metaSnapshot.title, "Integration note");
      assertEquals(metaSnapshot.container, "2024/01/05");

      const contentPath = join(workspace, "nodes", indexSnapshot.path, itemId, "content.md");
      let contentExists = false;
      try {
        await Deno.stat(contentPath);
        contentExists = true;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }

      if (contentExists) {
        const body = await Deno.readTextFile(contentPath);
        assertEquals(body.trim(), "Integration note");
      }
    } finally {
      await Deno.remove(workspace, { recursive: true });
    }
  },
});
