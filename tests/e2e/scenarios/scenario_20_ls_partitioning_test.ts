/**
 * E2E Test Scenario 20: List Partitioning & Formatting
 *
 * Purpose:
 *   Verify that the ls command correctly partitions items by date,
 *   formats output with headers and icons, handles pager/print modes,
 *   and emits appropriate warnings for edge cases.
 *
 * Covers:
 *   - Default listing (today-7d..today+7d)
 *   - Item-head range listing with section stubs
 *   - --print mode output format
 *   - CWD listing (mm ls .)
 *
 * Design Reference:
 *   See docs/specs/004_list/design.md
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  addDaysToString,
  cleanupTestEnvironment,
  getCurrentDateFromCli,
  initWorkspace,
  runCommand,
  setupTestEnvironment,
  type TestContext,
} from "../helpers.ts";

describe("Scenario 20: List partitioning and formatting", () => {
  let ctx: TestContext;
  let today: string;

  beforeEach(async () => {
    ctx = await setupTestEnvironment();
    await initWorkspace(ctx.testHome, "test-workspace");
    today = await getCurrentDateFromCli(ctx.testHome);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("Default listing (today-7d..today+7d)", () => {
    it("shows date headers with items grouped by date", async () => {
      // Create items on different dates within the default window
      const yesterday = addDaysToString(today, -1);
      const tomorrow = addDaysToString(today, 1);

      await runCommand(ctx.testHome, ["cd", yesterday]);
      await runCommand(ctx.testHome, ["note", "Yesterday's note"]);

      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Today's note"]);

      await runCommand(ctx.testHome, ["cd", tomorrow]);
      await runCommand(ctx.testHome, ["note", "Tomorrow's note"]);

      // Run ls without arguments (default range)
      const lsResult = await runCommand(ctx.testHome, ["ls", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      const output = lsResult.stdout;

      // Should show items with note icon
      assertStringIncludes(output, "Yesterday's note", "Should include yesterday's note");
      assertStringIncludes(output, "Today's note", "Should include today's note");
      assertStringIncludes(output, "Tomorrow's note", "Should include tomorrow's note");

      // Should include note Bullet Journal symbol (- for open notes)
      assertStringIncludes(output, "- ", "Should include note symbol");
    });

    it("shows relative date labels (today, tomorrow, yesterday)", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "A note for today"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should include relative label "today"
      assertStringIncludes(lsResult.stdout, "today", "Should include 'today' relative label");
    });

    it("shows (empty) when no items exist in default range", async () => {
      // Create an item far outside the default range
      const farPast = addDaysToString(today, -30);
      await runCommand(ctx.testHome, ["cd", farPast]);
      await runCommand(ctx.testHome, ["note", "Old note"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      assertEquals(lsResult.stdout.trim(), "(empty)", "Should show (empty) for no items");
    });
  });

  describe("Print mode (--print)", () => {
    it("--print mode shows ISO date column and plain icons", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Test note"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--print"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Print mode should include date column
      assertStringIncludes(lsResult.stdout, today, "Should include ISO date in print mode");

      // Print mode should use plain text icon
      assertStringIncludes(lsResult.stdout, "[note]", "Should include plain text note icon");
    });

    it("--print mode does not include color codes", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Color test"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--print"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should not include ANSI escape codes
      assertEquals(
        lsResult.stdout.includes("\x1b["),
        false,
        "Should not include ANSI escape codes in print mode",
      );
    });
  });

  describe("CWD listing (mm ls .)", () => {
    it("lists only items at current working directory", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Today's item"]);

      const yesterday = addDaysToString(today, -1);
      await runCommand(ctx.testHome, ["cd", yesterday]);
      await runCommand(ctx.testHome, ["note", "Yesterday's item"]);

      // Go back to today
      await runCommand(ctx.testHome, ["cd", today]);

      // ls . should only show today's items
      const lsResult = await runCommand(ctx.testHome, ["ls", ".", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      assertStringIncludes(lsResult.stdout, "Today's item", "Should include today's item");
      assertEquals(
        lsResult.stdout.includes("Yesterday's item"),
        false,
        "Should not include yesterday's item when listing .",
      );
    });

    it("shows (empty) when current directory has no items", async () => {
      // Create item on a different date
      const yesterday = addDaysToString(today, -1);
      await runCommand(ctx.testHome, ["cd", yesterday]);
      await runCommand(ctx.testHome, ["note", "An item"]);

      // Go to today (empty)
      await runCommand(ctx.testHome, ["cd", today]);

      const lsResult = await runCommand(ctx.testHome, ["ls", ".", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      assertEquals(lsResult.stdout.trim(), "(empty)", "Should show (empty) for empty directory");
    });
  });

  describe("Item-head range with section stubs", () => {
    it("shows items under item-head sections", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      // Create parent item
      await runCommand(ctx.testHome, ["note", "Book notes", "-a", "book"]);

      // Create items in sections
      await runCommand(ctx.testHome, ["cd", "book/1"]);
      await runCommand(ctx.testHome, ["note", "Chapter 1 notes"]);

      await runCommand(ctx.testHome, ["cd", "book/2"]);
      await runCommand(ctx.testHome, ["note", "Chapter 2 notes"]);

      // List the range book/1..2
      const lsResult = await runCommand(ctx.testHome, ["ls", "book/1..2", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should show items from both sections
      assertStringIncludes(lsResult.stdout, "Chapter 1 notes", "Should include Chapter 1 notes");
      assertStringIncludes(lsResult.stdout, "Chapter 2 notes", "Should include Chapter 2 notes");
    });

    it("omits empty sections in range", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Book", "-a", "book"]);

      // Create items only in section 1 and 3, not 2
      await runCommand(ctx.testHome, ["cd", "book/1"]);
      await runCommand(ctx.testHome, ["note", "Section 1"]);

      await runCommand(ctx.testHome, ["cd", "book/3"]);
      await runCommand(ctx.testHome, ["note", "Section 3"]);

      // List range 1..3
      const lsResult = await runCommand(ctx.testHome, ["ls", "book/1..3", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should show sections 1 and 3
      assertStringIncludes(lsResult.stdout, "Section 1", "Should include Section 1");
      assertStringIncludes(lsResult.stdout, "Section 3", "Should include Section 3");

      // Section 2 header should not appear since it's empty
      assertEquals(
        lsResult.stdout.includes("[book/2]"),
        false,
        "Should not include empty section header",
      );
    });

    it("shows section headers with alias when available", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Book", "-a", "book"]);

      await runCommand(ctx.testHome, ["cd", "book/1"]);
      await runCommand(ctx.testHome, ["note", "Chapter 1"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", "book/1", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should show section header with alias
      assertStringIncludes(lsResult.stdout, "[book/1]", "Should show header with alias");
    });
  });

  describe("Task and event type filtering", () => {
    it("filters by type using --type task", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "A note"]);
      await runCommand(ctx.testHome, ["task", "A task"]);

      // Filter by task type
      const lsResult = await runCommand(ctx.testHome, ["ls", today, "-t", "task", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should only show task item
      assertEquals(
        lsResult.stdout.includes("A note"),
        false,
        "Should not include note when filtering by task",
      );
      assertStringIncludes(lsResult.stdout, "A task", "Should include task");
    });

    it("shows task with task icon", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["task", "A task item"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should show task Bullet Journal symbol (• for open tasks)
      assertStringIncludes(lsResult.stdout, "• ", "Should show task symbol");
    });

    it("shows event under date head with event icon", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["event", "Meeting at 10am"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should show event Bullet Journal symbol (○ for open events)
      assertStringIncludes(lsResult.stdout, "○ ", "Should show event symbol");
      assertStringIncludes(lsResult.stdout, "Meeting at 10am", "Should include event title");
    });

    it("--all --print shows all items with plain text icons", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["task", "Open task", "-a", "task1"]);
      await runCommand(ctx.testHome, ["task", "Closed task", "-a", "task2"]);
      await runCommand(ctx.testHome, ["close", "task2"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--all", "--print"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Print mode should use plain text icons
      assertStringIncludes(lsResult.stdout, "[task]", "Should show [task] icon");
      assertStringIncludes(
        lsResult.stdout,
        "[task:done]",
        "Should show [task:done] icon for closed task",
      );
      assertStringIncludes(lsResult.stdout, "Open task", "Should include open task");
      assertStringIncludes(lsResult.stdout, "Closed task", "Should include closed task");
    });
  });

  describe("Item-head event handling", () => {
    it("omits events placed under item-head and emits warning", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Book", "-a", "book"]);

      // Create items under item-head section
      await runCommand(ctx.testHome, ["cd", "book/1"]);
      await runCommand(ctx.testHome, ["note", "Chapter note"]);
      // Create event under item-head section (using edit since event command places under date head)
      await runCommand(ctx.testHome, ["note", "Chapter event", "-a", "evt1"]);
      await runCommand(ctx.testHome, ["edit", "evt1", "--icon", "event"]);

      // List the item-head section
      const lsResult = await runCommand(ctx.testHome, ["ls", "book/1", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Should show the note but not the event (omitted)
      assertStringIncludes(lsResult.stdout, "Chapter note", "Should include chapter note");
      assertEquals(
        lsResult.stdout.includes("Chapter event"),
        false,
        "Should not include event under item-head",
      );

      // Should emit warning to stderr
      assertStringIncludes(
        lsResult.stderr,
        "skipped",
        "Should emit warning about skipped events",
      );
    });
  });

  describe("Closed items filtering", () => {
    it("filters out closed items by default", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Open note", "-a", "open-note"]);
      await runCommand(ctx.testHome, ["note", "Closed note", "-a", "closed-note"]);

      // Close the second note
      await runCommand(ctx.testHome, ["close", "closed-note"]);

      // Default listing should not show closed items
      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      assertStringIncludes(lsResult.stdout, "Open note", "Should include open note");
      assertEquals(
        lsResult.stdout.includes("Closed note"),
        false,
        "Should not include closed note by default",
      );
    });

    it("shows closed items with --all flag", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Open note", "-a", "open-note"]);
      await runCommand(ctx.testHome, ["note", "Closed note", "-a", "closed-note"]);

      // Close the second note
      await runCommand(ctx.testHome, ["close", "closed-note"]);

      // --all should include closed items
      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--all", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      assertStringIncludes(lsResult.stdout, "Open note", "Should include open note");
      assertStringIncludes(lsResult.stdout, "Closed note", "Should include closed note with --all");
    });

    it("shows closed note with different icon", async () => {
      await runCommand(ctx.testHome, ["cd", today]);
      await runCommand(ctx.testHome, ["note", "Closed note", "-a", "closed-note"]);
      await runCommand(ctx.testHome, ["close", "closed-note"]);

      const lsResult = await runCommand(ctx.testHome, ["ls", today, "--all", "--no-pager"]);
      assertEquals(lsResult.success, true, `ls failed: ${lsResult.stderr}`);

      // Closed note should show × symbol (Bullet Journal style)
      assertStringIncludes(lsResult.stdout, "× ", "Should show closed symbol");
    });
  });
});
