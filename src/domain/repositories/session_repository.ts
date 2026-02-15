import { Result } from "../../shared/result.ts";
import { RepositoryError } from "./repository_error.ts";

export type SessionData = Readonly<{
  workspace: string;
  cwd: string;
  previousCwd?: string;
}>;

export interface SessionRepository {
  load(): Promise<Result<SessionData | null, RepositoryError>>;
  save(data: SessionData): Promise<Result<void, RepositoryError>>;
}
