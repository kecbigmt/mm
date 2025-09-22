import { assert, assertEquals } from "@std/assert";
import { parseWorkspaceName, workspaceNameFromString } from "./workspace_name.ts";

Deno.test("parseWorkspaceName accepts valid names", () => {
  const result = parseWorkspaceName("home");
  assert(result.type === "ok");
  assertEquals(result.value.toString(), "home");
});

Deno.test("parseWorkspaceName rejects uppercase characters", () => {
  const result = parseWorkspaceName("Home");
  assertEquals(result.type, "error");
});

Deno.test("parseWorkspaceName rejects empty strings", () => {
  const result = parseWorkspaceName("");
  assertEquals(result.type, "error");
});

Deno.test("workspaceNameFromString trims and validates", () => {
  const result = workspaceNameFromString("  project-1  ");
  assert(result.type === "ok");
  assertEquals(result.value.toString(), "project-1");
});
