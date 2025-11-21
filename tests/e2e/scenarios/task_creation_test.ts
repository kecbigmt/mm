/**
 * E2E Test: Task Creation
 *
 * Purpose:
 *   Verify that the CLI correctly creates tasks with the `task` command,
 *   handling task-specific fields like dueAt and validating proper storage.
 *
 * Overview:
 *   This scenario tests task creation operations:
 *   - Create tasks using the `task` command and `t` alias
 *   - Create tasks with and without due dates
 *   - Verify task-specific metadata in frontmatter (dueAt)
 *   - Validate on-disk file structure and content
 *   - Test all metadata options work with tasks
 *
 * Design Reference:
 *   See docs/specs/003_create_task_event/plan.md
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  getLatestItemId,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";
import { parseFrontmatter } from "../../../src/infrastructure/fileSystem/frontmatter.ts";

describe("E2E: Task creation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates task in today without due date", async () => {
    const result = await runCommand(ctx.testHome, ["task", "Review PR"]);
    assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created task"), true);
    assertEquals(result.stdout.includes("Review PR"), true);

    // Verify file structure
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
    assertEquals(itemFiles.length, 1, "Should have exactly one task file");

    const itemFilePath = join(itemsBaseDir, itemFiles[0]);
    const fileContent = await Deno.readTextFile(itemFilePath);
    const parseResult = parseFrontmatter<{
      schema: string;
      id: string;
      icon: string;
      status: string;
      created_at: string;
      updated_at: string;
      due_at?: string;
    }>(fileContent);

    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") return;

    const { frontmatter, body } = parseResult.value;

    assertEquals(frontmatter.schema, "mm.item.frontmatter/2");
    assertEquals(frontmatter.icon, "task", "Icon should be 'task'");
    assertEquals(frontmatter.status, "open");
    assertEquals(frontmatter.due_at, undefined, "Should not have dueAt");
    assertEquals(body.includes("Review PR"), true);
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
    assertEquals(result.stdout.includes("Created task"), true);
    assertEquals(result.stdout.includes("Review PR"), true);

    // Verify frontmatter contains dueAt
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
      schema: string;
      id: string;
      icon: string;
      status: string;
      due_at?: string;
    }>(fileContent);

    assertEquals(parseResult.type, "ok");
    if (parseResult.type === "error") return;

    const { frontmatter } = parseResult.value;
    assertEquals(frontmatter.icon, "task");
    // DateTime may include milliseconds, so we check if it starts with the expected value
    assertEquals(
      frontmatter.due_at?.startsWith(dueAt.slice(0, -1)),
      true,
      "Should have dueAt in frontmatter",
    );
  });

  it("creates task using alias 't'", async () => {
    const result = await runCommand(ctx.testHome, ["t", "Quick task"]);
    assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created task"), true);
    assertEquals(result.stdout.includes("Quick task"), true);
  });

  it("creates task in specific parent with --parent", async () => {
    // First create a parent note to create under
    await runCommand(ctx.testHome, ["note", "Parent for task"]);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const parentId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    const result = await runCommand(ctx.testHome, [
      "task",
      "Subtask",
      "--parent",
      `./${parentId}`,
    ]);
    assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created task"), true);
    assertEquals(result.stdout.includes("Subtask"), true);
  });

  it("creates task with all metadata options", async () => {
    const result = await runCommand(ctx.testHome, [
      "task",
      "Complete project",
      "--body",
      "Project details here",
      "--context",
      "work",
      "--alias",
      "proj-complete",
      "--due-at",
      "2025-01-25T23:59:59Z",
    ]);
    assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);

    // Verify all metadata is stored
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
      schema: string;
      icon: string;
      context?: string;
      alias?: string;
      due_at?: string;
    }>(fileContent);

    assertEquals(parseResult.type, "ok");
    if (parseResult.type === "error") return;

    const { frontmatter, body } = parseResult.value;
    assertEquals(frontmatter.icon, "task");
    assertEquals(frontmatter.context, "work");
    assertEquals(frontmatter.alias, "proj-complete");
    // DateTime may include milliseconds, so we check if it starts with the expected value
    assertEquals(frontmatter.due_at?.startsWith("2025-01-25T23:59:59"), true);
    assertEquals(body.includes("Project details here"), true);
  });

  it("rejects invalid due date format", async () => {
    const result = await runCommand(ctx.testHome, [
      "task",
      "Bad date task",
      "--due-at",
      "not-a-date",
    ]);
    // The command prints error to stderr but exits with success code
    // We check that an error message was printed
    assertEquals(result.stderr.includes("Invalid due-at format"), true);
  });

  it("creates multiple tasks with correct ordering", async () => {
    await runCommand(ctx.testHome, ["task", "Task 1"]);
    await runCommand(ctx.testHome, ["task", "Task 2"]);
    await runCommand(ctx.testHome, ["task", "Task 3"]);

    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length, 3, "Should list 3 tasks");

    assertEquals(lines[0].includes("Task 1"), true);
    assertEquals(lines[1].includes("Task 2"), true);
    assertEquals(lines[2].includes("Task 3"), true);
  });
});
