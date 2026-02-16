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

/**
 * Helper to create a permanent item with an alias.
 * This is required for using --project and --context options,
 * since they now resolve aliases to ItemIds (UUIDs).
 */
const createPermanentItem = async (
  testHome: string,
  title: string,
  aliasSlug: string,
): Promise<{ id: string }> => {
  const result = await runCommand(testHome, [
    "note",
    title,
    "--dir",
    "permanent",
    "--alias",
    aliasSlug,
  ]);
  if (!result.success) {
    throw new Error(`Failed to create permanent item: ${result.stderr}`);
  }

  // Get the UUID via mm show command
  const showResult = await runCommand(testHome, ["show", aliasSlug]);
  if (!showResult.success) {
    throw new Error(`Failed to show permanent item: ${showResult.stderr}`);
  }

  // Extract UUID from show output (format: "UUID: <uuid>")
  const idMatch = showResult.stdout.match(/UUID:\s*([0-9a-f-]{36})/i);
  if (!idMatch) {
    throw new Error(`Could not extract UUID from show output: ${showResult.stdout}`);
  }
  return { id: idMatch[1] };
};

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
      // First create the project item that will be referenced
      await createPermanentItem(ctx.testHome, "My Project", "my-project");

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

    it("stores project UUID in frontmatter", async () => {
      // First create the project item that will be referenced
      const projectItem = await createPermanentItem(ctx.testHome, "Work Project", "work-project");

      await runCommand(ctx.testHome, [
        "note",
        "Project Note",
        "--project",
        "work-project",
      ]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

      // Find the item file (exclude permanent items)
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
              // Skip the permanent project item
              if (itemId === projectItem.id) continue;
              itemFiles.push({ id: itemId, path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "Expected exactly one non-permanent item file");
      const [{ path: itemFilePath }] = itemFiles;

      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        id: string;
        project: string;
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      // Project is now stored as UUID, not alias string
      assertEquals(frontmatter.project, projectItem.id);
    });

    it("displays +project in list output", async () => {
      // First create the project item that will be referenced
      await createPermanentItem(ctx.testHome, "Deep Work", "deep-work");

      await runCommand(ctx.testHome, [
        "note",
        "Test Note",
        "--project",
        "deep-work",
      ]);

      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      // Should have 2 items: the permanent project and the note (permanent items in 'permanent' bucket)
      // Actually, ls by default only shows today's items, not permanent ones
      assertEquals(itemLines.length >= 1, true, "Should list at least 1 item");
      // For now, project is displayed as UUID until UUID→alias resolution is implemented
      // This test will be updated once UUID→alias resolution is added
      const noteLines = itemLines.filter((line) => line.includes("Test Note"));
      assertEquals(noteLines.length, 1, "Should find the test note");
      // Project reference is included (as +<uuid> for now)
      assertEquals(
        noteLines[0].includes("+"),
        true,
        `Should display +project. Got: ${noteLines[0]}`,
      );
    });
  });

  describe("Creating items with contexts", () => {
    it("creates task with single --context option", async () => {
      // First create the context item that will be referenced
      await createPermanentItem(ctx.testHome, "Office Context", "office");

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
      // First create the context item that will be referenced
      const phoneContext = await createPermanentItem(ctx.testHome, "Phone Context", "phone");

      await runCommand(ctx.testHome, [
        "task",
        "Context Task",
        "-c",
        "phone",
      ]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

      // Find the item file (exclude permanent items)
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
              const itemId = fileEntry.name.slice(0, -3);
              // Skip the permanent context item
              if (itemId === phoneContext.id) continue;
              itemFiles.push({ path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "Expected exactly one non-permanent item file");
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
      // Contexts are now stored as UUIDs, not alias strings
      assertEquals(frontmatter.contexts[0], phoneContext.id);
    });

    it("creates task with multiple --context options", async () => {
      // First create the context items that will be referenced
      await createPermanentItem(ctx.testHome, "Errands Context", "errands");
      await createPermanentItem(ctx.testHome, "Shopping Context", "shopping");

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
      // First create the context items that will be referenced
      const workContext = await createPermanentItem(ctx.testHome, "Work Context", "work");
      const computerContext = await createPermanentItem(
        ctx.testHome,
        "Computer Context",
        "computer",
      );

      await runCommand(ctx.testHome, [
        "task",
        "Multi Context Task",
        "-c",
        "work",
        "-c",
        "computer",
      ]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");

      // Find the item file (exclude permanent items)
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
              const itemId = fileEntry.name.slice(0, -3);
              // Skip the permanent context items
              if (itemId === workContext.id || itemId === computerContext.id) continue;
              itemFiles.push({ path: filePath });
            }
          }
        }
      }

      assertEquals(itemFiles.length, 1, "Expected exactly one non-permanent item file");
      const [{ path: itemFilePath }] = itemFiles;

      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        contexts: string[];
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(frontmatter.contexts.length, 2);
      // Contexts are now stored as UUIDs, not alias strings
      assertEquals(frontmatter.contexts.includes(workContext.id), true);
      assertEquals(frontmatter.contexts.includes(computerContext.id), true);
    });

    it("displays @context in list output", async () => {
      // First create the context item that will be referenced
      await createPermanentItem(ctx.testHome, "Home Context", "home");

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
      // UUID→alias resolution is implemented, should display @home
      assertEquals(
        itemLines[0].includes("@home"),
        true,
        `Should display @home suffix. Got: ${itemLines[0]}`,
      );
    });

    it("displays multiple @contexts in list output", async () => {
      // First create the context items that will be referenced
      await createPermanentItem(ctx.testHome, "Phone Context", "phone");
      await createPermanentItem(ctx.testHome, "Waiting Context", "waiting");

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
      // UUID→alias resolution is implemented, should display aliases
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
      // First create the project and context items that will be referenced
      await createPermanentItem(ctx.testHome, "Team Sync Project", "team-sync");
      await createPermanentItem(ctx.testHome, "Work Context", "work");

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
      // First create the project and context items that will be referenced
      await createPermanentItem(ctx.testHome, "Home Renovation Project", "home-renovation");
      await createPermanentItem(ctx.testHome, "Planning Context", "planning");
      await createPermanentItem(ctx.testHome, "Budget Context", "budget");

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
      // UUID→alias resolution is implemented, should display aliases
      assertEquals(
        itemLines[0].includes("+home-renovation"),
        true,
        `Should display +home-renovation. Got: ${itemLines[0]}`,
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
      // First create the project item that will be referenced
      await createPermanentItem(ctx.testHome, "New Project", "new-project");

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

      // Verify in list output - aliases are now resolved
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
      // First create the project items that will be referenced
      await createPermanentItem(ctx.testHome, "Old Project", "old-project");
      await createPermanentItem(ctx.testHome, "New Project", "new-project");

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

      // Verify in list output - aliases are now resolved and displayed
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("+new-project"),
        true,
        `Should display +new-project alias. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("+old-project"),
        false,
        `Should NOT display +old-project alias. Got: ${itemLines[0]}`,
      );
    });

    it("updates contexts with mm edit --context", async () => {
      // First create the context item that will be referenced
      await createPermanentItem(ctx.testHome, "New Context", "new-context");

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

      // Verify in list output - aliases are now resolved
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("@new-context"),
        true,
        `Should display @new-context. Got: ${itemLines[0]}`,
      );
    });

    it("replaces contexts when editing with multiple --context", async () => {
      // First create the context items that will be referenced
      await createPermanentItem(ctx.testHome, "Old Context", "old-context");
      await createPermanentItem(ctx.testHome, "New A Context", "new-a");
      await createPermanentItem(ctx.testHome, "New B Context", "new-b");

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

      // Verify in list output - aliases are now resolved and displayed
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines[0].includes("@old-context"),
        false,
        `Should NOT display @old-context alias. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@new-a"),
        true,
        `Should display @new-a alias. Got: ${itemLines[0]}`,
      );
      assertEquals(
        itemLines[0].includes("@new-b"),
        true,
        `Should display @new-b alias. Got: ${itemLines[0]}`,
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
      // The CLI should report validation error (either invalid alias format or alias not found)
      assertEquals(
        result.stderr.includes("project") || result.stdout.includes("validation") ||
          result.stderr.includes("Alias") || result.stdout.includes("Alias"),
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
      // The CLI should report validation error (either invalid alias format or alias not found)
      assertEquals(
        result.stderr.includes("context") || result.stdout.includes("validation") ||
          result.stderr.includes("Alias") || result.stdout.includes("Alias"),
        true,
        `Should show error about invalid context. stderr: ${result.stderr}, stdout: ${result.stdout}`,
      );
    });
  });

  describe("Show command displays project and contexts", () => {
    it("shows project and contexts in mm show output", async () => {
      // First create the project and context items that will be referenced
      await createPermanentItem(ctx.testHome, "Test Project", "test-project");
      await createPermanentItem(ctx.testHome, "Context A", "context-a");
      await createPermanentItem(ctx.testHome, "Context B", "context-b");

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

      // UUID→alias resolution is implemented, should display aliases
      assertEquals(
        showResult.stdout.includes("+test-project"),
        true,
        `Should display +test-project in show. Got: ${showResult.stdout}`,
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
