import { assertEquals } from "@std/assert";
import { Result } from "../../shared/result.ts";
import { WorkspaceInitRemoteInput, WorkspaceInitRemoteWorkflow } from "./workspace_init_remote.ts";
import { VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { WorkspaceName, workspaceNameFromString } from "../primitives/workspace_name.ts";
import { createRepositoryError } from "../repositories/repository_error.ts";

const createMockGitService = (
  overrides: Partial<VersionControlService> = {},
): VersionControlService => ({
  clone: () => Promise.resolve(Result.ok(undefined)),
  init: () => Promise.resolve(Result.ok(undefined)),
  setRemote: () => Promise.resolve(Result.ok(undefined)),
  stage: () => Promise.resolve(Result.ok(undefined)),
  commit: () => Promise.resolve(Result.ok(undefined)),
  validateBranchName: () => Promise.resolve(Result.ok(undefined)),
  push: () => Promise.resolve(Result.ok("")),
  pull: () => Promise.resolve(Result.ok("")),
  getCurrentBranch: () => Promise.resolve(Result.ok("main")),
  checkoutBranch: () => Promise.resolve(Result.ok(undefined)),
  hasUncommittedChanges: () => Promise.resolve(Result.ok(false)),
  getRemoteDefaultBranch: () => Promise.resolve(Result.ok("main")),
  hasChangesInPath: () => Promise.resolve(Result.ok(false)),
  hasUnpushedCommits: () => Promise.resolve(Result.ok(false)),
  ...overrides,
});

const createMockWorkspaceRepository = (
  overrides: Partial<WorkspaceRepository> = {},
): WorkspaceRepository => ({
  load: () =>
    Promise.resolve(
      Result.error(createRepositoryError("workspace", "load", "not found")),
    ),
  save: () => Promise.resolve(Result.ok(undefined)),
  list: () => Promise.resolve(Result.ok([])),
  exists: () => Promise.resolve(Result.ok(false)),
  create: () => Promise.resolve(Result.ok(undefined)),
  pathFor: (name) => `/mock/home/workspaces/${name.toString()}`,
  ...overrides,
});

const getWorkspaceName = (name: string): WorkspaceName => {
  const result = workspaceNameFromString(name);
  if (result.type === "error") {
    throw new Error(`Invalid workspace name: ${name}`);
  }
  return result.value;
};

Deno.test("WorkspaceInitRemoteWorkflow", async (t) => {
  await t.step("fails if workspace already exists", async () => {
    const gitService = createMockGitService();
    const workspaceRepository = createMockWorkspaceRepository({
      exists: () => Promise.resolve(Result.ok(true)),
    });

    const input: WorkspaceInitRemoteInput = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
    };

    const result = await WorkspaceInitRemoteWorkflow.execute(input, {
      gitService,
      workspaceRepository,
      configRepository: {
        getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
        setCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
      },
      removeDirectory: () => Promise.resolve(),
    });

    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "WorkspaceAlreadyExistsError");
    }
  });

  await t.step("clones repository successfully", async () => {
    let clonedUrl: string | undefined;
    let clonedPath: string | undefined;

    const gitService = createMockGitService({
      clone: (url, path) => {
        clonedUrl = url;
        clonedPath = path;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const workspaceRepository = createMockWorkspaceRepository({
      exists: () => Promise.resolve(Result.ok(false)),
      pathFor: () => "/mock/home/workspaces/mywork",
    });

    let currentWorkspaceSet: string | undefined;
    const configRepository = {
      getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined as string | undefined)),
      setCurrentWorkspace: (name: string) => {
        currentWorkspaceSet = name;
        return Promise.resolve(Result.ok(undefined));
      },
    };

    const input: WorkspaceInitRemoteInput = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
    };

    const result = await WorkspaceInitRemoteWorkflow.execute(input, {
      gitService,
      workspaceRepository,
      configRepository,
      removeDirectory: () => Promise.resolve(),
    });

    assertEquals(result.type, "ok");
    assertEquals(clonedUrl, "https://github.com/user/repo.git");
    assertEquals(clonedPath, "/mock/home/workspaces/mywork");
    assertEquals(currentWorkspaceSet, "mywork");
  });

  await t.step("clones with branch option", async () => {
    let clonedBranch: string | undefined;

    const gitService = createMockGitService({
      clone: (_url, _path, options) => {
        clonedBranch = options?.branch;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const workspaceRepository = createMockWorkspaceRepository({
      exists: () => Promise.resolve(Result.ok(false)),
    });

    const input: WorkspaceInitRemoteInput = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
      branch: "develop",
    };

    const result = await WorkspaceInitRemoteWorkflow.execute(input, {
      gitService,
      workspaceRepository,
      configRepository: {
        getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
        setCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
      },
      removeDirectory: () => Promise.resolve(),
    });

    assertEquals(result.type, "ok");
    assertEquals(clonedBranch, "develop");
  });

  await t.step("cleans up directory on clone failure", async () => {
    let removedPath: string | undefined;

    const gitService = createMockGitService({
      clone: () =>
        Promise.resolve(
          Result.error({
            kind: "VersionControlCommandFailedError",
            message: "clone failed",
            cause: undefined,
            toString: () => "clone failed",
          }),
        ),
    });

    const workspaceRepository = createMockWorkspaceRepository({
      exists: () => Promise.resolve(Result.ok(false)),
      pathFor: () => "/mock/home/workspaces/mywork",
    });

    const input: WorkspaceInitRemoteInput = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://invalid.example.com/repo.git",
    };

    const result = await WorkspaceInitRemoteWorkflow.execute(input, {
      gitService,
      workspaceRepository,
      configRepository: {
        getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
        setCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
      },
      removeDirectory: (path) => {
        removedPath = path;
        return Promise.resolve();
      },
    });

    assertEquals(result.type, "error");
    assertEquals(removedPath, "/mock/home/workspaces/mywork");
  });
});
