import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Command } from "@cliffy/command";
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
    env: true,
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
          "--parent",
          "/2024-01-05",
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

      const itemsDirectory = join(workspace, "items");
      const itemDirectories: Array<{ id: string; path: string }> = [];
      for await (const yearEntry of Deno.readDir(itemsDirectory)) {
        if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) {
          continue;
        }
        const yearPath = join(itemsDirectory, yearEntry.name);
        for await (const monthEntry of Deno.readDir(yearPath)) {
          if (!monthEntry.isDirectory || monthEntry.name.startsWith(".")) {
            continue;
          }
          const monthPath = join(yearPath, monthEntry.name);
          for await (const dayEntry of Deno.readDir(monthPath)) {
            if (!dayEntry.isDirectory || dayEntry.name.startsWith(".")) {
              continue;
            }
            if (dayEntry.name === "edges") {
              continue;
            }
            const dayPath = join(monthPath, dayEntry.name);
            for await (const itemEntry of Deno.readDir(dayPath)) {
              if (!itemEntry.isDirectory || itemEntry.name.startsWith(".")) {
                continue;
              }
              if (itemEntry.name === "edges") {
                continue;
              }
              itemDirectories.push({ id: itemEntry.name, path: join(dayPath, itemEntry.name) });
            }
          }
        }
      }

      assertEquals(itemDirectories.length, 1, "expected exactly one item directory");
      const [{ path: itemDirectory }] = itemDirectories;

      const metaPath = join(itemDirectory, "meta.json");
      const metaSnapshot = JSON.parse(await Deno.readTextFile(metaPath)) as {
        readonly title: string;
        readonly path: string;
        readonly rank: string;
      };

      assertEquals(metaSnapshot.title, "Integration note");
      assertEquals(metaSnapshot.path, "/2024-01-05");
      assert(metaSnapshot.rank.length > 0, "rank should be persisted");

      const contentPath = join(itemDirectory, "content.md");
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
