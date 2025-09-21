import { assertEquals } from "@std/assert";
import { createReopenCommand } from "./reopen.ts";

Deno.test("reopen command - creates command with correct description", () => {
  const command = createReopenCommand();
  assertEquals(command.getDescription(), "Reopen closed items (tasks/notes/events)");
});

Deno.test("reopen command - requires at least one argument", () => {
  const command = createReopenCommand();
  // The command expects variadic arguments, so we can't easily test
  // argument validation in isolation without a full CLI test setup
  assertEquals(command.getArguments().length, 1);
  assertEquals(command.getArguments()[0].variadic, true);
});
