/**
 * E2E Test Scenario 2: Item Creation and Listing
 *
 * Purpose:
 *   Verify that the CLI correctly creates items and stores them according to
 *   the design specification, with proper file structure and metadata handling.
 *
 * Overview:
 *   This scenario tests item lifecycle operations:
 *   - Create items using the `note` command
 *   - List items using the `ls` command
 *   - Verify creation order is preserved (via LexoRank)
 *   - Validate on-disk file structure (YYYY/MM/DD/<uuid>.md)
 *   - Confirm design-compliant storage:
 *     * Title stored as first H1 in markdown body (not in frontmatter)
 *     * Metadata (status, timestamps, etc.) in YAML frontmatter
 *     * Body content in markdown (after frontmatter)
 *   - Test edge cases (empty list, multiple items)
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "./helpers.ts";
import { parseFrontmatter } from "../../src/infrastructure/fileSystem/frontmatter.ts";

describe("Scenario 2: Item creation and listing", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates items with note command", async () => {
    const result1 = await runCommand(ctx.testHome, ["note", "Morning tasks"]);
    assertEquals(result1.success, true, `Failed to create first note: ${result1.stderr}`);
    assertEquals(result1.stdout.includes("Created note"), true);
    assertEquals(result1.stdout.includes("Morning tasks"), true);

    const result2 = await runCommand(ctx.testHome, ["note", "Afternoon tasks"]);
    assertEquals(result2.success, true, `Failed to create second note: ${result2.stderr}`);
    assertEquals(result2.stdout.includes("Created note"), true);
    assertEquals(result2.stdout.includes("Afternoon tasks"), true);

    const result3 = await runCommand(ctx.testHome, ["note", "Evening tasks"]);
    assertEquals(result3.success, true, `Failed to create third note: ${result3.stderr}`);
    assertEquals(result3.stdout.includes("Created note"), true);
    assertEquals(result3.stdout.includes("Evening tasks"), true);
  });

  it("lists created items with ls command", async () => {
    await runCommand(ctx.testHome, ["note", "Morning tasks"]);
    await runCommand(ctx.testHome, ["note", "Afternoon tasks"]);
    await runCommand(ctx.testHome, ["note", "Evening tasks"]);

    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length, 3, "Should list 3 items");

    assertEquals(lines[0].includes("Morning tasks"), true, "First item should be Morning tasks");
    assertEquals(
      lines[1].includes("Afternoon tasks"),
      true,
      "Second item should be Afternoon tasks",
    );
    assertEquals(lines[2].includes("Evening tasks"), true, "Third item should be Evening tasks");
  });

  it("shows items in creation order", async () => {
    await runCommand(ctx.testHome, ["note", "First"]);
    await runCommand(ctx.testHome, ["note", "Second"]);
    await runCommand(ctx.testHome, ["note", "Third"]);

    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");

    assertEquals(lines[0].includes("First"), true);
    assertEquals(lines[1].includes("Second"), true);
    assertEquals(lines[2].includes("Third"), true);
  });

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
    const itemFileStat = await Deno.stat(itemFilePath);
    assertEquals(itemFileStat.isFile, true, "Item .md file should exist");

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

    assertEquals(
      frontmatter.schema,
      "mm.item.frontmatter/2",
      "Frontmatter should have correct schema",
    );
    assertEquals(typeof frontmatter.id, "string", "Frontmatter should have id");
    assertEquals(frontmatter.status, "open", "Frontmatter should have open status");
    assertEquals(typeof frontmatter.created_at, "string", "Frontmatter should have created_at");
    assertEquals(typeof frontmatter.updated_at, "string", "Frontmatter should have updated_at");

    assertEquals(body.includes("Test body"), true, "Body should contain body text");

    // Verify child edges directory exists in .index/graph/parents
    const itemId = itemFiles[0].slice(0, -3); // Remove .md extension
    const edgesDir = join(workspaceDir, ".index", "graph", "parents", itemId);
    const edgesDirStat = await Deno.stat(edgesDir);
    assertEquals(
      edgesDirStat.isDirectory,
      true,
      "edges index directory should exist in .index/graph/parents",
    );
  });

  it("stores item metadata correctly", async () => {
    const createResult = await runCommand(ctx.testHome, ["note", "Test item"]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

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

    assertEquals(body.startsWith("# Test item"), true, "Body should start with H1 title");
  });

  it("shows empty when no items exist", async () => {
    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
    assertEquals(lsResult.stdout, "(empty)", "Should show (empty) when no items exist");
  });

  it("creates multiple items with correct ordering", async () => {
    for (let i = 1; i <= 5; i++) {
      const result = await runCommand(ctx.testHome, ["note", `Task ${i}`]);
      assertEquals(result.success, true, `Failed to create task ${i}`);
    }

    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    const lines = lsResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length, 5, "Should list 5 items");

    for (let i = 0; i < 5; i++) {
      assertEquals(
        lines[i].includes(`Task ${i + 1}`),
        true,
        `Item ${i + 1} should be Task ${i + 1}`,
      );
    }
  });
});
