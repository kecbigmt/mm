/**
 * E2E Test Scenario 25: Sync Pull Index Rebuild
 *
 * Verifies automatic index rebuild after `mm sync pull` when items/ changed.
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getWorkspacePath,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 25: Sync Pull Index Rebuild", () => {
  let ctx: TestContext;
  let bareRepoDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    bareRepoDir = join(ctx.testHome, "bare-repo");
    await Deno.mkdir(bareRepoDir);

    // Create bare repository
    const initCmd = new Deno.Command("git", {
      args: ["init", "--bare"],
      cwd: bareRepoDir,
    });
    await initCmd.output();

    // Set default branch to main
    const setHeadCmd = new Deno.Command("git", {
      args: ["symbolic-ref", "HEAD", "refs/heads/main"],
      cwd: bareRepoDir,
    });
    await setHeadCmd.output();

    // Initialize workspace with Git (manual sync mode)
    await runCommand(ctx.testHome, ["workspace", "init", "test-rebuild"]);
    await runCommand(ctx.testHome, ["sync", "init", bareRepoDir, "--branch", "main"]);

    workspaceDir = getWorkspacePath(ctx.testHome, "test-rebuild");

    // Push initial commit to bare repo to establish main branch
    await runCommand(ctx.testHome, ["sync", "push"]);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("rebuilds index when new item ADDED by pull", async () => {
    // Setup: create initial note and push
    await runCommand(ctx.testHome, ["note", "first note"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Simulate remote: add a NEW item file to items/ directory
    await runCommand(ctx.testHome, ["note", "remote note"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Reset local to before the "remote note" commit
    const resetCmd = new Deno.Command("git", {
      args: ["reset", "--hard", "HEAD~1"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await resetCmd.output();

    // Act: pull should receive the new item and trigger index rebuild
    const result = await runCommand(ctx.testHome, ["sync", "pull"]);

    // Assert: index rebuild message should appear
    assertEquals(result.success, true, `Pull should succeed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Index rebuilt:"),
      true,
      `Should rebuild index when new item added. Stdout: ${result.stdout}`,
    );
  });

  it("skips index rebuild when changes are OUTSIDE items/", async () => {
    // Setup: create a note and push
    await runCommand(ctx.testHome, ["note", "local note"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Simulate remote: change files OUTSIDE items/ directory (e.g., docs/)
    const testFilePath = join(workspaceDir, "docs", "test.txt");
    await Deno.mkdir(join(workspaceDir, "docs"), { recursive: true });
    await Deno.writeTextFile(testFilePath, "documentation change");

    const addCmd = new Deno.Command("git", {
      args: ["add", "docs/test.txt"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "docs change"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await commitCmd.output();

    const pushCmd = new Deno.Command("git", {
      args: ["push", "origin", "main"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await pushCmd.output();

    // Reset local to before the docs change
    const resetCmd = new Deno.Command("git", {
      args: ["reset", "--hard", "HEAD~1"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await resetCmd.output();

    // Act: pull changes that don't affect items/
    const result = await runCommand(ctx.testHome, ["sync", "pull"]);

    // Assert: no index rebuild (items/ unchanged)
    assertEquals(result.success, true, `Pull should succeed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Index rebuilt:"),
      false,
      `Should NOT rebuild index when items/ unchanged. Stdout: ${result.stdout}`,
    );
  });

  it("rebuilds index when existing item MODIFIED by pull", async () => {
    // Setup: create a note and push
    await runCommand(ctx.testHome, ["note", "note to modify"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Save HEAD to reset later
    const getHeadCmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const headOutput = await getHeadCmd.output();
    const originalHead = new TextDecoder().decode(headOutput.stdout).trim();

    // Simulate remote: MODIFY existing item file content
    const itemsDir = join(workspaceDir, "items");
    let noteFile: string | null = null;

    // Walk through items directory to find the note file
    for await (const yearEntry of Deno.readDir(itemsDir)) {
      if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) continue;
      const yearDir = join(itemsDir, yearEntry.name);
      for await (const monthEntry of Deno.readDir(yearDir)) {
        if (!monthEntry.isDirectory) continue;
        const monthDir = join(yearDir, monthEntry.name);
        for await (const dayEntry of Deno.readDir(monthDir)) {
          if (!dayEntry.isDirectory || dayEntry.name === "edges") continue;
          const dayDir = join(monthDir, dayEntry.name);
          for await (const fileEntry of Deno.readDir(dayDir)) {
            if (fileEntry.isFile && fileEntry.name.endsWith(".md")) {
              const filePath = join(dayDir, fileEntry.name);
              const content = await Deno.readTextFile(filePath);
              if (content.includes("note to modify")) {
                noteFile = filePath;
                break;
              }
            }
          }
          if (noteFile) break;
        }
        if (noteFile) break;
      }
      if (noteFile) break;
    }

    if (noteFile) {
      // Modify the note content
      const originalContent = await Deno.readTextFile(noteFile);
      await Deno.writeTextFile(noteFile, originalContent + "\n\nModified remotely.");

      // Commit and push the modification
      const addCmd = new Deno.Command("git", {
        args: ["add", noteFile],
        cwd: workspaceDir,
        env: Deno.env.toObject(),
      });
      await addCmd.output();

      const commitCmd = new Deno.Command("git", {
        args: ["commit", "-m", "modify note"],
        cwd: workspaceDir,
        env: Deno.env.toObject(),
      });
      await commitCmd.output();

      await runCommand(ctx.testHome, ["sync", "push"]);

      // Reset local to before modification
      const resetCmd = new Deno.Command("git", {
        args: ["reset", "--hard", originalHead],
        cwd: workspaceDir,
        env: Deno.env.toObject(),
      });
      await resetCmd.output();

      // Act: pull the modification
      const result = await runCommand(ctx.testHome, ["sync", "pull"]);

      // Assert: index rebuild message should appear
      assertEquals(result.success, true, `Pull should succeed: ${result.stderr}`);
      assertEquals(
        result.stdout.includes("Index rebuilt:"),
        true,
        `Should rebuild index when existing item modified. Stdout: ${result.stdout}`,
      );
    } else {
      throw new Error("Could not find note file to modify");
    }
  });

  it("rebuilds index when item DELETED by pull", async () => {
    // Setup: create two notes and push
    await runCommand(ctx.testHome, ["note", "note to keep"]);
    await runCommand(ctx.testHome, ["note", "note to delete"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Save HEAD to reset later
    const getHeadCmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const headOutput = await getHeadCmd.output();
    const beforeDeleteHead = new TextDecoder().decode(headOutput.stdout).trim();

    // Simulate remote: DELETE an existing item file
    const itemsDir = join(workspaceDir, "items");
    let noteFileToDelete: string | null = null;

    for await (const yearEntry of Deno.readDir(itemsDir)) {
      if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) continue;
      const yearDir = join(itemsDir, yearEntry.name);
      for await (const monthEntry of Deno.readDir(yearDir)) {
        if (!monthEntry.isDirectory) continue;
        const monthDir = join(yearDir, monthEntry.name);
        for await (const dayEntry of Deno.readDir(monthDir)) {
          if (!dayEntry.isDirectory || dayEntry.name === "edges") continue;
          const dayDir = join(monthDir, dayEntry.name);
          for await (const fileEntry of Deno.readDir(dayDir)) {
            if (fileEntry.isFile && fileEntry.name.endsWith(".md")) {
              const filePath = join(dayDir, fileEntry.name);
              const content = await Deno.readTextFile(filePath);
              if (content.includes("note to delete")) {
                noteFileToDelete = filePath;
                break;
              }
            }
          }
          if (noteFileToDelete) break;
        }
        if (noteFileToDelete) break;
      }
      if (noteFileToDelete) break;
    }

    if (noteFileToDelete) {
      // Delete the file via git
      const rmCmd = new Deno.Command("git", {
        args: ["rm", noteFileToDelete],
        cwd: workspaceDir,
        env: Deno.env.toObject(),
      });
      await rmCmd.output();

      const commitCmd = new Deno.Command("git", {
        args: ["commit", "-m", "delete note"],
        cwd: workspaceDir,
        env: Deno.env.toObject(),
      });
      await commitCmd.output();

      await runCommand(ctx.testHome, ["sync", "push"]);

      // Reset local to before deletion
      const resetCmd = new Deno.Command("git", {
        args: ["reset", "--hard", beforeDeleteHead],
        cwd: workspaceDir,
        env: Deno.env.toObject(),
      });
      await resetCmd.output();

      // Act: pull the deletion
      const result = await runCommand(ctx.testHome, ["sync", "pull"]);

      // Assert: index rebuild message should appear
      assertEquals(result.success, true, `Pull should succeed: ${result.stderr}`);
      assertEquals(
        result.stdout.includes("Index rebuilt:"),
        true,
        `Should rebuild index when item deleted. Stdout: ${result.stdout}`,
      );
    } else {
      throw new Error("Could not find note file to delete");
    }
  });
});
