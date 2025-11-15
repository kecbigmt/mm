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
      const itemFiles: Array<{ id: string; path: string }> = [];
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
            const dayPath = join(monthPath, dayEntry.name);
            // Scan files in day directory
            for await (const fileEntry of Deno.readDir(dayPath)) {
              // Skip directories and non-.md files
              if (fileEntry.isDirectory || !fileEntry.name.endsWith(".md")) {
                continue;
              }
              const filePath = join(dayPath, fileEntry.name);
              const itemId = fileEntry.name.slice(0, -3); // Remove .md extension
              itemFiles.push({ id: itemId, path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "expected exactly one item file");
      const [{ path: itemFilePath }] = itemFiles;

      // Read and verify .md file with frontmatter
      const fileContent = await Deno.readTextFile(itemFilePath);

      // Verify frontmatter structure
      assert(fileContent.startsWith("---\n"), "file should start with frontmatter delimiter");
      assert(fileContent.includes("\n---\n"), "frontmatter should be closed");

      // Parse frontmatter
      const frontmatterEnd = fileContent.indexOf("\n---\n", 4);
      const yamlContent = fileContent.slice(4, frontmatterEnd);
      assert(yamlContent.includes("path: /2024-01-05"), "frontmatter should contain path");
      assert(yamlContent.includes("rank:"), "frontmatter should contain rank");
      assert(
        yamlContent.includes("schema: mm.item.frontmatter/1"),
        "frontmatter should contain schema",
      );

      // Verify body content
      const bodyStart = frontmatterEnd + 5;
      const bodyContent = fileContent.slice(bodyStart).trim();
      assert(bodyContent.startsWith("# Integration note"), "body should start with H1 title");
      assertEquals(bodyContent, "# Integration note");
    } finally {
      await Deno.remove(workspace, { recursive: true });
    }
  },
});
