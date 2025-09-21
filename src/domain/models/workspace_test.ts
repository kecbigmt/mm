import { Result } from "../../shared/result.ts";
import { timezoneIdentifierFromString } from "../primitives/mod.ts";
import { createWorkspaceSettings, parseWorkspaceSettings } from "./workspace.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const expectOk = <T, E>(result: Result<T, E>): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseWorkspaceSettings validates timezone", () => {
  const okResult = parseWorkspaceSettings({ timezone: "Asia/Tokyo" });

  if (okResult.type !== "ok") {
    throw new Error(`expected ok result, got error: ${JSON.stringify(okResult.error)}`);
  }

  const settings = okResult.value;
  assertEquals(settings.kind, "WorkspaceSettings");
  assertEquals(settings.data.timezone.toString(), "Asia/Tokyo");
  assertEquals(settings.toJSON().timezone, "Asia/Tokyo");

  const errorResult = parseWorkspaceSettings({ timezone: "Unknown/Zone" });
  if (errorResult.type !== "error") {
    throw new Error("expected error result");
  }

  assertEquals(errorResult.error.issues[0].path[0], "timezone");
});

Deno.test("createWorkspaceSettings preserves timezone identifier", () => {
  const timezone = expectOk(timezoneIdentifierFromString("Europe/London"));
  const settings = createWorkspaceSettings({ timezone });
  assertEquals(settings.data.timezone, timezone);
  assertEquals(settings.toJSON().timezone, "Europe/London");
});
