import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { StateRepository } from "../../domain/repositories/state_repository.ts";
import { parsePath, Path } from "../../domain/primitives/mod.ts";

const STATE_FILE_NAME = ".state.json";

type StateSnapshot = Readonly<{
  readonly default_cwd?: string;
}>;

const readState = async (
  path: string,
): Promise<Result<StateSnapshot | undefined, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as StateSnapshot;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    if (error instanceof SyntaxError) {
      return Result.error(
        createRepositoryError("state", "load", "state file contains invalid JSON", {
          cause: error,
        }),
      );
    }
    return Result.error(
      createRepositoryError("state", "load", "failed to read state file", {
        cause: error,
      }),
    );
  }
};

const writeState = async (
  path: string,
  state: StateSnapshot,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      return Result.error(
        createRepositoryError("state", "save", "failed to prepare state directory", {
          cause: error,
        }),
      );
    }
  }

  try {
    const payload = JSON.stringify(state, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("state", "save", "failed to write state file", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemStateRepository = (
  options: Readonly<{ readonly workspaceRoot: string }>,
): StateRepository => {
  const statePath = join(options.workspaceRoot, STATE_FILE_NAME);

  const loadCwd = async (): Promise<Result<Path | undefined, RepositoryError>> => {
    const stateResult = await readState(statePath);
    if (stateResult.type === "error") {
      return stateResult;
    }

    const cwdString = stateResult.value?.default_cwd;
    if (!cwdString || cwdString.trim() === "") {
      return Result.ok(undefined);
    }

    const parsed = parsePath(cwdString);
    if (parsed.type === "error") {
      return Result.error(
        createRepositoryError("state", "load", "invalid cwd path in state file", {
          cause: parsed.error,
        }),
      );
    }

    return Result.ok(parsed.value);
  };

  const saveCwd = async (path: Path): Promise<Result<void, RepositoryError>> => {
    const stateResult = await readState(statePath);
    if (stateResult.type === "error") {
      return stateResult;
    }

    const nextState: StateSnapshot = { default_cwd: path.toString() };
    return await writeState(statePath, nextState);
  };

  return {
    loadCwd,
    saveCwd,
  };
};
