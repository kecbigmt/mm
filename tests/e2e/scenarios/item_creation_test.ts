/**
 * E2E Test: Item Creation (note, task, event)
 *
 * Purpose:
 *   Verify that the CLI correctly creates items with proper file structure,
 *   metadata handling, and type-specific fields.
 *
 * Overview:
 *   This scenario tests item creation for all item types:
 *   - Common patterns: file structure, metadata, ordering
 *   - Note-specific: basic creation with body
 *   - Task-specific: dueAt field, time-only format
 *   - Event-specific: startAt, duration, date consistency validation
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md
 *   See docs/specs/003_create_task_event/plan.md
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  extractItemLines,
  getCurrentDateFromCli,
  getLatestItemId,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";
import { parseFrontmatter } from "../../../src/infrastructure/fileSystem/frontmatter.ts";

describe("E2E: Item creation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  // ==========================================================================
  // Common patterns (tested once with note, applies to all item types)
  // ==========================================================================

  describe("Common patterns", () => {
    it("creates correct file structure on disk", async () => {
      const createResult = await runCommand(ctx.testHome, [
        "note",
        "Test item",
        "--body",
        "Test body",
      ]);
      assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const today = await getCurrentDateFromCli(ctx.testHome);
      const [year, month, day] = today.split("-");

      const itemsBaseDir = join(workspaceDir, "items", year, month, day);
      const itemsBaseStat = await Deno.stat(itemsBaseDir);
      assertEquals(itemsBaseStat.isDirectory, true, "Items date directory should exist");

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }
      assertEquals(itemFiles.length, 1, "Should have exactly one item file");

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        schema: string;
        id: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter, body } = parseResult.value;

      assertEquals(frontmatter.schema, "mm.item.frontmatter/2");
      assertEquals(typeof frontmatter.id, "string");
      assertEquals(frontmatter.status, "open");
      assertEquals(typeof frontmatter.created_at, "string");
      assertEquals(typeof frontmatter.updated_at, "string");
      assertEquals(body.includes("Test body"), true);

      // Verify edge index directory exists
      const itemId = itemFiles[0].slice(0, -3);
      const edgesDir = join(workspaceDir, ".index", "graph", "parents", itemId);
      const edgesDirStat = await Deno.stat(edgesDir);
      assertEquals(edgesDirStat.isDirectory, true, "edges index directory should exist");
    });

    it("shows items in creation order", async () => {
      await runCommand(ctx.testHome, ["note", "First"]);
      await runCommand(ctx.testHome, ["note", "Second"]);
      await runCommand(ctx.testHome, ["note", "Third"]);

      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      const itemLines = extractItemLines(lsResult.stdout);

      assertEquals(itemLines[0].includes("First"), true);
      assertEquals(itemLines[1].includes("Second"), true);
      assertEquals(itemLines[2].includes("Third"), true);
    });

    it("shows empty when no items exist", async () => {
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
      assertEquals(lsResult.stdout, "(empty)", "Should show (empty) when no items exist");
    });

    it("creates item in specific parent with --parent", async () => {
      await runCommand(ctx.testHome, ["note", "Parent item"]);
      const today = await getCurrentDateFromCli(ctx.testHome);
      const parentId = await getLatestItemId(ctx.testHome, "test-workspace", today);

      const result = await runCommand(ctx.testHome, [
        "note",
        "Child item",
        "--parent",
        `./${parentId}`,
      ]);
      assertEquals(result.success, true, `Failed to create child: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created note"), true);
    });

    it("creates item with all common metadata options", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Full metadata item",
        "--body",
        "Item body content",
        "--context",
        "work",
        "--alias",
        "full-meta",
      ]);
      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const today = await getCurrentDateFromCli(ctx.testHome);
      const [year, month, day] = today.split("-");
      const itemsBaseDir = join(workspaceDir, "items", year, month, day);

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        contexts?: string[];
        alias?: string;
      }>(fileContent);

      assertEquals(parseResult.type, "ok");
      if (parseResult.type === "error") return;

      const { frontmatter, body } = parseResult.value;
      assertEquals(frontmatter.contexts?.[0], "work");
      assertEquals(frontmatter.alias, "full-meta");
      assertEquals(body.includes("Item body content"), true);
    });
  });

  // ==========================================================================
  // Note-specific tests
  // ==========================================================================

  describe("Note creation", () => {
    it("creates note with note command", async () => {
      const result = await runCommand(ctx.testHome, ["note", "My note"]);
      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created note"), true);
      assertEquals(result.stdout.includes("My note"), true);
    });

    it("stores title as H1 in markdown body", async () => {
      await runCommand(ctx.testHome, ["note", "Test title"]);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const today = await getCurrentDateFromCli(ctx.testHome);
      const [year, month, day] = today.split("-");
      const itemsBaseDir = join(workspaceDir, "items", year, month, day);

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<Record<string, unknown>>(fileContent);

      assertEquals(parseResult.type, "ok");
      if (parseResult.type === "ok") {
        assertEquals(parseResult.value.body.startsWith("# Test title"), true);
      }
    });
  });

  // ==========================================================================
  // Task-specific tests
  // ==========================================================================

  describe("Task creation", () => {
    it("creates task with task command", async () => {
      const result = await runCommand(ctx.testHome, ["task", "Review PR"]);
      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created task"), true);
      assertEquals(result.stdout.includes("Review PR"), true);
    });

    it("creates task using alias 't'", async () => {
      const result = await runCommand(ctx.testHome, ["t", "Quick task"]);
      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created task"), true);
    });

    it("creates task with due date", async () => {
      const dueAt = "2025-01-20T17:00:00Z";
      const result = await runCommand(ctx.testHome, [
        "task",
        "Review PR",
        "--due-at",
        dueAt,
      ]);
      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const today = await getCurrentDateFromCli(ctx.testHome);
      const [year, month, day] = today.split("-");
      const itemsBaseDir = join(workspaceDir, "items", year, month, day);

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        icon: string;
        due_at?: string;
      }>(fileContent);

      assertEquals(parseResult.type, "ok");
      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(frontmatter.icon, "task");
      assertEquals(frontmatter.due_at?.startsWith(dueAt.slice(0, -1)), true);
    });

    it("uses parent placement date for time-only due-at format", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);
      const result = await runCommand(ctx.testHome, [
        "task",
        "Time only task",
        "--due-at",
        "17:00",
      ]);
      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const [year, month, day] = today.split("-");
      const itemsBaseDir = join(workspaceDir, "items", year, month, day);

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{ due_at?: string }>(fileContent);

      assertEquals(parseResult.type, "ok");
      if (parseResult.type === "ok") {
        assertEquals(parseResult.value.frontmatter.due_at?.startsWith(today), true);
      }
    });

    it("rejects invalid due date format", async () => {
      const result = await runCommand(ctx.testHome, [
        "task",
        "Bad date task",
        "--due-at",
        "not-a-date",
      ]);
      assertEquals(result.stderr.includes("Invalid due-at format"), true);
    });
  });

  // ==========================================================================
  // Event-specific tests
  // ==========================================================================

  describe("Event creation", () => {
    it("creates event with event command", async () => {
      const result = await runCommand(ctx.testHome, ["event", "Team meeting"]);
      assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created event"), true);
      assertEquals(result.stdout.includes("Team meeting"), true);
    });

    it("creates event using alias 'ev'", async () => {
      const result = await runCommand(ctx.testHome, ["ev", "Quick event"]);
      assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created event"), true);
    });

    it("creates event with start time and duration", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);
      const startAt = `${today}T14:00:00Z`;
      const result = await runCommand(ctx.testHome, [
        "event",
        "Team meeting",
        "--start-at",
        startAt,
        "--duration",
        "2h",
      ]);
      assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const [year, month, day] = today.split("-");
      const itemsBaseDir = join(workspaceDir, "items", year, month, day);

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        icon: string;
        start_at?: string;
        duration?: string;
      }>(fileContent);

      assertEquals(parseResult.type, "ok");
      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(frontmatter.icon, "event");
      assertEquals(frontmatter.start_at?.startsWith(startAt.slice(0, -1)), true);
      assertEquals(frontmatter.duration, "2h");
    });

    it("uses parent placement date for time-only start-at format", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);
      const result = await runCommand(ctx.testHome, [
        "event",
        "Time only event",
        "--start-at",
        "15:00",
      ]);
      assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);

      const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
      const [year, month, day] = today.split("-");
      const itemsBaseDir = join(workspaceDir, "items", year, month, day);

      const itemFiles: string[] = [];
      for await (const entry of Deno.readDir(itemsBaseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          itemFiles.push(entry.name);
        }
      }

      const itemFilePath = join(itemsBaseDir, itemFiles[0]);
      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{ start_at?: string }>(fileContent);

      assertEquals(parseResult.type, "ok");
      if (parseResult.type === "ok") {
        assertEquals(parseResult.value.frontmatter.start_at?.startsWith(today), true);
      }
    });

    it("rejects event with mismatched startAt date for calendar placement", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);
      const [year, month, day] = today.split("-").map(Number);
      const nextDate = new Date(year, month - 1, day + 1);
      const tomorrowStr = `${nextDate.getFullYear()}-${
        String(nextDate.getMonth() + 1).padStart(2, "0")
      }-${String(nextDate.getDate()).padStart(2, "0")}`;

      const startAt = `${today}T14:00:00Z`;
      const result = await runCommand(ctx.testHome, [
        "event",
        "Mismatched event",
        "--start-at",
        startAt,
        "--parent",
        `/${tomorrowStr}`,
      ]);

      assertEquals(
        result.stderr.includes("date") || result.stderr.includes("consistency"),
        true,
        "Should show date consistency error",
      );
    });

    it("accepts event with item-based placement (no date validation)", async () => {
      await runCommand(ctx.testHome, ["note", "Parent item"]);
      const today = await getCurrentDateFromCli(ctx.testHome);
      const parentId = await getLatestItemId(ctx.testHome, "test-workspace", today);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString();
      const result = await runCommand(ctx.testHome, [
        "event",
        "Event under item",
        "--start-at",
        tomorrowStr,
        "--parent",
        `./${parentId}`,
      ]);

      assertEquals(
        result.success,
        true,
        `Should accept event with item placement: ${result.stderr}`,
      );
      assertEquals(result.stdout.includes("Created event"), true);
    });

    it("rejects invalid start time format", async () => {
      const result = await runCommand(ctx.testHome, [
        "event",
        "Bad time event",
        "--start-at",
        "not-a-datetime",
      ]);
      assertEquals(result.stderr.includes("Invalid start-at format"), true);
    });

    it("rejects invalid duration format", async () => {
      const today = await getCurrentDateFromCli(ctx.testHome);
      const startAt = `${today}T14:00:00Z`;
      const result = await runCommand(ctx.testHome, [
        "event",
        "Bad duration event",
        "--start-at",
        startAt,
        "--duration",
        "invalid",
      ]);
      assertEquals(result.stderr.includes("Invalid duration format"), true);
    });
  });
});
