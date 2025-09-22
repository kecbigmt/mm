import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { ConfigRepository } from "../../domain/repositories/config_repository.ts";

const CONFIG_FILE_NAME = "config.json";

type ConfigSnapshot = Readonly<{
  readonly currentWorkspace?: string;
}>;

const readConfig = async (
  path: string,
): Promise<Result<ConfigSnapshot | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as ConfigSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("config", "load", "config file contains invalid JSON", {
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("config", "load", "failed to read config file", {
        cause: error,
      }),
    );
  }
};

const writeConfig = async (
  path: string,
  config: ConfigSnapshot,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      return Result.error(
        createRepositoryError("config", "save", "failed to prepare config directory", {
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
      createRepositoryError("config", "save", "failed to write config file", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemConfigRepository = (
  options: Readonly<{ readonly home: string }>,
): ConfigRepository => {
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

    const nextConfig: ConfigSnapshot = { currentWorkspace: name };
    return await writeConfig(configPath, nextConfig);
  };

  return {
    getCurrentWorkspace,
    setCurrentWorkspace,
  };
};
