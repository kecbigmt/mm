import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";

type WorkspaceConfig = Readonly<{
  readonly currentWorkspace?: string;
}>;

export type WorkspaceConfigRepository = Readonly<{
  getCurrentWorkspace(): Promise<Result<string | undefined, RepositoryError>>;
  setCurrentWorkspace(name: string): Promise<Result<void, RepositoryError>>;
}>;

const CONFIG_FILE_NAME = "config.json";

const readConfig = async (
  path: string,
): Promise<Result<WorkspaceConfig | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as WorkspaceConfig;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("workspace", "load", "workspace config contains invalid JSON", {
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("workspace", "load", "failed to read workspace config", {
        cause: error,
      }),
    );
  }
};

const writeConfig = async (
  path: string,
  config: WorkspaceConfig,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      return Result.error(
        createRepositoryError("workspace", "save", "failed to prepare workspace config directory", {
          cause: error,
        }),
      );
    }
  }

  try {
    const payload = JSON.stringify(config, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("workspace", "save", "failed to write workspace config", {
        cause: error,
      }),
    );
  }
};

export const createWorkspaceConfigRepository = (
  options: Readonly<{ readonly home: string }>,
): WorkspaceConfigRepository => {
  const configPath = join(options.home, CONFIG_FILE_NAME);

  const getCurrentWorkspace = async (): Promise<Result<string | undefined, RepositoryError>> => {
    const configResult = await readConfig(configPath);
    if (configResult.type === "error") {
      return configResult;
    }
    return Result.ok(configResult.value?.currentWorkspace);
  };

  const setCurrentWorkspace = async (
    name: string,
  ): Promise<Result<void, RepositoryError>> => {
    const configResult = await readConfig(configPath);
    if (configResult.type === "error") {
      return configResult;
    }

    const nextConfig: WorkspaceConfig = { currentWorkspace: name };
    return await writeConfig(configPath, nextConfig);
  };

  return {
    getCurrentWorkspace,
    setCurrentWorkspace,
  };
};
