import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { WorkspaceName } from "../primitives/workspace_name.ts";
import { BaseError } from "../../shared/errors.ts";

export type WorkspaceAlreadyExistsError = BaseError<"WorkspaceAlreadyExistsError">;

export type WorkspaceInitRemoteError =
  | WorkspaceAlreadyExistsError
  | VersionControlError
  | RepositoryError;

export type WorkspaceInitRemoteInput = {
  workspaceName: WorkspaceName;
  remoteUrl: string;
  branch?: string;
};

export type ConfigRepository = {
  getCurrentWorkspace(): Promise<Result<string | undefined, RepositoryError>>;
  setCurrentWorkspace(name: string): Promise<Result<void, RepositoryError>>;
};

export type WorkspaceInitRemoteDependencies = {
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
  configRepository: ConfigRepository;
  removeDirectory: (path: string) => Promise<void>;
};

export type WorkspaceInitRemoteResult = {
  workspacePath: string;
};

export const WorkspaceInitRemoteWorkflow = {
  execute: async (
    input: WorkspaceInitRemoteInput,
    deps: WorkspaceInitRemoteDependencies,
  ): Promise<Result<WorkspaceInitRemoteResult, WorkspaceInitRemoteError>> => {
    // 1. Check if workspace already exists
    const existsResult = await deps.workspaceRepository.exists(input.workspaceName);
    if (existsResult.type === "error") {
      return Result.error(existsResult.error);
    }
    if (existsResult.value) {
      return Result.error({
        kind: "WorkspaceAlreadyExistsError",
        message: `Workspace '${input.workspaceName.toString()}' already exists.`,
        cause: undefined,
        toString: () =>
          `WorkspaceAlreadyExistsError: Workspace '${input.workspaceName.toString()}' already exists.`,
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
      // Cleanup on failure
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

    return Result.ok({
      workspacePath,
    });
  },
};
