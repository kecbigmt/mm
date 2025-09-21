import { Result } from "../../shared/result.ts";
import { WorkspaceSettings } from "../models/workspace.ts";
import { RepositoryError } from "./repository_error.ts";

export interface WorkspaceRepository {
  load(): Promise<Result<WorkspaceSettings, RepositoryError>>;
  save(settings: WorkspaceSettings): Promise<Result<void, RepositoryError>>;
}
