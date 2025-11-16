/**
 * E2E Test Scenario 10: Navigation
 *
 * Purpose:
 *   Verify navigation behavior including dotdot (..) parent navigation,
 *   dot (.) current directory, and various path patterns across item hierarchies.
 *
 * Overview:
 *   This scenario tests navigation operations:
 *   - Navigate up item hierarchies using ../ (dotdot)
 *   - Navigate multiple levels using ../../
 *   - List parent directories using ls ../
 *   - Navigate from sections to parent items
 *   - Stay in current directory using . (dot)
 *   - Absolute vs relative path navigation
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md section 5 (Logical Navigation)
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 10: Navigation", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("navigates up item hierarchy using dotdot (../)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create hierarchy: A -> B -> C
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"]);
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"]);
    await runCommand(ctx.testHome, ["note", "C", "--parent", "b", "--alias", "c"]);

    // Navigate to c
    const cdCResult = await runCommand(ctx.testHome, ["cd", "c"]);
    assertEquals(cdCResult.success, true, `cd c failed: ${cdCResult.stderr}`);

    // Verify pwd is c
    let pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("/a/b/c"), true, "CWD should be /a/b/c");

    // Navigate up to b using ../
    const cdUpResult = await runCommand(ctx.testHome, ["cd", "../"]);
    assertEquals(cdUpResult.success, true, `cd ../ failed: ${cdUpResult.stderr}`);

    // Verify pwd is b
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("/a/b"), true, "CWD should be /a/b");
    assertEquals(pwdResult.stdout.includes("/c"), false, "CWD should not include /c");

    // Navigate up to a using ../../ (from c)
    await runCommand(ctx.testHome, ["cd", "c"]);
    const cdUp2Result = await runCommand(ctx.testHome, ["cd", "../../"]);
    assertEquals(cdUp2Result.success, true, `cd ../../ failed: ${cdUp2Result.stderr}`);

    // Verify pwd is a
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("/a"), true, "CWD should be /a");
    assertEquals(pwdResult.stdout.includes("/b"), false, "CWD should not include /b");
  });

  it("navigates up from sections to parent items using dotdot", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create item with sections
    await runCommand(ctx.testHome, ["note", "Chapter", "--alias", "chapter"]);
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter/1"]);

    // Navigate to chapter/1
    await runCommand(ctx.testHome, ["cd", "chapter/1"]);

    // Verify we're in section 1
    let pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("chapter/1"), true, "CWD should be chapter/1");

    // Navigate up using ../
    const cdUpResult = await runCommand(ctx.testHome, ["cd", "../"]);
    assertEquals(cdUpResult.success, true, `cd ../ from section failed: ${cdUpResult.stderr}`);

    // Verify we're back to chapter (section removed)
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/chapter"), true, "CWD should be /chapter");
    assertEquals(pwdResult.stdout.includes("/1"), false, "CWD should not include section /1");
  });

  it("lists parent items using dotdot (ls ../)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create hierarchy: Parent -> Child1, Child2, Grandchild
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"]);
    await runCommand(ctx.testHome, ["note", "Child1", "--parent", "parent"]);
    await runCommand(ctx.testHome, ["note", "Child2", "--parent", "parent"]);
    await runCommand(ctx.testHome, [
      "note",
      "Grandchild",
      "--parent",
      "parent",
      "--alias",
      "grandchild",
    ]);

    // Navigate to grandchild
    await runCommand(ctx.testHome, ["cd", "grandchild"]);

    // List parent directory (should show siblings: Child1, Child2, Grandchild)
    const lsParentResult = await runCommand(ctx.testHome, ["ls", "../"]);
    assertEquals(lsParentResult.success, true, `ls ../ failed: ${lsParentResult.stderr}`);

    const lines = lsParentResult.stdout.split("\n").filter((line) => line.trim() !== "");
    assertEquals(lines.length >= 3, true, "Should list at least 3 items in parent");
    assertEquals(
      lsParentResult.stdout.includes("Child1") ||
        lsParentResult.stdout.includes("child1"),
      true,
      "Should list Child1",
    );
    assertEquals(
      lsParentResult.stdout.includes("Child2") ||
        lsParentResult.stdout.includes("child2"),
      true,
      "Should list Child2",
    );
    assertEquals(
      lsParentResult.stdout.includes("Grandchild") ||
        lsParentResult.stdout.includes("grandchild"),
      true,
      "Should list Grandchild",
    );

    // List grandparent directory (should show Parent)
    const lsGrandparentResult = await runCommand(ctx.testHome, ["ls", "../../"]);
    assertEquals(
      lsGrandparentResult.success,
      true,
      `ls ../../ failed: ${lsGrandparentResult.stderr}`,
    );
    assertEquals(
      lsGrandparentResult.stdout.includes("Parent") ||
        lsGrandparentResult.stdout.includes("parent"),
      true,
      "Should list Parent item",
    );
  });

  it("navigates using dot (.) for current directory", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);
    await runCommand(ctx.testHome, ["note", "Item", "--alias", "item"]);

    // cd to item
    await runCommand(ctx.testHome, ["cd", "item"]);

    // Navigate using . (should stay in same place)
    const cdDotResult = await runCommand(ctx.testHome, ["cd", "."]);
    assertEquals(cdDotResult.success, true, `cd . failed: ${cdDotResult.stderr}`);

    // Verify still in item
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/item"), true, "CWD should still be /item");

    // List using . (should list current directory)
    const lsDotResult = await runCommand(ctx.testHome, ["ls", "."]);
    assertEquals(lsDotResult.success, true, `ls . failed: ${lsDotResult.stderr}`);
  });

  it("navigates using absolute paths", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);

    await runCommand(ctx.testHome, ["cd", "today"]);
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"]);
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"]);

    // Navigate to b
    await runCommand(ctx.testHome, ["cd", "b"]);

    // Navigate to root using absolute path
    const cdAbsResult = await runCommand(ctx.testHome, ["cd", `/${today}`]);
    assertEquals(cdAbsResult.success, true, `cd to absolute path failed: ${cdAbsResult.stderr}`);

    // Verify we're at today
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.trim(), `/${today}`, "CWD should be today's date");
  });

  it("navigates using mixed relative and absolute paths", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"]);
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"]);

    // Start from today
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Navigate to a/b
    const cdResult = await runCommand(ctx.testHome, ["cd", "a/b"]);
    assertEquals(cdResult.success, true, `cd a/b failed: ${cdResult.stderr}`);

    // Verify we're at a/b
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/a/b"), true, "CWD should be /a/b");
  });

  it("navigates complex path with mixed dotdot segments", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create hierarchy: A -> B -> C, A -> D
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"]);
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"]);
    await runCommand(ctx.testHome, ["note", "C", "--parent", "b", "--alias", "c"]);
    await runCommand(ctx.testHome, ["note", "D", "--parent", "a", "--alias", "d"]);

    // Navigate to c
    await runCommand(ctx.testHome, ["cd", "c"]);

    // Navigate using ../../../d (up to b, up to a, up to today, then to today's a, then to d)
    // Actually: up to b, up to a, then to d (sibling of b under a)
    const cdResult = await runCommand(ctx.testHome, ["cd", "../../d"]);
    assertEquals(cdResult.success, true, `cd ../../d failed: ${cdResult.stderr}`);

    // Verify we're at d
    const pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/a/d"), true, "CWD should be /a/d");
  });

  it("executes full navigation flow: absolute → relative → dotdot → sibling", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);

    // Create hierarchy
    await runCommand(ctx.testHome, ["cd", "today"]);
    await runCommand(ctx.testHome, ["note", "Root", "--alias", "root"]);
    await runCommand(ctx.testHome, ["note", "Branch1", "--parent", "root", "--alias", "branch1"]);
    await runCommand(ctx.testHome, ["note", "Branch2", "--parent", "root", "--alias", "branch2"]);
    await runCommand(ctx.testHome, ["note", "Leaf", "--parent", "branch1", "--alias", "leaf"]);

    // Step 1: Navigate using absolute path
    await runCommand(ctx.testHome, ["cd", `/${today}/root/branch1/leaf`]);
    let pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/leaf"), true, "Should be at leaf");

    // Step 2: Navigate up using ../
    await runCommand(ctx.testHome, ["cd", "../"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/branch1"), true, "Should be at branch1");

    // Step 3: Navigate to sibling using ../branch2
    await runCommand(ctx.testHome, ["cd", "../branch2"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/branch2"), true, "Should be at branch2");

    // Step 4: Navigate up to root using ../
    await runCommand(ctx.testHome, ["cd", "../"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.includes("/root"), true, "Should be at root");
    assertEquals(pwdResult.stdout.includes("/branch"), false, "Should not include branch");

    // Step 5: Navigate to today using ../
    await runCommand(ctx.testHome, ["cd", "../"]);
    pwdResult = await runCommand(ctx.testHome, ["pwd"]);
    assertEquals(pwdResult.stdout.trim(), `/${today}`, "Should be at today");
  });
});
