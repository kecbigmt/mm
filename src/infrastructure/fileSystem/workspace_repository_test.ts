import { assertEquals } from "@std/assert";
import { createFileSystemWorkspaceRepository } from "./workspace_repository.ts";
import { workspaceNameFromString } from "../../domain/primitives/workspace_name.ts";
import { parseTimezoneIdentifier } from "../../domain/primitives/timezone_identifier.ts";

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
  name: "workspace repository creates and loads workspaces",
  permissions: { read: true, write: true },
  async fn() {
    const home = await Deno.makeTempDir({ prefix: "mm-workspace-repo-" });
    try {
      const repository = createFileSystemWorkspaceRepository({ home });
      const name = unwrapOk(workspaceNameFromString("home"), "parse workspace name");
      const timezone = unwrapOk(parseTimezoneIdentifier("UTC"), "parse timezone");

      const createResult = await repository.create(name, timezone);
      unwrapOk(createResult, "create workspace");

      const path = repository.pathFor(name);
      const loadResult = await repository.load(path);
      const settings = unwrapOk(loadResult, "load workspace");
      assertEquals(settings.data.timezone.toString(), "UTC");
    } finally {
      await Deno.remove(home, { recursive: true });
    }
  },
});

Deno.test({
  name: "workspace repository lists existing workspaces",
  permissions: { read: true, write: true },
  async fn() {
    const home = await Deno.makeTempDir({ prefix: "mm-workspace-list-" });
    try {
      const repository = createFileSystemWorkspaceRepository({ home });
      const alpha = unwrapOk(workspaceNameFromString("alpha"), "parse alpha name");
      const beta = unwrapOk(workspaceNameFromString("beta"), "parse beta name");
      const timezone = unwrapOk(parseTimezoneIdentifier("UTC"), "parse timezone");

      unwrapOk(await repository.create(alpha, timezone), "create alpha");
      unwrapOk(await repository.create(beta, timezone), "create beta");

      const listResult = await repository.list();
      const workspaces = unwrapOk(listResult, "list workspaces");
      const names = workspaces.map((workspace) => workspace.toString());
      assertEquals(names, ["alpha", "beta"]);

      const existsAlpha = unwrapOk(await repository.exists(alpha), "exists alpha");
      const existsGamma = unwrapOk(
        await repository.exists(unwrapOk(workspaceNameFromString("gamma"), "gamma")),
        "exists gamma",
      );
      assertEquals(existsAlpha, true);
      assertEquals(existsGamma, false);
    } finally {
      await Deno.remove(home, { recursive: true });
    }
  },
});

Deno.test({
  name: "workspace repository reports missing workspace file",
  permissions: { read: true, write: true },
  async fn() {
    const home = await Deno.makeTempDir({ prefix: "mm-workspace-missing-" });
    try {
      const repository = createFileSystemWorkspaceRepository({ home });
      const name = unwrapOk(workspaceNameFromString("missing"), "parse name");
      const path = repository.pathFor(name);

      const loadResult = await repository.load(path);
      assertEquals(loadResult.type, "error");
    } finally {
      await Deno.remove(home, { recursive: true });
    }
  },
});
