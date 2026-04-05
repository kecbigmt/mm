import { Result } from "../../shared/result.ts";
import { BaseError } from "../../shared/errors.ts";
import {
  VersionControlError,
  VersionControlService,
} from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { WorkspaceName } from "../../domain/primitives/workspace_name.ts";

export type WorkspaceAlreadyExistsError = BaseError<"WorkspaceAlreadyExistsError">;

export type InitRemoteWorkspaceError =
  | WorkspaceAlreadyExistsError
  | VersionControlError
  | RepositoryError;

export type InitRemoteWorkspaceRequest = Readonly<{
  workspaceName: WorkspaceName;
  remoteUrl: string;
  branch?: string;
}>;

export type ConfigRepository = Readonly<{
  getCurrentWorkspace(): Promise<Result<string | undefined, RepositoryError>>;
  setCurrentWorkspace(name: string): Promise<Result<void, RepositoryError>>;
}>;

export type InitRemoteWorkspaceDeps = Readonly<{
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
  configRepository: ConfigRepository;
  removeDirectory: (path: string) => Promise<void>;
}>;

export type InitRemoteWorkspaceResponse = Readonly<{
  workspacePath: string;
}>;

export const initRemoteWorkspace = async (
  input: InitRemoteWorkspaceRequest,
  deps: InitRemoteWorkspaceDeps,
): Promise<Result<InitRemoteWorkspaceResponse, InitRemoteWorkspaceError>> => {
  // 1. Check if workspace already exists
  const existsResult = await deps.workspaceRepository.exists(input.workspaceName);
  if (existsResult.type === "error") {
    return Result.error(existsResult.error);
  }
  if (existsResult.value) {
    const name = input.workspaceName.toString();
    return Result.error({
      kind: "WorkspaceAlreadyExistsError",
      message: `Workspace '${name}' already exists.`,
      cause: undefined,
      toString: () => `WorkspaceAlreadyExistsError: Workspace '${name}' already exists.`,
    });
  }

  // 2. Get target path
  const workspacePath = deps.workspaceRepository.pathFor(input.workspaceName);

  // 3. Clone repository
  const cloneResult = await deps.gitService.clone(
    input.remoteUrl,
    workspacePath,
    input.branch ? { branch: input.branch } : undefined,
  );

  if (cloneResult.type === "error") {
    try {
      await deps.removeDirectory(workspacePath);
    } catch {
      // Ignore cleanup errors
    }
    return Result.error(cloneResult.error);
  }

  // 4. Set as current workspace
  const setCurrentResult = await deps.configRepository.setCurrentWorkspace(
    input.workspaceName.toString(),
  );
  if (setCurrentResult.type === "error") {
    return Result.error(setCurrentResult.error);
  }

  return Result.ok(
    Object.freeze({ workspacePath }),
  );
};
