import { Result } from "../../shared/result.ts";
import {
  createVersionControlError,
  VersionControlError,
  VersionControlService,
} from "../../domain/services/version_control_service.ts";

export const createGitVersionControlService = (): VersionControlService => {
  const safeExecute = async (
    cmd: string,
    args: string[],
    cwd: string,
    errorPrefix: string,
  ): Promise<Result<void, VersionControlError>> => {
    try {
      const command = new Deno.Command(cmd, {
        args,
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code !== 0) {
        const outStr = new TextDecoder().decode(stdout);
        const errStr = new TextDecoder().decode(stderr);
        return Result.error(createVersionControlError(`${errorPrefix}: ${outStr} ${errStr}`));
      }
      return Result.ok(undefined);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlError("Git is not installed or not in the PATH"));
      }
      return Result.error(createVersionControlError(`${errorPrefix}: ${error}`, { cause: error }));
    }
  };

  const init = (cwd: string) => safeExecute("git", ["init"], cwd, "git init failed");

  const setRemote = async (
    cwd: string,
    name: string,
    url: string,
    options?: { force?: boolean },
  ): Promise<Result<void, VersionControlError>> => {
    // 1. Check if remote exists by listing remotes first
    // This avoids parsing "No such remote" error message which can be localized
    try {
      const command = new Deno.Command("git", {
        args: ["remote"],
        cwd,
        stderr: "piped",
        stdout: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code !== 0) {
        return Result.error(
          createVersionControlError(
            `git remote list failed: ${new TextDecoder().decode(stderr)}`,
          ),
        );
      }

      const remotes = new TextDecoder().decode(stdout).split("\n").map((r) => r.trim()).filter(
        Boolean,
      );
      const remoteExists = remotes.includes(name);

      if (remoteExists) {
        // 2. If remote exists, check URL
        const getUrlCmd = new Deno.Command("git", {
          args: ["remote", "get-url", name],
          cwd,
          stdout: "piped",
          stderr: "piped",
        });
        const getUrlOutput = await getUrlCmd.output();
        if (getUrlOutput.code !== 0) {
          return Result.error(
            createVersionControlError(
              `git remote get-url failed: ${new TextDecoder().decode(getUrlOutput.stderr)}`,
            ),
          );
        }

        const existingUrl = new TextDecoder().decode(getUrlOutput.stdout).trim();
        if (existingUrl === url) {
          return Result.ok(undefined); // Idempotent
        }

        if (!options?.force) {
          return Result.error(
            createVersionControlError(
              `Remote '${name}' already exists with different URL: '${existingUrl}'. Expected: '${url}'. Use --force to overwrite.`,
            ),
          );
        }

        // Force overwrite
        return safeExecute(
          "git",
          ["remote", "set-url", name, url],
          cwd,
          "git remote set-url failed",
        );
      }

      // 3. If remote does not exist, add it
      return safeExecute("git", ["remote", "add", name, url], cwd, "git remote add failed");
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlError("Git is not installed or not in the PATH"));
      }
      return Result.error(
        createVersionControlError(`git remote operation failed: ${error}`, { cause: error }),
      );
    }
  };

  const stage = (cwd: string, paths: string[]) =>
    safeExecute("git", ["add", ...paths], cwd, "git add failed");

  const commit = (cwd: string, message: string) =>
    safeExecute("git", ["commit", "-m", message], cwd, "git commit failed");

  const validateBranchName = async (
    cwd: string,
    branch: string,
  ): Promise<Result<void, VersionControlError>> => {
    try {
      const command = new Deno.Command("git", {
        args: ["check-ref-format", "--branch", branch],
        cwd,
        stderr: "piped",
      });
      const { code, stderr } = await command.output();
      const stderrStr = new TextDecoder().decode(stderr);
      if (code === 0) {
        return Result.ok(undefined);
      }
      if (
        code === 1 ||
        stderrStr.includes("not a valid branch name")
      ) {
        // Exit code 1 or explicit error message means invalid ref format
        return Result.error(createVersionControlError("Invalid branch name"));
      }
      // Any other exit code is a system/git error
      return Result.error(
        createVersionControlError(
          `git check-ref-format failed: ${stderrStr}`,
        ),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlError("Git is not installed or not in the PATH"));
      }
      return Result.error(
        createVersionControlError(`git check-ref-format failed: ${error}`, { cause: error }),
      );
    }
  };

  return {
    init,
    setRemote,
    stage,
    commit,
    validateBranchName,
  };
};
