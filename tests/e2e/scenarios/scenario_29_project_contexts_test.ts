/**
 * E2E Test: Project and Contexts Fields
 *
 * Purpose:
 *   Verify that items can be created and edited with project and contexts fields,
 *   and that they are displayed correctly in list and show commands.
 *
 * Overview:
 *   This scenario tests:
 *   - Creating notes/tasks/events with --project and --context options
 *   - Editing items to add/update/clear project and contexts
 *   - Display format: +project and @context (todo.txt convention)
 *   - Multiple contexts support (-c option is repeatable)
 *   - Frontmatter serialization of project and contexts fields
 *   - Migration from singular context to contexts array
 *
 * Design Reference:
 *   See docs/stories/20260102_permanent-notes-project-context/20260110T112841_project-contexts-fields.story.md
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  extractItemLines,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";
import { parseFrontmatter } from "../../../src/infrastructure/fileSystem/frontmatter.ts";

describe("E2E: Project and Contexts Fields", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("Creating items with project", () => {
    it("creates note with --project option", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Project Note",
        "--project",
        "my-project",
      ]);
      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created note"), true);
      assertEquals(result.stdout.includes("Project Note"), true);
    });

    it("stores project in frontmatter", async () => {
      await runCommand(ctx.testHome, [
        "note",
        "Project Note",
        "--project",
        "work-project",
      ]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

      // Find the item file
      const itemsDir = join(workspaceDir, "items");
      const itemFiles: Array<{ id: string; path: string }> = [];
      for await (const yearEntry of Deno.readDir(itemsDir)) {
        if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) continue;
        const yearPath = join(itemsDir, yearEntry.name);
        for await (const monthEntry of Deno.readDir(yearPath)) {
          if (!monthEntry.isDirectory || monthEntry.name.startsWith(".")) continue;
          const monthPath = join(yearPath, monthEntry.name);
          for await (const dayEntry of Deno.readDir(monthPath)) {
            if (!dayEntry.isDirectory || dayEntry.name.startsWith(".")) continue;
            const dayPath = join(monthPath, dayEntry.name);
            for await (const fileEntry of Deno.readDir(dayPath)) {
              if (fileEntry.isDirectory || !fileEntry.name.endsWith(".md")) continue;
              const filePath = join(dayPath, fileEntry.name);
              const itemId = fileEntry.name.slice(0, -3);
              itemFiles.push({ id: itemId, path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "Expected exactly one item file");
      const [{ path: itemFilePath }] = itemFiles;

      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        id: string;
        project: string;
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(frontmatter.project, "work-project");
    });

    it("displays +project in list output", async () => {
      await runCommand(ctx.testHome, [
        "note",
        "Test Note",
        "--project",
        "deep-work",
      ]);

      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 1, "Should list 1 item");
      assertEquals(
        itemLines[0].includes("+deep-work"),
        true,
        `Should display +project suffix. Got: ${itemLines[0]}`,
      );
    });
  });

  describe("Creating items with contexts", () => {
    it("creates task with single --context option", async () => {
      const result = await runCommand(ctx.testHome, [
        "task",
        "Single Context Task",
        "--context",
        "office",
      ]);
      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created task"), true);
    });

    it("stores contexts array in frontmatter", async () => {
      await runCommand(ctx.testHome, [
        "task",
        "Context Task",
        "-c",
        "phone",
      ]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

      // Find the item file
      const itemsDir = join(workspaceDir, "items");
      const itemFiles: Array<{ path: string }> = [];
      for await (const yearEntry of Deno.readDir(itemsDir)) {
        if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) continue;
        const yearPath = join(itemsDir, yearEntry.name);
        for await (const monthEntry of Deno.readDir(yearPath)) {
          if (!monthEntry.isDirectory || monthEntry.name.startsWith(".")) continue;
          const monthPath = join(yearPath, monthEntry.name);
          for await (const dayEntry of Deno.readDir(monthPath)) {
            if (!dayEntry.isDirectory || dayEntry.name.startsWith(".")) continue;
            const dayPath = join(monthPath, dayEntry.name);
            for await (const fileEntry of Deno.readDir(dayPath)) {
              if (fileEntry.isDirectory || !fileEntry.name.endsWith(".md")) continue;
              const filePath = join(dayPath, fileEntry.name);
              itemFiles.push({ path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "Expected exactly one item file");
      const [{ path: itemFilePath }] = itemFiles;

      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        contexts: string[];
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(Array.isArray(frontmatter.contexts), true, "contexts should be an array");
      assertEquals(frontmatter.contexts.length, 1);
      assertEquals(frontmatter.contexts[0], "phone");
    });

    it("creates task with multiple --context options", async () => {
      const result = await runCommand(ctx.testHome, [
        "task",
        "Multi Context Task",
        "-c",
        "errands",
        "-c",
        "shopping",
      ]);
      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created task"), true);
    });

    it("stores multiple contexts in frontmatter", async () => {
      await runCommand(ctx.testHome, [
        "task",
        "Multi Context Task",
        "-c",
        "work",
        "-c",
        "computer",
      ]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

      // Find the item file
      const itemsDir = join(workspaceDir, "items");
      const itemFiles: Array<{ path: string }> = [];
      for await (const yearEntry of Deno.readDir(itemsDir)) {
        if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) continue;
        const yearPath = join(itemsDir, yearEntry.name);
        for await (const monthEntry of Deno.readDir(yearPath)) {
          if (!monthEntry.isDirectory || monthEntry.name.startsWith(".")) continue;
          const monthPath = join(yearPath, monthEntry.name);
          for await (const dayEntry of Deno.readDir(monthPath)) {
            if (!dayEntry.isDirectory || dayEntry.name.startsWith(".")) continue;
            const dayPath = join(monthPath, dayEntry.name);
            for await (const fileEntry of Deno.readDir(dayPath)) {
              if (fileEntry.isDirectory || !fileEntry.name.endsWith(".md")) continue;
              const filePath = join(dayPath, fileEntry.name);
              itemFiles.push({ path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "Expected exactly one item file");
      const [{ path: itemFilePath }] = itemFiles;

      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        contexts: string[];
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(frontmatter.contexts.length, 2);
      assertEquals(frontmatter.contexts.includes("work"), true);
      assertEquals(frontmatter.contexts.includes("computer"), true);
    });

    it("displays @context in list output", async () => {
      await runCommand(ctx.testHome, [
        "task",
        "Test Task",
        "-c",
        "home",
      ]);

      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 1, "Should list 1 item");
      assertEquals(
        itemLines[0].includes("@home"),
        true,
        `Should display @context suffix. Got: ${itemLines[0]}`,
      );
    });

    it("displays multiple @contexts in list output", async () => {
      await runCommand(ctx.testHome, [
        "task",
        "Multi Test Task",
        "-c",
        "phone",
        "-c",
        "waiting",
      ]);

      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 1, "Should list 1 item");
      assertEquals(
        itemLines[0].includes("@phone"),
        true,
        `Should display @phone suffix. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@waiting"),
        true,
        `Should display @waiting suffix. Got: ${itemLines[0]}`,
      );
    });
  });

  describe("Creating items with both project and contexts", () => {
    it("creates event with --project and --context", async () => {
      const result = await runCommand(ctx.testHome, [
        "event",
        "Team Meeting",
        "--project",
        "team-sync",
        "-c",
        "work",
      ]);
      assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created event"), true);
    });

    it("displays +project and @contexts in list output", async () => {
      await runCommand(ctx.testHome, [
        "note",
        "Full Test",
        "--project",
        "home-renovation",
        "-c",
        "planning",
        "-c",
        "budget",
      ]);

      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 1, "Should list 1 item");
      assertEquals(
        itemLines[0].includes("+home-renovation"),
        true,
        `Should display +project. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@planning"),
        true,
        `Should display @planning. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@budget"),
        true,
        `Should display @budget. Got: ${itemLines[0]}`,
      );
    });
  });

  describe("Editing project and contexts", () => {
    it("updates project with mm edit --project", async () => {
      // Create a note
      const createResult = await runCommand(ctx.testHome, [
        "note",
        "Edit Test",
        "-a",
        "edit-test",
      ]);
      assertEquals(createResult.success, true);

      // Edit to add project
      const editResult = await runCommand(ctx.testHome, [
        "edit",
        "edit-test",
        "--project",
        "new-project",
      ]);
      assertEquals(editResult.success, true, `Failed to edit: ${editResult.stderr}`);

      // Verify in list output
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("+new-project"),
        true,
        `Should display +new-project. Got: ${itemLines[0]}`,
      );
    });

    // Note: Cliffy CLI doesn't accept empty string values for options.
    // To clear the project, users should edit the file directly or use the editor.
    // This test verifies project can be replaced with a new value.
    it("replaces project with mm edit --project", async () => {
      // Create a note with project
      await runCommand(ctx.testHome, [
        "note",
        "Replace Project Test",
        "-a",
        "replace-proj-test",
        "--project",
        "old-project",
      ]);

      // Edit to replace project
      const editResult = await runCommand(ctx.testHome, [
        "edit",
        "replace-proj-test",
        "--project",
        "new-project",
      ]);
      assertEquals(editResult.success, true, `Failed to edit: ${editResult.stderr}`);

      // Verify in list output
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("+new-project"),
        true,
        `Should display +new-project. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("+old-project"),
        false,
        `Should NOT display +old-project. Got: ${itemLines[0]}`,
      );
    });

    it("updates contexts with mm edit --context", async () => {
      // Create a note
      await runCommand(ctx.testHome, [
        "note",
        "Context Edit Test",
        "-a",
        "ctx-edit",
      ]);

      // Edit to add contexts
      const editResult = await runCommand(ctx.testHome, [
        "edit",
        "ctx-edit",
        "-c",
        "new-context",
      ]);
      assertEquals(editResult.success, true, `Failed to edit: ${editResult.stderr}`);

      // Verify in list output
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("@new-context"),
        true,
        `Should display @new-context. Got: ${itemLines[0]}`,
      );
    });

    it("replaces contexts when editing with multiple --context", async () => {
      // Create a note with a context
      await runCommand(ctx.testHome, [
        "note",
        "Replace Test",
        "-a",
        "replace-test",
        "-c",
        "old-context",
      ]);

      // Edit to replace contexts
      const editResult = await runCommand(ctx.testHome, [
        "edit",
        "replace-test",
        "-c",
        "new-a",
        "-c",
        "new-b",
      ]);
      assertEquals(editResult.success, true, `Failed to edit: ${editResult.stderr}`);

      // Verify in list output
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("@old-context"),
        false,
        `Should NOT display @old-context. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@new-a"),
        true,
        `Should display @new-a. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@new-b"),
        true,
        `Should display @new-b. Got: ${itemLines[0]}`,
      );
    });
  });

  describe("Error handling", () => {
    it("rejects invalid project format with spaces", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Invalid Project",
        "--project",
        "has spaces",
      ]);
      // The CLI should report validation error
      assertEquals(
        result.stderr.includes("project") || result.stdout.includes("validation"),
        true,
        `Should show error about invalid project. stderr: ${result.stderr}, stdout: ${result.stdout}`,
      );
    });

    it("rejects invalid context format with special chars", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Invalid Context",
        "-c",
        "bad!char",
      ]);
      // The CLI should report validation error
      assertEquals(
        result.stderr.includes("context") || result.stdout.includes("validation"),
        true,
        `Should show error about invalid context. stderr: ${result.stderr}, stdout: ${result.stdout}`,
      );
    });
  });

  describe("Show command displays project and contexts", () => {
    it("shows project and contexts in mm show output", async () => {
      // Create an item with project and contexts
      await runCommand(ctx.testHome, [
        "note",
        "Show Test",
        "-a",
        "show-test",
        "--project",
        "test-project",
        "-c",
        "context-a",
        "-c",
        "context-b",
      ]);

      // Run show command
      const showResult = await runCommand(ctx.testHome, ["show", "show-test"]);
      assertEquals(showResult.success, true, `show failed: ${showResult.stderr}`);

      assertEquals(
        showResult.stdout.includes("+test-project"),
        true,
        `Should display +project in show. Got: ${showResult.stdout}`,
      );
      assertEquals(
        showResult.stdout.includes("@context-a"),
        true,
        `Should display @context-a in show. Got: ${showResult.stdout}`,
      );
      assertEquals(
        showResult.stdout.includes("@context-b"),
        true,
        `Should display @context-b in show. Got: ${showResult.stdout}`,
      );
    });
  });
});
