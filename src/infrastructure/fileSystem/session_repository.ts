import { dirname, join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { SessionData, SessionRepository } from "../../domain/repositories/session_repository.ts";

type SessionFileContent = Readonly<{
  workspace: string;
  cwd: string;
}>;

const readSessionFile = async (
  path: string,
): Promise<Result<SessionFileContent | null, RepositoryError>> => {
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as SessionFileContent;
    return Result.ok(data);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(null);
    }
    if (error instanceof SyntaxError) {
      // Treat corrupt session file as missing - fall back to today's date
      // This can happen if write was interrupted or file was manually edited
      console.error(`Warning: Session file at ${path} contains invalid JSON, ignoring.`);
      return Result.ok(null);
    }
    return Result.error(
      createRepositoryError("session", "load", "failed to read session file", {
        cause: error,
      }),
    );
  }
};

const writeSessionFile = async (
  path: string,
  data: SessionFileContent,
): Promise<Result<void, RepositoryError>> => {
  try {
    await Deno.mkdir(dirname(path), { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      return Result.error(
        createRepositoryError("session", "save", "failed to prepare session directory", {
          cause: error,
        }),
      );
    }
  }

  try {
    const payload = JSON.stringify(data, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("session", "save", "failed to write session file", {
        cause: error,
      }),
    );
  }
};

export type FileSessionRepositoryOptions = Readonly<{
  uid: number;
  ppid: number;
  baseDir?: string;
  getEnv?: (name: string) => string | undefined;
}>;

export const createFileSessionRepository = (
  options: FileSessionRepositoryOptions,
): SessionRepository => {
  const getEnv = options.getEnv ?? ((name: string) => Deno.env.get(name));
  // Allow overriding base directory via environment variable (for testing)
  const envBaseDir = getEnv("MM_SESSION_BASE_DIR");
  const baseDir = envBaseDir ?? options.baseDir ?? "/tmp/mm";
  const sessionPath = join(baseDir, String(options.uid), "sessions", `${options.ppid}.json`);

  return {
    async load(): Promise<Result<SessionData | null, RepositoryError>> {
      return await readSessionFile(sessionPath);
    },

    async save(data: SessionData): Promise<Result<void, RepositoryError>> {
      return await writeSessionFile(sessionPath, data);
    },
  };
};
