/**
 * E2E Test: Permanent Placement
 *
 * Purpose:
 *   Verify that items can be created with permanent placement and listed
 *   correctly. Permanent placement is date-independent, storing items in
 *   a flat structure under .index/graph/permanent/.
 *
 * Overview:
 *   This scenario tests:
 *   - Creating notes with --placement permanent
 *   - Listing permanent items with `mm ls permanent`
 *   - Verifying file structure for permanent items
 *   - Error handling for invalid placement values
 *
 * Design Reference:
 *   See docs/stories/20260102_permanent-notes-project-context/20260103T035134_permanent-placement.story.md
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

describe("E2E: Permanent Placement", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("Creating permanent items", () => {
    it("creates note with --placement permanent", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Permanent Note",
        "--placement",
        "permanent",
      ]);
      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);
      assertEquals(result.stdout.includes("Created note"), true);
      assertEquals(result.stdout.includes("Permanent Note"), true);
    });

    it("stores placement: permanent in frontmatter", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Permanent Note",
        "--placement",
        "permanent",
      ]);
      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);

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
      const [{ path: itemFilePath, id: itemId }] = itemFiles;

      const fileContent = await Deno.readTextFile(itemFilePath);
      const parseResult = parseFrontmatter<{
        id: string;
        placement: string;
      }>(fileContent);
      assertEquals(parseResult.type, "ok", "Should parse frontmatter successfully");

      if (parseResult.type === "error") return;

      const { frontmatter } = parseResult.value;
      assertEquals(frontmatter.placement, "permanent");

      // Verify edge file exists in permanent directory
      const permanentEdgeDir = join(workspaceDir, ".index", "graph", "permanent");
      const edgeFilePath = join(permanentEdgeDir, `${itemId}.edge.json`);
      const edgeFileStat = await Deno.stat(edgeFilePath);
      assertEquals(edgeFileStat.isFile, true, "Edge file should exist in permanent directory");
    });

    it("rejects invalid placement value", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Invalid Placement",
        "--placement",
        "invalid",
      ]);
      // The CLI prints an error but still exits with 0 (common pattern for CLI tools)
      // Check that error message is present in stderr
      assertEquals(
        result.stderr.includes("Invalid placement value"),
        true,
        `Should show error about invalid placement. stderr: ${result.stderr}`,
      );
      // And that no "Created note" message appears
      assertEquals(
        result.stdout.includes("Created note"),
        false,
        "Should NOT create a note with invalid placement",
      );
    });

    it("rejects using --parent and --placement together", async () => {
      const result = await runCommand(ctx.testHome, [
        "note",
        "Conflicting Options",
        "--placement",
        "permanent",
        "--parent",
        "today",
      ]);
      // The CLI prints an error but still exits with 0 (common pattern for CLI tools)
      assertEquals(
        result.stderr.includes("Cannot use both --parent and --placement"),
        true,
        `Should show error about conflicting options. stderr: ${result.stderr}`,
      );
      // And that no "Created note" message appears
      assertEquals(
        result.stdout.includes("Created note"),
        false,
        "Should NOT create a note with conflicting options",
      );
    });
  });

  describe("Listing permanent items", () => {
    it("lists permanent items with mm ls permanent", async () => {
      // Create a permanent note
      await runCommand(ctx.testHome, [
        "note",
        "First Permanent",
        "--placement",
        "permanent",
      ]);
      await runCommand(ctx.testHome, [
        "note",
        "Second Permanent",
        "--placement",
        "permanent",
      ]);

      // List permanent items
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true, `ls permanent failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 2, "Should list 2 permanent items");
      assertEquals(
        itemLines.some((line) => line.includes("First Permanent")),
        true,
        "Should include First Permanent",
      );
      assertEquals(
        itemLines.some((line) => line.includes("Second Permanent")),
        true,
        "Should include Second Permanent",
      );
    });

    it("shows empty when no permanent items exist", async () => {
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true, `ls permanent failed: ${lsResult.stderr}`);
      assertEquals(lsResult.stdout, "(empty)", "Should show (empty) when no permanent items exist");
    });

    it("lists permanent items with /permanent (absolute path)", async () => {
      await runCommand(ctx.testHome, [
        "note",
        "Absolute Path Test",
        "--placement",
        "permanent",
      ]);

      const lsResult = await runCommand(ctx.testHome, ["ls", "/permanent"]);
      assertEquals(lsResult.success, true, `ls /permanent failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(itemLines.length, 1, "Should list 1 permanent item");
      assertEquals(itemLines[0].includes("Absolute Path Test"), true);
    });
  });

  describe("Permanent items vs date items", () => {
    it("permanent items do not appear in date-based ls", async () => {
      // Create a permanent note and a date-based note
      await runCommand(ctx.testHome, [
        "note",
        "Permanent Note",
        "--placement",
        "permanent",
      ]);
      await runCommand(ctx.testHome, [
        "note",
        "Date Note",
      ]);

      // List today's items (should only show date note)
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines.some((line) => line.includes("Date Note")),
        true,
        "Should include Date Note",
      );
      assertEquals(
        itemLines.some((line) => line.includes("Permanent Note")),
        false,
        "Should NOT include Permanent Note in date listing",
      );
    });

    it("date items do not appear in permanent ls", async () => {
      // Create both types
      await runCommand(ctx.testHome, [
        "note",
        "Permanent Note",
        "--placement",
        "permanent",
      ]);
      await runCommand(ctx.testHome, [
        "note",
        "Date Note",
      ]);

      // List permanent items (should only show permanent note)
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true, `ls permanent failed: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      assertEquals(
        itemLines.some((line) => line.includes("Permanent Note")),
        true,
        "Should include Permanent Note",
      );
      assertEquals(
        itemLines.some((line) => line.includes("Date Note")),
        false,
        "Should NOT include Date Note in permanent listing",
      );
    });
  });
});
