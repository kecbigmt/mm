import { assert, assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { createFileSystemWorkspaceRepository } from "./workspace_repository.ts";
import { parseWorkspaceSettings } from "../../domain/models/workspace.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test({
  name: "workspace repository persists settings",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-workspace-" });
    try {
      const repository = createFileSystemWorkspaceRepository({ root });
      const settings = unwrapOk(
        parseWorkspaceSettings({ timezone: "Asia/Tokyo" }),
        "parse workspace settings",
      );

      const saveResult = await repository.save(settings);
      unwrapOk(saveResult, "save workspace settings");

      const loadResult = await repository.load();
      const loaded = unwrapOk(loadResult, "load workspace settings");

      assert(loaded.data.timezone.equals(settings.data.timezone), "timezone mismatch");

      const workspaceFile = join(root, "workspace.json");
      const persisted = JSON.parse(await Deno.readTextFile(workspaceFile));
      assertEquals(persisted.schema, "mm.workspace/1");
      assertEquals(persisted.timezone, "Asia/Tokyo");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "workspace repository returns error when file is missing",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-workspace-missing-" });
    try {
      const repository = createFileSystemWorkspaceRepository({ root });
      const result = await repository.load();
      if (result.type !== "error") {
        throw new Error("expected error when workspace file is missing");
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
