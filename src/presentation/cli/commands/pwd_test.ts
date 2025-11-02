import { assertEquals } from "@std/assert";
import { createPwdCommand } from "./pwd.ts";

Deno.test("pwd command - has correct description", () => {
  const command = createPwdCommand();
  assertEquals(command.getDescription(), "Print current working directory");
});

Deno.test("pwd command - accepts no arguments", () => {
  const command = createPwdCommand();
  const args = command.getArguments();
  assertEquals(args.length, 0);
});

