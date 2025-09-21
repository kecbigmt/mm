import { Result } from "../../shared/result.ts";
import { WorkspaceSettings } from "../models/workspace.ts";
import { RepositoryError } from "./repository_error.ts";
import { WorkspaceName } from "../primitives/workspace_name.ts";
import { TimezoneIdentifier } from "../primitives/timezone_identifier.ts";

export interface WorkspaceRepository {
  load(root: string): Promise<Result<WorkspaceSettings, RepositoryError>>;
  save(root: string, settings: WorkspaceSettings): Promise<Result<void, RepositoryError>>;
  list(): Promise<Result<ReadonlyArray<WorkspaceName>, RepositoryError>>;
  exists(name: WorkspaceName): Promise<Result<boolean, RepositoryError>>;
  create(
    name: WorkspaceName,
    timezone: TimezoneIdentifier,
  ): Promise<Result<void, RepositoryError>>;
  pathFor(name: WorkspaceName): string;
}
