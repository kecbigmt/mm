/**
 * E2E Test Scenario 11: Doctor Check Command
 *
 * Purpose:
 *   Verify that `mm doctor check` correctly inspects workspace integrity
 *   and reports issues without making modifications.
 *
 * Overview:
 *   This scenario tests the doctor check functionality:
 *   - Reports no issues for valid workspace
 *   - Detects and reports missing edge files
 *   - Detects and reports orphaned edge files
 *   - Detects and reports alias conflicts
 *   - Provides summary with correct issue counts
 *   - Returns appropriate exit codes (0 for no issues, 1 for issues found)
 *
 * Design Reference:
 *   See docs/specs/002_doctor/design.md
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 11: Doctor check command", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("reports no issues for valid empty workspace", async () => {
    await initWorkspace(ctx.testHome, "test-workspace");

    const result = await runCommand(ctx.testHome, ["doctor", "check"]);

    assertEquals(result.success, true, `Command failed: ${result.stderr}`);
    assertEquals(result.stdout.includes("No issues found"), true);
    assertEquals(result.stdout.includes("Scanned 0 items"), true);
    assertEquals(result.stdout.includes("Scanned 0 edges"), true);
    assertEquals(result.stdout.includes("Scanned 0 aliases"), true);
  });

  it("reports no issues for valid workspace with items", async () => {
    await initWorkspace(ctx.testHome, "test-workspace");

    // Create some items
    await runCommand(ctx.testHome, ["note", "First note"]);
    await runCommand(ctx.testHome, ["note", "Second note"]);

    const result = await runCommand(ctx.testHome, ["doctor", "check"]);

    assertEquals(result.success, true, `Command failed: ${result.stderr}`);
    assertEquals(result.stdout.includes("No issues found"), true);
    assertEquals(result.stdout.includes("Scanned 2 items"), true);
  });

  it("detects missing edge files", async () => {
    await initWorkspace(ctx.testHome, "test-workspace");

    // Create an item
    const noteResult = await runCommand(ctx.testHome, ["note", "Test note"]);
    assertEquals(noteResult.success, true, `note failed: ${noteResult.stderr}`);

    // Delete the edge file to create inconsistency
    const workspacePath = getWorkspacePath(ctx.testHome, "test-workspace");
    const graphDatesDir = join(workspacePath, ".index", "graph", "dates");

    // Find and delete edge files
    const deleted = await deleteAllEdgeFiles(graphDatesDir);
    assertEquals(deleted > 0, true, "Should have found and deleted edge files");

    const result = await runCommand(ctx.testHome, ["doctor", "check"]);

    // Should fail because of missing edges
    assertEquals(result.success, false, "Should fail when edges are missing");
    assertEquals(result.stdout.includes("Missing Edge"), true);
    assertEquals(result.stdout.includes("issue(s) found"), true);
  });

  it("detects orphaned edge files", async () => {
    await initWorkspace(ctx.testHome, "test-workspace");

    // Create a workspace structure
    const workspacePath = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = new Date().toISOString().split("T")[0];
    const orphanId = "019a8610-1234-7890-abcd-badc0ffee000";

    // Create an orphaned edge file (no corresponding item)
    const edgeDir = join(workspacePath, ".index", "graph", "dates", today);
    await Deno.mkdir(edgeDir, { recursive: true });

    const edgeFile = join(edgeDir, `${orphanId}.edge.json`);
    await Deno.writeTextFile(
      edgeFile,
      JSON.stringify({ schema: "mm.edge/1", rank: "a" }),
    );

    const result = await runCommand(ctx.testHome, ["doctor", "check"]);

    // Should fail because of orphaned edge
    assertEquals(result.success, false, "Should fail when orphaned edge exists");
    assertEquals(result.stdout.includes("Orphaned Edge"), true);
  });

  // Note: Alias conflict detection is tested in unit tests (index_doctor_test.ts).
  // E2E testing of alias conflicts requires proper CLI support for setting aliases,
  // which will be added in a future iteration.

  it("provides accurate issue count in summary", async () => {
    await initWorkspace(ctx.testHome, "test-workspace");

    // Create an item
    await runCommand(ctx.testHome, ["note", "Test note"]);

    // Delete edge to create one issue
    const workspacePath = getWorkspacePath(ctx.testHome, "test-workspace");
    const graphDatesDir = join(workspacePath, ".index", "graph", "dates");
    await deleteAllEdgeFiles(graphDatesDir);

    const result = await runCommand(ctx.testHome, ["doctor", "check"]);

    assertEquals(result.success, false);
    assertEquals(result.stdout.includes("1 issue(s) found"), true);
  });

  it("accepts workspace option", async () => {
    await initWorkspace(ctx.testHome, "test-workspace");

    const result = await runCommand(ctx.testHome, [
      "doctor",
      "check",
      "--workspace",
      "test-workspace",
    ]);

    assertEquals(result.success, true, `Command failed: ${result.stderr}`);
    assertEquals(result.stdout.includes("No issues found"), true);
  });
});

/**
 * Helper to delete all edge files recursively
 */
async function deleteAllEdgeFiles(dir: string): Promise<number> {
  let deleted = 0;

  try {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory) {
        deleted += await deleteAllEdgeFiles(path);
      } else if (entry.isFile && entry.name.endsWith(".edge.json")) {
        await Deno.remove(path);
        deleted++;
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  return deleted;
}
