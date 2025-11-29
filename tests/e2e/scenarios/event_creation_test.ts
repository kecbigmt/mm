/**
 * E2E Test: Event Creation
 *
 * Purpose:
 *   Verify that the CLI correctly creates events with the `event` command,
 *   handling event-specific fields (startAt, duration) and enforcing
 *   date consistency validation for calendar placements.
 *
 * Overview:
 *   This scenario tests event creation operations:
 *   - Create events using the `event` command and `ev` alias
 *   - Create events with and without start time and duration
 *   - Verify event-specific metadata in frontmatter (startAt, duration)
 *   - Test date consistency validation (startAt date must match parent date)
 *   - Verify validation is skipped for item-based placements
 *   - Test all metadata options work with events
 *
 * Design Reference:
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

describe("E2E: Event creation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates event in today without start time", async () => {
    const result = await runCommand(ctx.testHome, ["event", "Team meeting"]);
    assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created event"), true);
    assertEquals(result.stdout.includes("Team meeting"), true);

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
    assertEquals(itemFiles.length, 1, "Should have exactly one event file");

    const itemFilePath = join(itemsBaseDir, itemFiles[0]);
    const fileContent = await Deno.readTextFile(itemFilePath);
    const parseResult = parseFrontmatter<{
      schema: string;
      id: string;
      icon: string;
      status: string;
      created_at: string;
      updated_at: string;
      start_at?: string;
      duration?: string;
    }>(fileContent);

    assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");
    if (parseResult.type === "error") return;

    const { frontmatter, body } = parseResult.value;

    assertEquals(frontmatter.schema, "mm.item.frontmatter/2");
    assertEquals(frontmatter.icon, "event", "Icon should be 'event'");
    assertEquals(frontmatter.status, "open");
    assertEquals(frontmatter.start_at, undefined, "Should not have startAt");
    assertEquals(frontmatter.duration, undefined, "Should not have duration");
    assertEquals(body.includes("Team meeting"), true);
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
    assertEquals(result.stdout.includes("Created event"), true);
    assertEquals(result.stdout.includes("Team meeting"), true);

    // Verify frontmatter contains startAt and duration
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
      schema: string;
      id: string;
      icon: string;
      status: string;
      start_at?: string;
      duration?: string;
    }>(fileContent);

    assertEquals(parseResult.type, "ok");
    if (parseResult.type === "error") return;

    const { frontmatter } = parseResult.value;
    assertEquals(frontmatter.icon, "event");
    // DateTime may include milliseconds, so we check if it starts with the expected value
    assertEquals(
      frontmatter.start_at?.startsWith(startAt.slice(0, -1)),
      true,
      "Should have startAt in frontmatter",
    );
    assertEquals(frontmatter.duration, "2h", "Should have duration in frontmatter");
  });

  it("creates event using alias 'ev'", async () => {
    const result = await runCommand(ctx.testHome, ["ev", "Quick event"]);
    assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created event"), true);
    assertEquals(result.stdout.includes("Quick event"), true);
  });

  it("rejects event with mismatched startAt date for calendar placement", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);
    const [year, month, day] = today.split("-").map(Number);
    const nextDate = new Date(year, month - 1, day + 1);
    const tomorrowStr = `${nextDate.getFullYear()}-${
      String(nextDate.getMonth() + 1).padStart(2, "0")
    }-${String(nextDate.getDate()).padStart(2, "0")}`;

    // Try to create event with today's startAt but tomorrow's parent
    const startAt = `${today}T14:00:00Z`;
    const result = await runCommand(ctx.testHome, [
      "event",
      "Mismatched event",
      "--start-at",
      startAt,
      "--parent",
      `/${tomorrowStr}`,
    ]);

    // The command prints error to stderr
    // Check for validation error messages
    assertEquals(
      result.stderr.includes("date") || result.stderr.includes("consistency"),
      true,
      "Should show date consistency error",
    );
  });

  it("accepts event with item-based placement (no date validation)", async () => {
    // First create a parent item
    const parentResult = await runCommand(ctx.testHome, ["note", "Parent item"]);
    assertEquals(parentResult.success, true);

    // Get the parent item ID
    const today = await getCurrentDateFromCli(ctx.testHome);
    const parentId = await getLatestItemId(ctx.testHome, "test-workspace", today);

    // Create event under the parent item with any startAt (should not validate date)
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

  it("creates event with all metadata options", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);
    const startAt = `${today}T10:00:00Z`;
    const result = await runCommand(ctx.testHome, [
      "event",
      "Conference talk",
      "--body",
      "Annual tech conference keynote",
      "--context",
      "work",
      "--alias",
      "conf-keynote",
      "--start-at",
      startAt,
      "--duration",
      "1h30m",
    ]);
    assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);

    // Verify all metadata is stored
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
      schema: string;
      icon: string;
      context?: string;
      alias?: string;
      start_at?: string;
      duration?: string;
    }>(fileContent);

    assertEquals(parseResult.type, "ok");
    if (parseResult.type === "error") return;

    const { frontmatter, body } = parseResult.value;
    assertEquals(frontmatter.icon, "event");
    assertEquals(frontmatter.context, "work");
    assertEquals(frontmatter.alias, "conf-keynote");
    // DateTime may include milliseconds, so we check if it starts with the expected value
    assertEquals(frontmatter.start_at?.startsWith(startAt.slice(0, -1)), true);
    assertEquals(frontmatter.duration, "1h30m");
    assertEquals(body.includes("Annual tech conference keynote"), true);
  });

  it("rejects invalid start time format", async () => {
    const result = await runCommand(ctx.testHome, [
      "event",
      "Bad time event",
      "--start-at",
      "not-a-datetime",
    ]);
    // The command prints error to stderr
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
    // The command prints error to stderr
    assertEquals(result.stderr.includes("Invalid duration format"), true);
  });

  it("creates multiple events with correct ordering", async () => {
    await runCommand(ctx.testHome, ["event", "Event 1"]);
    await runCommand(ctx.testHome, ["event", "Event 2"]);
    await runCommand(ctx.testHome, ["event", "Event 3"]);

    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    const lines = extractItemLines(lsResult.stdout);
    assertEquals(lines.length, 3, "Should list 3 events");

    assertEquals(lines[0].includes("Event 1"), true);
    assertEquals(lines[1].includes("Event 2"), true);
    assertEquals(lines[2].includes("Event 3"), true);
  });

  it("uses parent placement date for time-only format", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);
    const result = await runCommand(ctx.testHome, [
      "event",
      "Time only event",
      "--start-at",
      "15:00",
    ]);
    assertEquals(result.success, true, `Failed to create event: ${result.stderr}`);

    // Verify the stored startAt uses today's date
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
      const { frontmatter } = parseResult.value;
      // The stored startAt should include today's date
      assertEquals(frontmatter.start_at?.startsWith(today), true);
    }
  });
});
