/**
 * E2E Test: Schema Migration (mm doctor migrate)
 *
 * Tests the schema migration workflow:
 * - Workspace schema blocking (AC#2)
 * - Migration dry-run mode (AC#8)
 * - Migration execution with permanent item creation (AC#6)
 * - Frontmatter update (AC#7)
 * - Workspace schema update (AC#1)
 * - New workspace creation with v2 schema (AC#1)
 */

import { assert, assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import {
  cleanupTestEnvironment,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Schema Migration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("AC#1: Workspace Schema Version Tracking", () => {
    it("new workspace has mm.workspace/2 schema", async () => {
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      const workspacePath = getWorkspacePath(ctx.testHome, "home");
      const workspaceJson = JSON.parse(
        await Deno.readTextFile(join(workspacePath, "workspace.json")),
      );
      assertEquals(workspaceJson.schema, "mm.workspace/2");
    });
  });

  describe("AC#2: Workspace-level Schema Detection", () => {
    it("blocks commands when workspace schema is mm.workspace/1", async () => {
      // Create workspace first (will have v2)
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      // Downgrade to v1
      const workspacePath = getWorkspacePath(ctx.testHome, "home");
      const wsJsonPath = join(workspacePath, "workspace.json");
      const wsJson = JSON.parse(await Deno.readTextFile(wsJsonPath));
      wsJson.schema = "mm.workspace/1";
      await Deno.writeTextFile(wsJsonPath, JSON.stringify(wsJson, null, 2) + "\n");

      // Try to run mm ls - command should fail
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, false, "ls should fail with outdated schema");
      assert(
        lsResult.stderr.includes("Outdated workspace schema") ||
          lsResult.stderr.includes("mm doctor migrate"),
        `Expected outdated schema error, got: ${lsResult.stderr}`,
      );
    });

    it("allows mm doctor migrate when workspace schema is mm.workspace/1", async () => {
      // Create workspace first (will have v2)
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      // Downgrade to v1
      const workspacePath = getWorkspacePath(ctx.testHome, "home");
      const wsJsonPath = join(workspacePath, "workspace.json");
      const wsJson = JSON.parse(await Deno.readTextFile(wsJsonPath));
      wsJson.schema = "mm.workspace/1";
      await Deno.writeTextFile(wsJsonPath, JSON.stringify(wsJson, null, 2) + "\n");

      // mm doctor migrate --dry-run should work (not blocked)
      const migrateResult = await runCommand(ctx.testHome, [
        "doctor",
        "migrate",
        "--dry-run",
      ]);
      assertEquals(
        migrateResult.success,
        true,
        `Migrate should not be blocked: ${migrateResult.stderr}`,
      );
      assert(
        migrateResult.stdout.includes("dry-run"),
        `Expected dry-run output, got: ${migrateResult.stdout}`,
      );
    });

    it("allows commands when workspace schema is mm.workspace/2", async () => {
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      // mm ls should work with v2 workspace
      const lsResult = await runCommand(ctx.testHome, ["ls"]);
      assertEquals(lsResult.success, true, `ls should work with v2 schema: ${lsResult.stderr}`);
    });
  });

  describe("AC#7: Frontmatter Update", () => {
    it("updates schema from /3 to /4 on save", async () => {
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      // Create a note
      const noteResult = await runCommand(ctx.testHome, [
        "note",
        "Test note for schema",
      ]);
      assertEquals(noteResult.success, true, `Note failed: ${noteResult.stderr}`);

      // Read the item file and verify schema
      const workspacePath = getWorkspacePath(ctx.testHome, "home");
      const itemsDir = join(workspacePath, "items");

      // Find the item file
      let itemFile = "";
      for await (const yearEntry of Deno.readDir(itemsDir)) {
        if (!yearEntry.isDirectory) continue;
        for await (const monthEntry of Deno.readDir(join(itemsDir, yearEntry.name))) {
          if (!monthEntry.isDirectory) continue;
          for await (
            const dayEntry of Deno.readDir(join(itemsDir, yearEntry.name, monthEntry.name))
          ) {
            if (!dayEntry.isDirectory) continue;
            for await (
              const fileEntry of Deno.readDir(
                join(itemsDir, yearEntry.name, monthEntry.name, dayEntry.name),
              )
            ) {
              if (fileEntry.isFile && fileEntry.name.endsWith(".md")) {
                itemFile = join(
                  itemsDir,
                  yearEntry.name,
                  monthEntry.name,
                  dayEntry.name,
                  fileEntry.name,
                );
              }
            }
          }
        }
      }

      assert(itemFile !== "", "Should find an item file");

      const content = await Deno.readTextFile(itemFile);
      assert(
        content.includes("schema: mm.item.frontmatter/4"),
        `Expected schema /4, got content: ${content.substring(0, 300)}`,
      );
    });
  });

  describe("AC#8: Dry-run Mode", () => {
    it("shows analysis without making changes", async () => {
      // Create workspace and downgrade to v1
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      const workspacePath = getWorkspacePath(ctx.testHome, "home");

      // Create a test item with old-format (alias strings)
      const itemDir = join(workspacePath, "items", "2025", "01", "15");
      await Deno.mkdir(itemDir, { recursive: true });
      const itemId = "019a85fc-67c4-7a54-be8e-305bae009f9e";
      const itemContent = `---
id: "${itemId}"
icon: note
status: open
placement: "2025-01-15"
rank: aaa
created_at: "2025-01-15T10:00:00Z"
updated_at: "2025-01-15T10:00:00Z"
project: my-project
contexts:
  - my-context
schema: "mm.item.frontmatter/3"
---
# Test Item`;
      await Deno.writeTextFile(join(itemDir, `${itemId}.md`), itemContent);

      // Create edge file
      const edgeDir = join(workspacePath, ".index", "graph", "dates", "2025-01-15");
      await Deno.mkdir(edgeDir, { recursive: true });
      await Deno.writeTextFile(
        join(edgeDir, `${itemId}.edge.json`),
        JSON.stringify({ schema: "mm.edge/1", to: itemId, rank: "aaa" }, null, 2) + "\n",
      );

      // Downgrade workspace to v1
      const wsJsonPath = join(workspacePath, "workspace.json");
      const wsJson = JSON.parse(await Deno.readTextFile(wsJsonPath));
      wsJson.schema = "mm.workspace/1";
      await Deno.writeTextFile(wsJsonPath, JSON.stringify(wsJson, null, 2) + "\n");

      // Run dry-run
      const result = await runCommand(ctx.testHome, ["doctor", "migrate", "--dry-run"]);
      assertEquals(result.success, true, `Dry-run failed: ${result.stderr}`);

      // Verify output
      assert(
        result.stdout.includes("dry-run"),
        `Should indicate dry-run mode: ${result.stdout}`,
      );
      assert(
        result.stdout.includes("alias") || result.stdout.includes("permanent"),
        `Should mention permanent items or aliases: ${result.stdout}`,
      );

      // Verify no changes were made
      const wsJsonAfter = JSON.parse(await Deno.readTextFile(wsJsonPath));
      assertEquals(wsJsonAfter.schema, "mm.workspace/1", "Schema should not change in dry-run");

      const itemContentAfter = await Deno.readTextFile(join(itemDir, `${itemId}.md`));
      assert(
        itemContentAfter.includes("project: my-project"),
        "Item project should not change in dry-run",
      );
    });
  });

  describe("AC#6 + AC#7: Full Migration", () => {
    it("creates permanent items and updates frontmatter", async () => {
      // Create workspace
      const initResult = await initWorkspace(ctx.testHome, "home");
      assertEquals(initResult.success, true, `Init failed: ${initResult.stderr}`);

      const workspacePath = getWorkspacePath(ctx.testHome, "home");

      // Create test items with old-format (alias strings in project/contexts)
      const itemDir = join(workspacePath, "items", "2025", "01", "15");
      await Deno.mkdir(itemDir, { recursive: true });

      const item1Id = "019a85fc-67c4-7a54-be8e-305bae009f9e";
      const item1Content = `---
id: "${item1Id}"
icon: note
status: open
placement: "2025-01-15"
rank: aaa
created_at: "2025-01-15T10:00:00Z"
updated_at: "2025-01-15T10:00:00Z"
project: alpha-project
contexts:
  - beta-context
schema: "mm.item.frontmatter/3"
---
# Item One`;
      await Deno.writeTextFile(join(itemDir, `${item1Id}.md`), item1Content);

      const item2Id = "019a85fc-67c4-7a54-be8e-305bae009f9f";
      const item2Content = `---
id: "${item2Id}"
icon: task
status: open
placement: "2025-01-15"
rank: bbb
created_at: "2025-01-15T11:00:00Z"
updated_at: "2025-01-15T11:00:00Z"
contexts:
  - beta-context
schema: "mm.item.frontmatter/3"
---
# Item Two`;
      await Deno.writeTextFile(join(itemDir, `${item2Id}.md`), item2Content);

      // Create edge files
      const edgeDir = join(workspacePath, ".index", "graph", "dates", "2025-01-15");
      await Deno.mkdir(edgeDir, { recursive: true });
      await Deno.writeTextFile(
        join(edgeDir, `${item1Id}.edge.json`),
        JSON.stringify({ schema: "mm.edge/1", to: item1Id, rank: "aaa" }, null, 2) + "\n",
      );
      await Deno.writeTextFile(
        join(edgeDir, `${item2Id}.edge.json`),
        JSON.stringify({ schema: "mm.edge/1", to: item2Id, rank: "bbb" }, null, 2) + "\n",
      );

      // Downgrade workspace to v1
      const wsJsonPath = join(workspacePath, "workspace.json");
      const wsJson = JSON.parse(await Deno.readTextFile(wsJsonPath));
      wsJson.schema = "mm.workspace/1";
      await Deno.writeTextFile(wsJsonPath, JSON.stringify(wsJson, null, 2) + "\n");

      // Initialize git to avoid git check issues
      const gitInitCmd = new Deno.Command("git", {
        args: ["init"],
        cwd: workspacePath,
        stdout: "piped",
        stderr: "piped",
        env: Deno.env.toObject(),
      });
      await gitInitCmd.output();

      const gitAddCmd = new Deno.Command("git", {
        args: ["add", "-A"],
        cwd: workspacePath,
        stdout: "piped",
        stderr: "piped",
        env: Deno.env.toObject(),
      });
      await gitAddCmd.output();

      const gitCommitCmd = new Deno.Command("git", {
        args: ["commit", "-m", "initial"],
        cwd: workspacePath,
        stdout: "piped",
        stderr: "piped",
        env: Deno.env.toObject(),
      });
      await gitCommitCmd.output();

      // Run migration with 'y' piped to stdin
      const migrateCmd = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-read",
          "--allow-write",
          "--allow-env",
          "--allow-run",
          "--allow-sys",
          "src/main.ts",
          "doctor",
          "migrate",
        ],
        cwd: Deno.cwd(),
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
        env: {
          ...Deno.env.toObject(),
          MM_HOME: ctx.testHome,
        },
      });
      const proc = migrateCmd.spawn();
      const writer = proc.stdin.getWriter();
      // Wait a bit for the prompt, then write 'y'
      await new Promise((r) => setTimeout(r, 5000));
      await writer.write(new TextEncoder().encode("y\n"));
      await writer.close();
      const output = await proc.output();
      const stdout = new TextDecoder().decode(output.stdout);
      const stderr = new TextDecoder().decode(output.stderr);

      assertEquals(
        output.code,
        0,
        `Migration failed (exit ${output.code}):\nstdout: ${stdout}\nstderr: ${stderr}`,
      );

      // Verify workspace schema updated to v2
      const wsJsonAfter = JSON.parse(await Deno.readTextFile(wsJsonPath));
      assertEquals(wsJsonAfter.schema, "mm.workspace/2", "Workspace schema should be v2");

      // Verify item1 frontmatter updated
      const item1After = await Deno.readTextFile(join(itemDir, `${item1Id}.md`));
      assert(
        item1After.includes("mm.item.frontmatter/4"),
        `Item 1 should have schema /4: ${item1After.substring(0, 300)}`,
      );
      // project should now be a UUID, not "alpha-project"
      assert(
        !item1After.includes("project: alpha-project"),
        `Item 1 project should be migrated to UUID: ${item1After.substring(0, 300)}`,
      );

      // Verify item2 frontmatter updated
      const item2After = await Deno.readTextFile(join(itemDir, `${item2Id}.md`));
      assert(
        item2After.includes("mm.item.frontmatter/4"),
        `Item 2 should have schema /4: ${item2After.substring(0, 300)}`,
      );
      assert(
        !item2After.includes("beta-context"),
        `Item 2 contexts should be migrated to UUID: ${item2After.substring(0, 300)}`,
      );

      // Verify permanent items were created (check items directory for new files)
      // Permanent items are stored under items/YYYY/MM/DD/ like regular items
      let permanentItemCount = 0;
      for await (const yearEntry of Deno.readDir(join(workspacePath, "items"))) {
        if (!yearEntry.isDirectory) continue;
        for await (const monthEntry of Deno.readDir(join(workspacePath, "items", yearEntry.name))) {
          if (!monthEntry.isDirectory) continue;
          for await (
            const dayEntry of Deno.readDir(
              join(workspacePath, "items", yearEntry.name, monthEntry.name),
            )
          ) {
            if (!dayEntry.isDirectory) continue;
            for await (
              const fileEntry of Deno.readDir(
                join(
                  workspacePath,
                  "items",
                  yearEntry.name,
                  monthEntry.name,
                  dayEntry.name,
                ),
              )
            ) {
              if (fileEntry.isFile && fileEntry.name.endsWith(".md")) {
                const content = await Deno.readTextFile(
                  join(
                    workspacePath,
                    "items",
                    yearEntry.name,
                    monthEntry.name,
                    dayEntry.name,
                    fileEntry.name,
                  ),
                );
                if (content.includes("placement: permanent")) {
                  permanentItemCount++;
                }
              }
            }
          }
        }
      }

      // Should have created 2 permanent items: alpha-project and beta-context
      assertEquals(
        permanentItemCount,
        2,
        "Should have created 2 permanent items (alpha-project, beta-context)",
      );

      // Verify mm ls works after migration
      const lsResult = await runCommand(ctx.testHome, ["ls", "2025-01-15"]);
      assertEquals(lsResult.success, true, `ls should work after migration: ${lsResult.stderr}`);
    });
  });
});
