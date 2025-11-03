/**
 * E2E Test Scenario 7: Item Status Change
 *
 * Purpose:
 *   Verify that item status changes (close, reopen) work correctly and that
 *   status changes are reflected in the metadata and listing output.
 *
 * Overview:
 *   This scenario tests item status lifecycle operations:
 *   - Create an item with `note` command
 *   - Verify item appears as open in `ls` output
 *   - Close the item with `close` command
 *   - Verify item status changes to closed (or filtered from listing)
 *   - Reopen the item with `reopen` command
 *   - Verify item status changes back to open
 *   - Confirm status changes are persisted in meta.json
 *
 * Design Reference:
 *   See docs/specs/001_redesign/design.md and e2e-test-scenarios.md
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  getLatestItemId,
  getTodayString,
  getWorkspacePath,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "./helpers.ts";

describe("Scenario 7: Item status change", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  it("creates item and shows it as open", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Task to complete",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const lsResult = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);
    assertEquals(
      lsResult.stdout.includes("Task to complete"),
      true,
      "Item should appear in listing",
    );
  });

  it("closes an item and updates status", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Task to complete",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace");

    const closeResult = await runCommand(ctx.testHome, ["close", itemId]);
    assertEquals(closeResult.success, true, `close failed: ${closeResult.stderr}`);
    assertEquals(
      closeResult.stdout.includes("Closed") || closeResult.stdout.includes("✅"),
      true,
      "Close command should succeed",
    );

    // Verify status in meta.json
    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = getTodayString();
    const [year, month, day] = today.split("-");
    const itemsBaseDir = join(workspaceDir, "items", year, month, day);
    const itemDir = join(itemsBaseDir, itemId);
    const metaJson = join(itemDir, "meta.json");
    const metaContent = await Deno.readTextFile(metaJson);
    const meta = JSON.parse(metaContent);

    assertEquals(meta.status, "closed", "Status should be closed in meta.json");
    assertExists(meta.closedAt, "closedAt should be set");
  });

  it("reopens a closed item and updates status", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Task to complete",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace");

    // Close the item first
    const closeResult = await runCommand(ctx.testHome, ["close", itemId]);
    assertEquals(closeResult.success, true, `close failed: ${closeResult.stderr}`);

    // Reopen the item
    const reopenResult = await runCommand(ctx.testHome, ["reopen", itemId]);
    assertEquals(reopenResult.success, true, `reopen failed: ${reopenResult.stderr}`);
    assertEquals(
      reopenResult.stdout.includes("Reopened") || reopenResult.stdout.includes("✅"),
      true,
      "Reopen command should succeed",
    );

    // Verify status in meta.json
    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = getTodayString();
    const [year, month, day] = today.split("-");
    const itemsBaseDir = join(workspaceDir, "items", year, month, day);
    const itemDir = join(itemsBaseDir, itemId);
    const metaJson = join(itemDir, "meta.json");
    const metaContent = await Deno.readTextFile(metaJson);
    const meta = JSON.parse(metaContent);

    assertEquals(meta.status, "open", "Status should be open in meta.json");
    assertEquals(meta.closedAt, undefined, "closedAt should be cleared");
  });

  it("executes full flow: create → close → reopen", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    // Create item
    const createResult = await runCommand(ctx.testHome, [
      "note",
      "Task to complete",
    ]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace");

    // Verify initial state is open
    const lsBeforeClose = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsBeforeClose.success, true, `ls failed: ${lsBeforeClose.stderr}`);
    assertEquals(
      lsBeforeClose.stdout.includes("Task to complete"),
      true,
      "Item should appear in listing before close",
    );

    // Close item
    const closeResult = await runCommand(ctx.testHome, ["close", itemId]);
    assertEquals(closeResult.success, true, `close failed: ${closeResult.stderr}`);

    // Verify status changed to closed in meta.json
    const workspaceDir = getWorkspacePath(ctx.testHome, "test-workspace");
    const today = getTodayString();
    const [year, month, day] = today.split("-");
    const itemsBaseDir = join(workspaceDir, "items", year, month, day);
    const itemDir = join(itemsBaseDir, itemId);
    const metaJsonAfterClose = join(itemDir, "meta.json");
    const metaAfterClose = JSON.parse(await Deno.readTextFile(metaJsonAfterClose));
    assertEquals(metaAfterClose.status, "closed", "Status should be closed");

    // Reopen item
    const reopenResult = await runCommand(ctx.testHome, ["reopen", itemId]);
    assertEquals(reopenResult.success, true, `reopen failed: ${reopenResult.stderr}`);

    // Verify status changed back to open in meta.json
    const metaAfterReopen = JSON.parse(await Deno.readTextFile(metaJsonAfterClose));
    assertEquals(metaAfterReopen.status, "open", "Status should be open after reopen");
    assertEquals(
      metaAfterReopen.closedAt,
      undefined,
      "closedAt should be cleared after reopen",
    );

    // Verify item appears in listing again
    const lsAfterReopen = await runCommand(ctx.testHome, ["ls"]);
    assertEquals(lsAfterReopen.success, true, `ls failed: ${lsAfterReopen.stderr}`);
    assertEquals(
      lsAfterReopen.stdout.includes("Task to complete"),
      true,
      "Item should appear in listing after reopen",
    );
  });

  it("handles closing already closed item (idempotent)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, ["note", "Test task"]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace");

    // Close first time
    const close1 = await runCommand(ctx.testHome, ["close", itemId]);
    assertEquals(close1.success, true, `First close should succeed`);

    // Close again (should be idempotent)
    const close2 = await runCommand(ctx.testHome, ["close", itemId]);
    assertEquals(close2.success, true, `Second close should succeed (idempotent)`);
  });

  it("handles reopening already open item (idempotent)", async () => {
    await runCommand(ctx.testHome, ["cd", "today"]);

    const createResult = await runCommand(ctx.testHome, ["note", "Test task"]);
    assertEquals(createResult.success, true, `Failed to create note: ${createResult.stderr}`);

    const itemId = await getLatestItemId(ctx.testHome, "test-workspace");

    // Reopen an already open item (should be idempotent)
    const reopenResult = await runCommand(ctx.testHome, ["reopen", itemId]);
    assertEquals(reopenResult.success, true, `Reopen should succeed (idempotent)`);
  });
});
