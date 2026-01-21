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
  runCd,
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
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create hierarchy: A -> B -> C
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"], { mmCwd: cdToday.mmCwd! });
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "C", "--parent", "b", "--alias", "c"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to c
    let cdResult = await runCd(ctx.testHome, "c", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdResult.success, true, `cd c failed: ${cdResult.stderr}`);

    // Verify pwd is c
    let pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("/a/b/c"), true, "CWD should be /a/b/c");

    // Navigate up to b using ../
    const cdUpResult = await runCd(ctx.testHome, "../", { mmCwd: cdResult.mmCwd! });
    assertEquals(cdUpResult.success, true, `cd ../ failed: ${cdUpResult.stderr}`);

    // Verify pwd is b
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdUpResult.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("/a/b"), true, "CWD should be /a/b");
    assertEquals(pwdResult.stdout.includes("/c"), false, "CWD should not include /c");

    // Navigate up to a using ../../ (from c)
    cdResult = await runCd(ctx.testHome, "c", { mmCwd: cdUpResult.mmCwd! });
    assertEquals(cdResult.success, true, `cd c failed: ${cdResult.stderr}`);
    const cdUp2Result = await runCd(ctx.testHome, "../../", { mmCwd: cdResult.mmCwd! });
    assertEquals(cdUp2Result.success, true, `cd ../../ failed: ${cdUp2Result.stderr}`);

    // Verify pwd is a
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdUp2Result.mmCwd! });
    assertEquals(pwdResult.success, true, `pwd failed: ${pwdResult.stderr}`);
    assertEquals(pwdResult.stdout.includes("/a"), true, "CWD should be /a");
    assertEquals(pwdResult.stdout.includes("/b"), false, "CWD should not include /b");
  });

  it("navigates up from sections to parent items using dotdot", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create item with sections
    await runCommand(ctx.testHome, ["note", "Chapter", "--alias", "chapter"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Page 1", "--parent", "chapter/1"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to chapter/1
    const cdSection = await runCd(ctx.testHome, "chapter/1", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdSection.success, true, `cd chapter/1 failed: ${cdSection.stderr}`);

    // Verify we're in section 1
    let pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdSection.mmCwd! });
    assertEquals(pwdResult.stdout.includes("chapter/1"), true, "CWD should be chapter/1");

    // Navigate up using ../
    const cdUpResult = await runCd(ctx.testHome, "../", { mmCwd: cdSection.mmCwd! });
    assertEquals(cdUpResult.success, true, `cd ../ from section failed: ${cdUpResult.stderr}`);

    // Verify we're back to chapter (section removed)
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdUpResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/chapter"), true, "CWD should be /chapter");
    assertEquals(pwdResult.stdout.includes("/1"), false, "CWD should not include section /1");
  });

  it("lists parent items using dotdot (ls ../)", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create hierarchy: Parent -> Child1, Child2, Grandchild
    await runCommand(ctx.testHome, ["note", "Parent", "--alias", "parent"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Child1", "--parent", "parent"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Child2", "--parent", "parent"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, [
      "note",
      "Grandchild",
      "--parent",
      "parent",
      "--alias",
      "grandchild",
    ], { mmCwd: cdToday.mmCwd! });

    // Navigate to grandchild
    const cdGrandchild = await runCd(ctx.testHome, "grandchild", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdGrandchild.success, true, `cd grandchild failed: ${cdGrandchild.stderr}`);

    // List parent directory (should show siblings: Child1, Child2, Grandchild)
    const lsParentResult = await runCommand(ctx.testHome, ["ls", "../"], {
      mmCwd: cdGrandchild.mmCwd!,
    });
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
    const lsGrandparentResult = await runCommand(ctx.testHome, ["ls", "../../"], {
      mmCwd: cdGrandchild.mmCwd!,
    });
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
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);
    await runCommand(ctx.testHome, ["note", "Item", "--alias", "item"], { mmCwd: cdToday.mmCwd! });

    // cd to item
    const cdItem = await runCd(ctx.testHome, "item", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdItem.success, true, `cd item failed: ${cdItem.stderr}`);

    // Navigate using . (should stay in same place)
    const cdDotResult = await runCd(ctx.testHome, ".", { mmCwd: cdItem.mmCwd! });
    assertEquals(cdDotResult.success, true, `cd . failed: ${cdDotResult.stderr}`);

    // Verify still in item
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdDotResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/item"), true, "CWD should still be /item");

    // List using . (should list current directory)
    const lsDotResult = await runCommand(ctx.testHome, ["ls", "."], { mmCwd: cdDotResult.mmCwd! });
    assertEquals(lsDotResult.success, true, `ls . failed: ${lsDotResult.stderr}`);
  });

  it("navigates using absolute paths", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);

    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"], { mmCwd: cdToday.mmCwd! });
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to b
    const cdB = await runCd(ctx.testHome, "b", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdB.success, true, `cd b failed: ${cdB.stderr}`);

    // Navigate to root using absolute path
    const cdAbsResult = await runCd(ctx.testHome, `/${today}`, { mmCwd: cdB.mmCwd! });
    assertEquals(cdAbsResult.success, true, `cd to absolute path failed: ${cdAbsResult.stderr}`);

    // Verify we're at today
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdAbsResult.mmCwd! });
    assertEquals(pwdResult.stdout.trim(), `/${today}`, "CWD should be today's date");
  });

  it("navigates using mixed relative and absolute paths", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"], { mmCwd: cdToday.mmCwd! });
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to a/b
    const cdResult = await runCd(ctx.testHome, "a/b", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdResult.success, true, `cd a/b failed: ${cdResult.stderr}`);

    // Verify we're at a/b
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/a/b"), true, "CWD should be /a/b");
  });

  it("navigates complex path with mixed dotdot segments", async () => {
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, `cd today failed: ${cdToday.stderr}`);

    // Create hierarchy: A -> B -> C, A -> D
    await runCommand(ctx.testHome, ["note", "A", "--alias", "a"], { mmCwd: cdToday.mmCwd! });
    await runCommand(ctx.testHome, ["note", "B", "--parent", "a", "--alias", "b"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "C", "--parent", "b", "--alias", "c"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "D", "--parent", "a", "--alias", "d"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Navigate to c
    const cdC = await runCd(ctx.testHome, "c", { mmCwd: cdToday.mmCwd! });
    assertEquals(cdC.success, true, `cd c failed: ${cdC.stderr}`);

    // Navigate using ../../../d (up to b, up to a, up to today, then to today's a, then to d)
    // Actually: up to b, up to a, then to d (sibling of b under a)
    const cdResult = await runCd(ctx.testHome, "../../d", { mmCwd: cdC.mmCwd! });
    assertEquals(cdResult.success, true, `cd ../../d failed: ${cdResult.stderr}`);

    // Verify we're at d
    const pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/a/d"), true, "CWD should be /a/d");
  });

  it("executes full navigation flow: absolute → relative → dotdot → sibling", async () => {
    const today = await getCurrentDateFromCli(ctx.testHome);

    // Create hierarchy
    const cdToday = await runCd(ctx.testHome, "today");
    assertEquals(cdToday.success, true, "cd today should succeed");
    await runCommand(ctx.testHome, ["note", "Root", "--alias", "root"], { mmCwd: cdToday.mmCwd! });
    await runCommand(ctx.testHome, ["note", "Branch1", "--parent", "root", "--alias", "branch1"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Branch2", "--parent", "root", "--alias", "branch2"], {
      mmCwd: cdToday.mmCwd!,
    });
    await runCommand(ctx.testHome, ["note", "Leaf", "--parent", "branch1", "--alias", "leaf"], {
      mmCwd: cdToday.mmCwd!,
    });

    // Step 1: Navigate using absolute path
    let cdResult = await runCd(ctx.testHome, `/${today}/root/branch1/leaf`, {
      mmCwd: cdToday.mmCwd!,
    });
    assertEquals(cdResult.success, true, "cd to absolute path should succeed");
    let pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/leaf"), true, "Should be at leaf");

    // Step 2: Navigate up using ../
    cdResult = await runCd(ctx.testHome, "../", { mmCwd: cdResult.mmCwd! });
    assertEquals(cdResult.success, true, "cd ../ should succeed");
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/branch1"), true, "Should be at branch1");

    // Step 3: Navigate to sibling using ../branch2
    cdResult = await runCd(ctx.testHome, "../branch2", { mmCwd: cdResult.mmCwd! });
    assertEquals(cdResult.success, true, "cd ../branch2 should succeed");
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/branch2"), true, "Should be at branch2");

    // Step 4: Navigate up to root using ../
    cdResult = await runCd(ctx.testHome, "../", { mmCwd: cdResult.mmCwd! });
    assertEquals(cdResult.success, true, "cd ../ should succeed");
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.includes("/root"), true, "Should be at root");
    assertEquals(pwdResult.stdout.includes("/branch"), false, "Should not include branch");

    // Step 5: Navigate to today using ../
    cdResult = await runCd(ctx.testHome, "../", { mmCwd: cdResult.mmCwd! });
    assertEquals(cdResult.success, true, "cd ../ should succeed");
    pwdResult = await runCommand(ctx.testHome, ["pwd"], { mmCwd: cdResult.mmCwd! });
    assertEquals(pwdResult.stdout.trim(), `/${today}`, "Should be at today");
  });
});
