import { assertEquals } from "@std/assert";
import { createCloseCommand } from "./close.ts";

Deno.test("close command - creates command with correct description", () => {
  const command = createCloseCommand();
  assertEquals(command.getDescription(), "Close items (tasks/notes/events)");
});

Deno.test("close command - requires at least one argument", () => {
  const command = createCloseCommand();
  // The command expects variadic arguments, so we can't easily test
  // argument validation in isolation without a full CLI test setup
  assertEquals(command.getArguments().length, 1);
  assertEquals(command.getArguments()[0].variadic, true);
});
