import { Result } from "../../shared/result.ts";
import { RepositoryError } from "./repository_error.ts";

export interface ConfigRepository {
  getCurrentWorkspace(): Promise<Result<string | undefined, RepositoryError>>;
  setCurrentWorkspace(name: string): Promise<Result<void, RepositoryError>>;
}
