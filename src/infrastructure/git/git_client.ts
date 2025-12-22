import { Result } from "../../shared/result.ts";
import {
  createVersionControlCommandFailedError,
  createVersionControlNotAvailableError,
  createVersionControlNotInitializedError,
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
        return Result.error(
          createVersionControlCommandFailedError(`${errorPrefix}: ${outStr} ${errStr}`),
        );
      }
      return Result.ok(undefined);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`${errorPrefix}: ${error}`, { cause: error }),
      );
    }
  };

  const clone = async (
    url: string,
    targetPath: string,
    options?: { branch?: string },
  ): Promise<Result<void, VersionControlError>> => {
    const args = ["clone"];
    if (options?.branch) {
      args.push("--branch", options.branch);
    }
    args.push(url, targetPath);

    try {
      const command = new Deno.Command("git", {
        args,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code !== 0) {
        const outStr = new TextDecoder().decode(stdout);
        const errStr = new TextDecoder().decode(stderr);
        return Result.error(
          createVersionControlCommandFailedError(`git clone failed: ${outStr} ${errStr}`),
        );
      }
      return Result.ok(undefined);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git clone failed: ${error}`, { cause: error }),
      );
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
          createVersionControlCommandFailedError(
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
            createVersionControlCommandFailedError(
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
            createVersionControlCommandFailedError(
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
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git remote operation failed: ${error}`, {
          cause: error,
        }),
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
        return Result.error(createVersionControlCommandFailedError("Invalid branch name"));
      }
      // Any other exit code is a system/git error
      return Result.error(
        createVersionControlCommandFailedError(
          `git check-ref-format failed: ${stderrStr}`,
        ),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git check-ref-format failed: ${error}`, {
          cause: error,
        }),
      );
    }
  };

  const push = async (
    cwd: string,
    remote: string,
    branch: string,
    options?: { force?: boolean; setUpstream?: boolean },
  ): Promise<Result<string, VersionControlError>> => {
    const args = ["push"];
    if (options?.setUpstream) {
      args.push("--set-upstream");
    }
    args.push(remote, branch);
    if (options?.force) {
      args.push("--force");
    }
    try {
      const command = new Deno.Command("git", {
        args,
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      const outStr = new TextDecoder().decode(stdout);
      const errStr = new TextDecoder().decode(stderr);

      if (code !== 0) {
        return Result.error(
          createVersionControlCommandFailedError(`git push failed: ${outStr} ${errStr}`),
        );
      }
      // Git pushはstderrにメッセージを出力することがある
      return Result.ok(errStr || outStr);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git push failed: ${error}`, { cause: error }),
      );
    }
  };

  const getCurrentBranch = async (cwd: string): Promise<Result<string, VersionControlError>> => {
    try {
      // Use symbolic-ref to get branch name even before first commit
      const command = new Deno.Command("git", {
        args: ["symbolic-ref", "--short", "HEAD"],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code !== 0) {
        const errStr = new TextDecoder().decode(stderr);
        return Result.error(
          createVersionControlCommandFailedError(`git symbolic-ref failed: ${errStr}`),
        );
      }
      const branch = new TextDecoder().decode(stdout).trim();
      return Result.ok(branch);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git symbolic-ref failed: ${error}`, {
          cause: error,
        }),
      );
    }
  };

  const checkoutBranch = async (
    cwd: string,
    branch: string,
    create: boolean,
  ): Promise<Result<void, VersionControlError>> => {
    try {
      // Check if branch exists
      const checkCommand = new Deno.Command("git", {
        args: ["rev-parse", "--verify", branch],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code } = await checkCommand.output();
      const branchExists = code === 0;

      if (branchExists) {
        // Branch exists, checkout
        return safeExecute("git", ["checkout", branch], cwd, "git checkout failed");
      } else {
        // Branch doesn't exist
        if (create) {
          // Create and checkout new branch
          return safeExecute("git", ["checkout", "-b", branch], cwd, "git checkout -b failed");
        } else {
          return Result.error(
            createVersionControlCommandFailedError(
              `Branch '${branch}' does not exist and create flag is false`,
            ),
          );
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git checkout failed: ${error}`, { cause: error }),
      );
    }
  };

  const pull = async (
    cwd: string,
    remote: string,
    branch: string,
  ): Promise<Result<string, VersionControlError>> => {
    try {
      const command = new Deno.Command("git", {
        args: ["pull", "--rebase", remote, branch],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      const outStr = new TextDecoder().decode(stdout).trim();
      const errStr = new TextDecoder().decode(stderr).trim();

      if (code !== 0) {
        const errorMessage = [outStr, errStr].filter(Boolean).join("\n");
        return Result.error(
          createVersionControlCommandFailedError(errorMessage),
        );
      }
      // Git pull outputs progress to stderr and result to stdout
      // Combine both to show complete output
      const output = errStr.trim() && outStr.trim()
        ? `${errStr.trim()}\n${outStr.trim()}`
        : (errStr || outStr);
      return Result.ok(output);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(String(error), { cause: error }),
      );
    }
  };

  const hasUncommittedChanges = async (
    cwd: string,
  ): Promise<Result<boolean, VersionControlError>> => {
    try {
      const command = new Deno.Command("git", {
        args: ["status", "--porcelain"],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code !== 0) {
        const errStr = new TextDecoder().decode(stderr);
        // Check if it's a "not a git repository" error
        if (errStr.includes("not a git repository")) {
          return Result.error(createVersionControlNotInitializedError());
        }
        return Result.error(createVersionControlCommandFailedError(`git status failed: ${errStr}`));
      }
      const output = new TextDecoder().decode(stdout);
      // Filter out untracked files (lines starting with "??")
      // Only tracked modified/staged files count as uncommitted changes
      const trackedChanges = output
        .split("\n")
        .filter((line) => line.trim() !== "")
        .filter((line) => !line.startsWith("??"));
      return Result.ok(trackedChanges.length > 0);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git status failed: ${error}`, { cause: error }),
      );
    }
  };

  const getRemoteDefaultBranch = async (
    cwd: string,
    remote: string,
  ): Promise<Result<string, VersionControlError>> => {
    try {
      // Resolve remote URL/path to remote name
      // The remote can be a URL (https://..., git@...), a path (/tmp/repo, ../repo.git), or a remote name (origin)
      let remoteName = remote;

      // List all remotes and try to find a match
      const remoteListCommand = new Deno.Command("git", {
        args: ["remote", "-v"],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const listOutput = await remoteListCommand.output();
      if (listOutput.code === 0) {
        const remotes = new TextDecoder().decode(listOutput.stdout);
        // Parse lines like: "origin  https://github.com/user/repo.git (fetch)"
        // or: "local  /tmp/repo (fetch)"
        for (const line of remotes.split("\n")) {
          const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
          if (match && match[2] === remote) {
            remoteName = match[1];
            break;
          }
        }
      }

      // First, fetch to update remote refs
      const fetchCommand = new Deno.Command("git", {
        args: ["fetch", remoteName],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const fetchOutput = await fetchCommand.output();
      if (fetchOutput.code !== 0) {
        const errStr = new TextDecoder().decode(fetchOutput.stderr);
        return Result.error(createVersionControlCommandFailedError(`git fetch failed: ${errStr}`));
      }

      // Get remote HEAD using symbolic-ref
      const command = new Deno.Command("git", {
        args: ["symbolic-ref", `refs/remotes/${remoteName}/HEAD`],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code !== 0) {
        const errStr = new TextDecoder().decode(stderr);
        return Result.error(
          createVersionControlCommandFailedError(
            `Failed to resolve remote default branch: ${errStr}`,
          ),
        );
      }
      const symbolicRef = new TextDecoder().decode(stdout).trim();
      // symbolicRef format: "refs/remotes/origin/main" -> extract "main"
      const branchMatch = symbolicRef.match(/^refs\/remotes\/[^/]+\/(.+)$/);
      if (!branchMatch) {
        return Result.error(
          createVersionControlCommandFailedError(
            `Invalid symbolic-ref format: ${symbolicRef}`,
          ),
        );
      }
      return Result.ok(branchMatch[1]);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`Failed to get remote default branch: ${error}`, {
          cause: error,
        }),
      );
    }
  };

  const hasChangesInPath = async (
    cwd: string,
    fromRef: string,
    toRef: string,
    path: string,
  ): Promise<Result<boolean, VersionControlError>> => {
    try {
      const command = new Deno.Command("git", {
        args: ["diff", "--quiet", fromRef, toRef, "--", path],
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stderr } = await command.output();

      // Exit code 0: No changes
      // Exit code 1: Changes detected
      // Other exit codes: Error
      if (code === 0) {
        return Result.ok(false);
      }
      if (code === 1) {
        return Result.ok(true);
      }

      const errStr = new TextDecoder().decode(stderr);
      return Result.error(
        createVersionControlCommandFailedError(`git diff failed: ${errStr}`),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.error(createVersionControlNotAvailableError());
      }
      return Result.error(
        createVersionControlCommandFailedError(`git diff failed: ${error}`, { cause: error }),
      );
    }
  };

  return {
    clone,
    init,
    setRemote,
    stage,
    commit,
    validateBranchName,
    push,
    pull,
    getCurrentBranch,
    checkoutBranch,
    hasUncommittedChanges,
    getRemoteDefaultBranch,
    hasChangesInPath,
  };
};
