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

  it("rebuilds index when new item ADDED by pull, making it searchable by alias", async () => {
    // This test uses TWO separate workspaces to simulate real multi-device sync:
    // - Device A: pulls items created by Device B
    // - Device B: creates and pushes items
    // Both workspaces sync to the same bare repository.

    // Setup Device A: create a separate workspace pointing to same bare repo
    const deviceAHome = await Deno.makeTempDir({ prefix: "mm_device_a_" });
    const gitConfigPath = join(deviceAHome, ".gitconfig");
    await Deno.writeTextFile(
      gitConfigPath,
      `[user]
	name = MM Test
	email = test@mm.local
`,
    );

    const runOnDeviceA = async (
      args: string[],
    ): Promise<{ success: boolean; stdout: string; stderr: string }> => {
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-read",
          "--allow-write",
          "--allow-env",
          "--allow-run",
          "--allow-sys",
          "src/main.ts",
          ...args,
        ],
        cwd: Deno.cwd(),
        env: { ...Deno.env.toObject(), MM_HOME: deviceAHome, GIT_CONFIG_GLOBAL: gitConfigPath },
        stdout: "piped",
        stderr: "piped",
      });
      const { success, stdout, stderr } = await command.output();
      return {
        success,
        stdout: new TextDecoder().decode(stdout).trim(),
        stderr: new TextDecoder().decode(stderr).trim(),
      };
    };

    try {
      // Initialize Device A workspace with sync to the same bare repo
      await runOnDeviceA(["workspace", "init", "device-a-ws"]);
      await runOnDeviceA(["sync", "init", bareRepoDir, "--branch", "main"]);

      // Device B (using ctx.testHome): Create a note with explicit alias and push
      const noteResult = await runCommand(ctx.testHome, [
        "note",
        "note-from-device-b",
        "--alias",
        "device-b-alias",
      ]);
      assertEquals(
        noteResult.success,
        true,
        `Device B note creation should succeed: ${noteResult.stderr}`,
      );

      const pushResult = await runCommand(ctx.testHome, ["sync", "push"]);
      assertEquals(pushResult.success, true, `Device B push should succeed: ${pushResult.stderr}`);

      // Device A: Run mm sync pull to get the remote item from Device B
      const pullResult = await runOnDeviceA(["sync", "pull"]);
      assertEquals(pullResult.success, true, `Device A pull should succeed: ${pullResult.stderr}`);

      // Device A: Verify the synced item is searchable by alias
      // Without proper index rebuild, this would fail because alias wouldn't be indexed
      const showResult = await runOnDeviceA(["show", "device-b-alias"]);
      assertEquals(
        showResult.success,
        true,
        `Device A should be able to show synced item by alias after pull. ` +
          `This proves the index was rebuilt. stderr: ${showResult.stderr}`,
      );
      assertEquals(
        showResult.stdout.includes("device-b-alias"),
        true,
        `Output should contain the item alias. stdout: ${showResult.stdout}`,
      );
      assertEquals(
        showResult.stdout.includes("note-from-device-b"),
        true,
        `Output should contain the item title. stdout: ${showResult.stdout}`,
      );
    } finally {
      // Cleanup Device A's temp directory
      await Deno.remove(deviceAHome, { recursive: true });
    }
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

  it("rebuilds index when items changed during rebase pull with local commits", async () => {
    // This test reproduces the issue where HEAD@{1} fails to detect changes
    // after a rebase when local commits exist.
    //
    // Scenario:
    // 1. Create initial note and push
    // 2. Simulate remote: add new item, push
    // 3. Reset local to before remote change
    // 4. Create LOCAL commit (unpushed)
    // 5. Pull with rebase -> local commit rebased on top of remote
    // 6. HEAD@{1} points to last cherry-pick, NOT pre-rebase state
    // 7. Index rebuild should still detect the remote item change

    // Step 1: Create initial note and push
    await runCommand(ctx.testHome, ["note", "initial note"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Save the commit hash after initial push
    const getHeadCmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      cwd: workspaceDir,
      stdout: "piped",
    });
    const headOutput = await getHeadCmd.output();
    const initialHead = new TextDecoder().decode(headOutput.stdout).trim();

    // Step 2: Simulate remote adding a new item
    await runCommand(ctx.testHome, ["note", "remote note from other device"]);
    await runCommand(ctx.testHome, ["sync", "push"]);

    // Step 3: Reset local to before remote change
    const resetCmd = new Deno.Command("git", {
      args: ["reset", "--hard", initialHead],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await resetCmd.output();

    // Step 4: Create a LOCAL commit (simulates work done on this device)
    // Add a non-item file to avoid confusion
    const localFilePath = join(workspaceDir, "local-work.txt");
    await Deno.writeTextFile(localFilePath, "local work in progress");

    const addCmd = new Deno.Command("git", {
      args: ["add", "local-work.txt"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "local work"],
      cwd: workspaceDir,
      env: Deno.env.toObject(),
    });
    await commitCmd.output();

    // Now we have:
    // origin/main: initial -> remote-note
    // local/main:  initial -> local-work (diverged!)

    // Step 5: Pull with rebase
    // This will rebase "local-work" on top of "remote-note"
    const result = await runCommand(ctx.testHome, ["sync", "pull"]);

    // Step 6 & 7: Assert index rebuild detected the remote item change
    assertEquals(result.success, true, `Pull should succeed: ${result.stderr}`);
    assertEquals(
      result.stdout.includes("Index rebuilt:"),
      true,
      `Should rebuild index when items changed via rebase pull. ` +
        `This tests the scenario where local commits exist and rebase is performed. ` +
        `Stdout: ${result.stdout}`,
    );
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
