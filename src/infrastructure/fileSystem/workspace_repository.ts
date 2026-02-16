import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError, WorkspaceRepository } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import {
  createWorkspaceSettings,
  DEFAULT_SYNC_SETTINGS,
  parseWorkspaceSettings,
  WorkspaceSettings,
} from "../../domain/models/workspace.ts";
import { CURRENT_WORKSPACE_SCHEMA } from "../../domain/models/workspace_schema.ts";
import { WorkspaceName, workspaceNameFromString } from "../../domain/primitives/workspace_name.ts";
import { TimezoneIdentifier } from "../../domain/primitives/timezone_identifier.ts";
import { profileAsync, profileSync } from "../../shared/profiler.ts";

export type FileSystemWorkspaceRepositoryDependencies = Readonly<{
  readonly home: string;
}>;

type WorkspaceSnapshot = Parameters<typeof parseWorkspaceSettings>[0];

type LoadResult = Result<WorkspaceSettings, RepositoryError>;
type SaveResult = Result<void, RepositoryError>;

type ListResult = Result<ReadonlyArray<WorkspaceName>, RepositoryError>;
type ExistsResult = Result<boolean, RepositoryError>;
type CreateResult = Result<void, RepositoryError>;

const workspacesDir = (home: string): string => join(home, "workspaces");
const workspaceRootPath = (home: string, name: WorkspaceName): string =>
  join(workspacesDir(home), name.toString());
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
    const payload = JSON.stringify({ schema: CURRENT_WORKSPACE_SCHEMA, ...snapshot }, null, 2);
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

const ensureWorkspaceStructure = async (
  root: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Promise.all([
      Deno.mkdir(root, { recursive: true }),
      Deno.mkdir(join(root, "items"), { recursive: true }),
      Deno.mkdir(join(root, ".index", "aliases"), { recursive: true }),
      Deno.mkdir(join(root, "tags"), { recursive: true }),
    ]);
    return Result.ok(undefined);
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("workspace", "ensure", "failed to prepare workspace directories", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemWorkspaceRepository = (
  dependencies: FileSystemWorkspaceRepositoryDependencies,
): WorkspaceRepository => {
  const load = async (root: string): Promise<LoadResult> => {
    const snapshotResult = await profileAsync(
      "workspace:readSnapshot",
      () => readWorkspaceSnapshot(workspaceFilePath(root)),
    );
    if (snapshotResult.type === "error") {
      return snapshotResult;
    }
    const parsed = profileSync(
      "workspace:parseSettings",
      () => parseWorkspaceSettings(snapshotResult.value),
    );
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

  const save = async (
    root: string,
    settings: WorkspaceSettings,
  ): Promise<SaveResult> => {
    const snapshot = settings.toJSON();
    return await writeWorkspaceSnapshot(workspaceFilePath(root), snapshot);
  };

  const list = async (): Promise<ListResult> => {
    const base = workspacesDir(dependencies.home);
    try {
      const names: WorkspaceName[] = [];
      for await (const entry of Deno.readDir(base)) {
        if (!entry.isDirectory) {
          continue;
        }
        const parsed = workspaceNameFromString(entry.name);
        if (parsed.type === "ok") {
          names.push(parsed.value);
        }
      }
      names.sort((a, b) => a.toString().localeCompare(b.toString()));
      return Result.ok(names);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.ok([]);
      }
      return Result.error(
        createRepositoryError("workspace", "list", "failed to list workspaces", {
          cause: error,
        }),
      );
    }
  };

  const exists = async (name: WorkspaceName): Promise<ExistsResult> => {
    try {
      const stat = await Deno.stat(workspaceRootPath(dependencies.home, name));
      return Result.ok(stat.isDirectory);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.ok(false);
      }
      return Result.error(
        createRepositoryError("workspace", "load", "failed to inspect workspace", {
          identifier: name.toString(),
          cause: error,
        }),
      );
    }
  };

  const create = async (
    name: WorkspaceName,
    timezone: TimezoneIdentifier,
  ): Promise<CreateResult> => {
    const root = workspaceRootPath(dependencies.home, name);
    const ensureResult = await ensureWorkspaceStructure(root);
    if (ensureResult.type === "error") {
      return ensureResult;
    }

    const settings = createWorkspaceSettings({ timezone, sync: DEFAULT_SYNC_SETTINGS });
    return save(root, settings);
  };

  const pathFor = (name: WorkspaceName): string => workspaceRootPath(dependencies.home, name);

  return {
    load,
    save,
    list,
    exists,
    create,
    pathFor,
  };
};
