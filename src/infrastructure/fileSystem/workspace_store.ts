import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createWorkspaceSettings, WorkspaceSettings } from "../../domain/models/workspace.ts";
import {
  parseTimezoneIdentifier,
  TimezoneIdentifier,
  TimezoneIdentifierValidationError,
} from "../../domain/primitives/timezone_identifier.ts";
import { WorkspaceName, workspaceNameFromString } from "../../domain/primitives/workspace_name.ts";
import { createFileSystemWorkspaceRepository } from "./workspace_repository.ts";

const WORKSPACES_DIR = "workspaces" as const;

export type WorkspaceStoreDependencies = Readonly<{
  readonly home: string;
}>;

export type WorkspaceStore = Readonly<{
  list(): Promise<Result<WorkspaceName[], RepositoryError>>;
  exists(name: WorkspaceName): Promise<Result<boolean, RepositoryError>>;
  create(
    name: WorkspaceName,
    timezone: TimezoneIdentifier,
  ): Promise<Result<void, RepositoryError>>;
  pathFor(name: WorkspaceName): string;
}>;

const workspaceDirectory = (home: string, name: WorkspaceName): string =>
  join(home, WORKSPACES_DIR, name.toString());

const ensureWorkspaceStructure = async (
  path: string,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(path, { recursive: true });
    await Deno.mkdir(join(path, "nodes"), { recursive: true });
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("workspace", "ensure", "failed to prepare workspace directories", {
        cause: error,
      }),
    );
  }
};

const createSettings = (
  timezone: TimezoneIdentifier,
): WorkspaceSettings => createWorkspaceSettings({ timezone });

export const createWorkspaceStore = (
  dependencies: WorkspaceStoreDependencies,
): WorkspaceStore => {
  const list = async (): Promise<Result<WorkspaceName[], RepositoryError>> => {
    const base = join(dependencies.home, WORKSPACES_DIR);
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

  const exists = async (
    name: WorkspaceName,
  ): Promise<Result<boolean, RepositoryError>> => {
    try {
      const path = workspaceDirectory(dependencies.home, name);
      const stat = await Deno.stat(path);
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

  const createWorkspace = async (
    name: WorkspaceName,
    timezone: TimezoneIdentifier,
  ): Promise<Result<void, RepositoryError>> => {
    const path = workspaceDirectory(dependencies.home, name);
    const ensureResult = await ensureWorkspaceStructure(path);
    if (ensureResult.type === "error") {
      return ensureResult;
    }

    const repository = createFileSystemWorkspaceRepository({ root: path });
    const settings = createSettings(timezone);
    return await repository.save(settings);
  };

  const pathFor = (name: WorkspaceName): string => workspaceDirectory(dependencies.home, name);

  return {
    list,
    exists,
    create: createWorkspace,
    pathFor,
  };
};

export const resolveWorkspaceTimezone = (
  input?: string,
): Result<TimezoneIdentifier, TimezoneIdentifierValidationError> => {
  const timezone = typeof input === "string" && input.trim().length > 0
    ? input.trim()
    : Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  return parseTimezoneIdentifier(timezone);
};
