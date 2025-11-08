/**
 * E2E Test Scenario 3: Alias and ID Resolution
 *
 * Purpose:
 *   Verify that item aliases are correctly set and that both aliases and UUIDs
 *   can be used to resolve items and navigate to them.
 *
 * Overview:
 *   This scenario tests alias functionality:
 *   - Create items with explicit aliases using `--alias` option
 *   - Resolve items using aliases with `where` command
 *   - Resolve items using UUIDs with `where` command
 *   - Navigate to items using aliases with `cd` command
 *   - Verify that aliases are stored correctly in both item metadata and alias index
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md
 */

import { assertEquals, assertExists } from "@std/assert";
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

describe("Scenario 3: Alias and ID resolution", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates item with explicit alias", async () => {
    const result = await runCommand(ctx.testHome, [
      "note",
      "Important memo",
      "--alias",
      "important-memo",
    ]);

    assertEquals(result.success, true, `Failed to create note with alias: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created note"), true);
    assertEquals(result.stdout.includes("Important memo"), true);
  });

  it("resolves item by alias with where command", async () => {
    await runCommand(ctx.testHome, [
      "note",
      "Important memo",
      "--alias",
      "important-memo",
    ]);

    const whereResult = await runCommand(ctx.testHome, ["where", "important-memo"]);
    assertEquals(whereResult.success, true, `where command failed: ${whereResult.stderr}`);

    const today = await getCurrentDateFromCli(ctx.testHome);
    assertEquals(
      whereResult.stdout.includes(`Logical:  /${today}/important-memo`),
      true,
      `Expected logical path to include /${today}/important-memo, got: ${whereResult.stdout}`,
    );
    assertEquals(whereResult.stdout.includes("Physical:"), true);
  });

  it("resolves item by UUID with where command", async () => {
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Important memo",
      "--alias",
      "important-memo",
    ]);

    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    // Extract UUID from output or from file system
    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = await getCurrentDateFromCli(ctx.testHome);
    const [year, month, day] = today.split("-");
    const itemsBaseDir = join(workspaceDir, "items", year, month, day);

    const itemDirs: string[] = [];
    for await (const entry of Deno.readDir(itemsBaseDir)) {
      if (entry.isDirectory) {
        itemDirs.push(entry.name);
      }
    }
    assertEquals(itemDirs.length, 1, "Should have exactly one item directory");

    const itemId = itemDirs[0];
    const whereResult = await runCommand(ctx.testHome, ["where", itemId]);
    assertEquals(whereResult.success, true, `where command failed: ${whereResult.stderr}`);

    const todayPath = await getCurrentDateFromCli(ctx.testHome);
    assertEquals(
      whereResult.stdout.includes(`Logical:  /${todayPath}/important-memo`),
      true,
      `Expected logical path to include /${todayPath}/important-memo, got: ${whereResult.stdout}`,
    );
    assertEquals(whereResult.stdout.includes("Physical:"), true);
  });

  it("navigates to item using alias with cd command", async () => {
    await runCommand(ctx.testHome, [
      "note",
      "Important memo",
      "--alias",
      "important-memo",
    ]);

    const today = await getCurrentDateFromCli(ctx.testHome);
    const cdResult = await runCommand(ctx.testHome, ["cd", "important-memo"]);
    assertEquals(cdResult.success, true, `cd command failed: ${cdResult.stderr}`);

    assertEquals(
      cdResult.stdout,
      `/${today}/important-memo`,
      `Expected CWD to be /${today}/important-memo, got: ${cdResult.stdout}`,
    );

    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd command failed: ${pwdResult.stderr}`);
    assertEquals(
      pwdResult.stdout,
      `/${today}/important-memo`,
      `Expected pwd to return /${today}/important-memo, got: ${pwdResult.stdout}`,
    );
  });

  it("stores alias in item metadata", async () => {
    await runCommand(ctx.testHome, [
      "note",
      "Important memo",
      "--alias",
      "important-memo",
    ]);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = await getCurrentDateFromCli(ctx.testHome);
    const [year, month, day] = today.split("-");
    const itemsBaseDir = join(workspaceDir, "items", year, month, day);

    const itemDirs: string[] = [];
    for await (const entry of Deno.readDir(itemsBaseDir)) {
      if (entry.isDirectory) {
        itemDirs.push(entry.name);
      }
    }
    assertEquals(itemDirs.length, 1, "Should have exactly one item directory");

    const itemDir = join(itemsBaseDir, itemDirs[0]);
    const metaJson = join(itemDir, "meta.json");
    const metaContent = await Deno.readTextFile(metaJson);
    const meta = JSON.parse(metaContent);

    assertEquals(meta.alias, "important-memo", "meta.json should contain alias");
  });

  it("stores alias in alias index", async () => {
    await runCommand(ctx.testHome, [
      "note",
      "Important memo",
      "--alias",
      "important-memo",
    ]);

    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const aliasIndexDir = join(workspaceDir, ".index", "aliases");

    // Check that alias files exist (structure: <hash-prefix>/<hash>.alias.json)
    const hashPrefixDirs: string[] = [];
    for await (const entry of Deno.readDir(aliasIndexDir)) {
      if (entry.isDirectory) {
        hashPrefixDirs.push(entry.name);
      }
    }
    assertExists(
      hashPrefixDirs.length > 0,
      "Alias index should contain at least one hash prefix directory",
    );

    // Find the alias file
    let aliasFound = false;
    for (const prefixDir of hashPrefixDirs) {
      const prefixPath = join(aliasIndexDir, prefixDir);
      for await (const entry of Deno.readDir(prefixPath)) {
        if (entry.isFile && entry.name.endsWith(".alias.json")) {
          const aliasContent = await Deno.readTextFile(join(prefixPath, entry.name));
          const aliasData = JSON.parse(aliasContent);
          if (aliasData.raw === "important-memo") {
            aliasFound = true;
            assertEquals(
              aliasData.raw,
              "important-memo",
              "Alias file should contain correct raw value",
            );
            assertExists(aliasData.canonicalKey, "Alias file should contain canonicalKey");
            assertExists(aliasData.itemId, "Alias file should contain itemId");
            break;
          }
        }
      }
      if (aliasFound) break;
    }
    assertEquals(aliasFound, true, "Alias should be stored in alias index");
  });

  it("generates automatic alias when alias is not provided", async () => {
    const result = await runCommand(ctx.testHome, ["note", "Auto alias test"]);

    assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);
    assertEquals(result.stdout.includes("Created note"), true);

    // Check that an alias was generated and stored
    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = await getCurrentDateFromCli(ctx.testHome);
    const [year, month, day] = today.split("-");
    const itemsBaseDir = join(workspaceDir, "items", year, month, day);

    const itemDirs: string[] = [];
    for await (const entry of Deno.readDir(itemsBaseDir)) {
      if (entry.isDirectory) {
        itemDirs.push(entry.name);
      }
    }
    assertEquals(itemDirs.length, 1, "Should have exactly one item directory");

    const itemDir = join(itemsBaseDir, itemDirs[0]);
    const metaJson = join(itemDir, "meta.json");
    const metaContent = await Deno.readTextFile(metaJson);
    const meta = JSON.parse(metaContent);

    assertExists(meta.alias, "meta.json should contain auto-generated alias");
    // Auto-generated alias should match pattern: CVCV-base36^3 (e.g., bugi-j1a)
    const aliasPattern =
      /^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz][aeiou]-[0-9a-z]{3}$/;
    assertEquals(
      aliasPattern.test(meta.alias),
      true,
      `Auto-generated alias should match pattern CVCV-base36^3, got: ${meta.alias}`,
    );

    // Verify alias is stored in alias index
    const aliasIndexDir = join(workspaceDir, ".index", "aliases");
    const hashPrefixDirs: string[] = [];
    for await (const entry of Deno.readDir(aliasIndexDir)) {
      if (entry.isDirectory) {
        hashPrefixDirs.push(entry.name);
      }
    }
    assertExists(
      hashPrefixDirs.length > 0,
      "Alias index should contain at least one hash prefix directory",
    );

    let aliasFound = false;
    for (const prefixDir of hashPrefixDirs) {
      const prefixPath = join(aliasIndexDir, prefixDir);
      for await (const entry of Deno.readDir(prefixPath)) {
        if (entry.isFile && entry.name.endsWith(".alias.json")) {
          const aliasContent = await Deno.readTextFile(join(prefixPath, entry.name));
          const aliasData = JSON.parse(aliasContent);
          if (aliasData.raw === meta.alias) {
            aliasFound = true;
            break;
          }
        }
      }
      if (aliasFound) break;
    }
    assertEquals(aliasFound, true, "Auto-generated alias should be stored in alias index");
  });
});
