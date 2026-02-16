import { Result } from "../../shared/result.ts";
import { RepositoryError } from "./repository_error.ts";
import { SessionData, SessionRepository } from "./session_repository.ts";

export const createFakeSessionRepository = (
  initialData: SessionData | null = null,
): SessionRepository & { getData: () => SessionData | null } => {
  let data: SessionData | null = initialData;

  return {
    load(): Promise<Result<SessionData | null, RepositoryError>> {
      return Promise.resolve(Result.ok(data));
    },

    save(newData: SessionData): Promise<Result<void, RepositoryError>> {
      data = newData;
      return Promise.resolve(Result.ok(undefined));
    },

    getData(): SessionData | null {
      return data;
    },
  };
};
