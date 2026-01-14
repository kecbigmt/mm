/**
 * E2E Test: Auto-creation of Project/Context Topics
 *
 * Purpose:
 *   Verify that --project and --context options automatically create permanent topic
 *   Items when the referenced alias doesn't exist.
 *
 * Overview:
 *   This scenario tests:
 *   - Auto-creation of topic when --project references non-existent alias
 *   - Auto-creation of topics when --context references non-existent aliases
 *   - Auto-creation during mm edit command
 *   - User notification messages for auto-created topics
 *   - Mixed scenarios: some aliases exist, some don't
 *   - Topic icon (topic) for auto-created items
 *
 * Design Reference:
 *   See docs/stories/20260102_permanent-notes-project-context/20260114T104511_auto-create-project-contexts.story.md
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  cleanupTestEnvironment,
  extractItemLines,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("E2E: Auto-creation of Project/Context Topics", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("Auto-creation on Item Creation", () => {
    it("auto-creates topic when --project references non-existent alias", async () => {
      // Create a note with a non-existent project alias
      const result = await runCommand(ctx.testHome, [
        "note",
        "Test Note",
        "--project",
        "new-project",
      ]);

      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);
      // Should show notification about auto-created topic
      assertEquals(
        result.stdout.includes("Created topic: new-project"),
        true,
        `Should show auto-creation message. Got: ${result.stdout}`,
      );
      assertEquals(result.stdout.includes("Created note"), true);
    });

    it("auto-creates multiple topics when --context references non-existent aliases", async () => {
      const result = await runCommand(ctx.testHome, [
        "task",
        "Test Task",
        "--context",
        "ctx-one",
        "--context",
        "ctx-two",
      ]);

      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      // Should show notification for each auto-created topic
      assertEquals(
        result.stdout.includes("Created topic: ctx-one"),
        true,
        `Should show auto-creation message for ctx-one. Got: ${result.stdout}`,
      );
      assertEquals(
        result.stdout.includes("Created topic: ctx-two"),
        true,
        `Should show auto-creation message for ctx-two. Got: ${result.stdout}`,
      );
    });

    it("auto-created topics have correct properties (icon: topic, placement: permanent)", async () => {
      // Create a note with a non-existent project alias
      await runCommand(ctx.testHome, [
        "note",
        "Test Note",
        "--project",
        "auto-project",
      ]);

      // Check the auto-created topic via mm show
      const showResult = await runCommand(ctx.testHome, ["show", "auto-project"]);
      assertEquals(showResult.success, true, `Failed to show topic: ${showResult.stderr}`);

      // Verify icon is topic (displayed as "topic:open" in show output)
      assertEquals(
        showResult.stdout.includes("topic:open"),
        true,
        `Topic should have topic:open icon. Got: ${showResult.stdout}`,
      );

      // Verify the title is the alias
      assertEquals(
        showResult.stdout.includes("auto-project"),
        true,
        `Topic title should be the alias. Got: ${showResult.stdout}`,
      );

      // Verify it's in permanent placement by listing permanent items
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true);
      assertEquals(
        lsResult.stdout.includes("auto-project"),
        true,
        `Topic should be in permanent list. Got: ${lsResult.stdout}`,
      );
    });

    it("auto-created topics are visible in mm ls permanent", async () => {
      // Create a task with auto-created contexts
      await runCommand(ctx.testHome, [
        "task",
        "Test Task",
        "--context",
        "home",
        "--context",
        "computer",
      ]);

      // List permanent items
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      assertEquals(lsResult.success, true, `Failed to list permanent: ${lsResult.stderr}`);

      const itemLines = extractItemLines(lsResult.stdout);
      // Should have 2 auto-created topics
      assertEquals(
        itemLines.length >= 2,
        true,
        `Should have at least 2 topics. Got: ${itemLines.length}`,
      );

      // Find the topic lines (they should have the aliases as titles)
      const homeTopicLine = itemLines.find((line) => line.includes("home"));
      const computerTopicLine = itemLines.find((line) => line.includes("computer"));
      assertEquals(homeTopicLine !== undefined, true, "Should find 'home' topic");
      assertEquals(computerTopicLine !== undefined, true, "Should find 'computer' topic");
    });
  });

  describe("Auto-creation on Item Edit", () => {
    it("auto-creates topic when mm edit --context references non-existent alias", async () => {
      // First create a note without context
      await runCommand(ctx.testHome, [
        "note",
        "Edit Test",
        "-a",
        "edit-test",
      ]);

      // Edit to add a non-existent context
      const editResult = await runCommand(ctx.testHome, [
        "edit",
        "edit-test",
        "--context",
        "new-context",
      ]);

      assertEquals(editResult.success, true, `Failed to edit: ${editResult.stderr}`);
      // Should show notification about auto-created topic
      assertEquals(
        editResult.stdout.includes("Created topic: new-context"),
        true,
        `Should show auto-creation message. Got: ${editResult.stdout}`,
      );
    });

    it("auto-creates topic when mm edit --project references non-existent alias", async () => {
      // First create a note without project
      await runCommand(ctx.testHome, [
        "note",
        "Project Edit Test",
        "-a",
        "proj-edit-test",
      ]);

      // Edit to add a non-existent project
      const editResult = await runCommand(ctx.testHome, [
        "edit",
        "proj-edit-test",
        "--project",
        "new-proj",
      ]);

      assertEquals(editResult.success, true, `Failed to edit: ${editResult.stderr}`);
      // Should show notification about auto-created topic
      assertEquals(
        editResult.stdout.includes("Created topic: new-proj"),
        true,
        `Should show auto-creation message. Got: ${editResult.stdout}`,
      );
    });
  });

  describe("Mixed Existing and New Aliases", () => {
    it("reuses existing alias and auto-creates only new ones", async () => {
      // First create an existing context topic
      const createExistingResult = await runCommand(ctx.testHome, [
        "note",
        "Existing Context",
        "--placement",
        "permanent",
        "--alias",
        "existing-ctx",
      ]);
      assertEquals(createExistingResult.success, true);

      // Create a task with both existing and new contexts
      const result = await runCommand(ctx.testHome, [
        "task",
        "Mixed Test",
        "--context",
        "existing-ctx",
        "--context",
        "new-ctx",
      ]);

      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      // Should only show notification for the new context
      assertEquals(
        result.stdout.includes("Created topic: new-ctx"),
        true,
        `Should show auto-creation message for new-ctx. Got: ${result.stdout}`,
      );
      assertEquals(
        result.stdout.includes("Created topic: existing-ctx"),
        false,
        `Should NOT show auto-creation message for existing-ctx. Got: ${result.stdout}`,
      );
    });

    it("no auto-creation message when all aliases exist", async () => {
      // First create existing project and context topics
      await runCommand(ctx.testHome, [
        "note",
        "Existing Project",
        "--placement",
        "permanent",
        "--alias",
        "existing-proj",
      ]);
      await runCommand(ctx.testHome, [
        "note",
        "Existing Context",
        "--placement",
        "permanent",
        "--alias",
        "existing-ctx",
      ]);

      // Create a note with existing project and context
      const result = await runCommand(ctx.testHome, [
        "note",
        "Existing Only Test",
        "--project",
        "existing-proj",
        "--context",
        "existing-ctx",
      ]);

      assertEquals(result.success, true, `Failed to create note: ${result.stderr}`);
      // Should NOT show any auto-creation messages
      assertEquals(
        result.stdout.includes("Created topic:"),
        false,
        `Should NOT show any auto-creation messages. Got: ${result.stdout}`,
      );
    });
  });

  describe("Topic Icon Display", () => {
    it("auto-created topics display with topic icon in ls permanent", async () => {
      // Create a task with auto-created project
      await runCommand(ctx.testHome, [
        "task",
        "Icon Test Task",
        "--project",
        "icon-test-project",
      ]);

      // List permanent items with --print for machine-readable output
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent", "--print"]);
      assertEquals(lsResult.success, true, `Failed to list permanent: ${lsResult.stderr}`);

      // Check for topic icon in output (in print mode it shows [topic])
      assertEquals(
        lsResult.stdout.includes("[topic]"),
        true,
        `Should display [topic] icon. Got: ${lsResult.stdout}`,
      );
    });
  });

  describe("Edge Cases", () => {
    it("handles duplicate context aliases in same command (creates only once)", async () => {
      // Create a task with the same context twice
      const result = await runCommand(ctx.testHome, [
        "task",
        "Duplicate Test",
        "--context",
        "dup-ctx",
        "--context",
        "dup-ctx",
      ]);

      assertEquals(result.success, true, `Failed to create task: ${result.stderr}`);
      // Should only show one auto-creation message
      const matches = result.stdout.match(/Created topic: dup-ctx/g);
      assertEquals(
        matches?.length,
        1,
        `Should show exactly one auto-creation message. Got: ${result.stdout}`,
      );

      // Verify only one topic was created
      const lsResult = await runCommand(ctx.testHome, ["ls", "permanent"]);
      const itemLines = extractItemLines(lsResult.stdout);
      const dupCtxLines = itemLines.filter((line) => line.includes("dup-ctx"));
      assertEquals(dupCtxLines.length, 1, "Should have exactly one dup-ctx topic");
    });
  });
});
