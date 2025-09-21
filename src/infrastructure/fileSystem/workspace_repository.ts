import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { parseWorkspaceSettings, WorkspaceSettings } from "../../domain/models/workspace.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";

export type FileSystemWorkspaceRepositoryDependencies = Readonly<{
  readonly root: string;
}>;

type WorkspaceSnapshot = Parameters<typeof parseWorkspaceSettings>[0];

type LoadResult = Result<WorkspaceSettings, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;

const workspaceFilePath = (root: string): string => join(root, "workspace.json");

const readWorkspaceSnapshot = async (
  path: string,
): Promise<Result<WorkspaceSnapshot, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as WorkspaceSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.error(
        createRepositoryError(
          "workspace",
          "load",
          "workspace settings file was not found",
          { cause: error },
        ),
      );
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError(
          "workspace",
          "load",
          "workspace settings file contains invalid JSON",
          { cause: error },
        ),
      );
    }
    return Result.error(
      createRepositoryError("workspace", "load", "failed to read workspace settings", {
        cause: error,
      }),
    );
  }
};

const writeWorkspaceSnapshot = async (
  path: string,
  snapshot: WorkspaceSnapshot,
): Promise<Result<void, RepositoryError>> => {
  try {
    const payload = JSON.stringify({ schema: "mm.workspace/1", ...snapshot }, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("workspace", "save", "failed to persist workspace settings", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemWorkspaceRepository = (
  dependencies: FileSystemWorkspaceRepositoryDependencies,
): WorkspaceRepository => {
  const path = workspaceFilePath(dependencies.root);

  const load = async (): Promise<LoadResult> => {
    const snapshotResult = await readWorkspaceSnapshot(path);
    if (snapshotResult.type === "error") {
      return snapshotResult;
    }
    const parsed = parseWorkspaceSettings(snapshotResult.value);
    if (parsed.type === "error") {
      return Result.error(
        createRepositoryError(
          "workspace",
          "load",
          "workspace settings are invalid",
          { cause: parsed.error },
        ),
      );
    }
    return Result.ok(parsed.value);
  };

  const save = async (settings: WorkspaceSettings): Promise<SaveResult> => {
    const snapshot = settings.toJSON();
    return await writeWorkspaceSnapshot(path, snapshot);
  };

  return {
    load,
    save,
  };
};
