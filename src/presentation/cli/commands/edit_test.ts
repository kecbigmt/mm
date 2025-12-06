import { assertEquals } from "@std/assert";
import { createEditCommand } from "./edit.ts";

Deno.test("Edit command - should have correct structure", () => {
  const command = createEditCommand();

  assertEquals(command.getDescription(), "Edit an item");
  assertEquals(command.getArguments()[0]?.name, "id");
  assertEquals(command.getArguments()[0]?.type, "string");

  const options = command.getOptions();

  assertEquals(!!options.find((opt) => opt.flags.includes("--title")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--icon")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--body")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--start-at")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--duration")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--due-at")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--alias")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--context")), true);
  assertEquals(!!options.find((opt) => opt.flags.includes("--workspace")), true);
});

Deno.test("Edit command - should have title option", () => {
  const command = createEditCommand();
  const options = command.getOptions();

  const titleOption = options.find((opt) => opt.flags.includes("--title"));
  assertEquals(titleOption?.flags.includes("--title"), true);
  assertEquals(titleOption?.description, "Update title");
});

Deno.test("Edit command - should have icon option", () => {
  const command = createEditCommand();
  const options = command.getOptions();

  const iconOption = options.find((opt) => opt.flags.includes("--icon"));
  assertEquals(iconOption?.flags.includes("--icon"), true);
  assertEquals(iconOption?.description, "Update icon");
});

Deno.test("Edit command - should have body option", () => {
  const command = createEditCommand();
  const options = command.getOptions();

  const bodyOption = options.find((opt) => opt.flags.includes("--body"));
  assertEquals(bodyOption?.flags.includes("--body"), true);
  assertEquals(bodyOption?.description, "Update body");
});

Deno.test("Edit command - should have scheduling options", () => {
  const command = createEditCommand();
  const options = command.getOptions();

  const startAtOption = options.find((opt) => opt.flags.includes("--start-at"));
  assertEquals(startAtOption?.flags.includes("--start-at"), true);
  assertEquals(startAtOption?.description, "Update start time (ISO8601 format)");

  const durationOption = options.find((opt) => opt.flags.includes("--duration"));
  assertEquals(durationOption?.flags.includes("--duration"), true);
  assertEquals(durationOption?.description, "Update duration (e.g., 30m, 2h)");

  const dueAtOption = options.find((opt) => opt.flags.includes("--due-at"));
  assertEquals(dueAtOption?.flags.includes("--due-at"), true);
  assertEquals(dueAtOption?.description, "Update due date (ISO8601 format)");
});

Deno.test("Edit command - should have metadata options", () => {
  const command = createEditCommand();
  const options = command.getOptions();

  const aliasOption = options.find((opt) => opt.flags.includes("--alias"));
  assertEquals(aliasOption?.flags.includes("--alias"), true);
  assertEquals(aliasOption?.description, "Update alias");

  const contextOption = options.find((opt) => opt.flags.includes("--context"));
  assertEquals(contextOption?.flags.includes("--context"), true);
  assertEquals(contextOption?.flags.includes("-c"), true);
  assertEquals(contextOption?.description, "Update context tag");
});
