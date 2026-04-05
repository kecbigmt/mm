import { assertEquals } from "@std/assert";
import { Result } from "../../shared/result.ts";
import {
  initRemoteWorkspace,
  type InitRemoteWorkspaceDeps,
  type InitRemoteWorkspaceRequest,
} from "./init_remote_workspace.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { WorkspaceName, workspaceNameFromString } from "../../domain/primitives/workspace_name.ts";
import { createRepositoryError } from "../../domain/repositories/repository_error.ts";

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

const createDefaultDeps = (
  overrides: Partial<InitRemoteWorkspaceDeps> = {},
): InitRemoteWorkspaceDeps => ({
  gitService: createMockGitService(),
  workspaceRepository: createMockWorkspaceRepository(),
  configRepository: {
    getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
    setCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
  },
  removeDirectory: () => Promise.resolve(),
  ...overrides,
});

Deno.test("initRemoteWorkspace", async (t) => {
  await t.step("fails if workspace already exists", async () => {
    const deps = createDefaultDeps({
      workspaceRepository: createMockWorkspaceRepository({
        exists: () => Promise.resolve(Result.ok(true)),
      }),
    });

    const input: InitRemoteWorkspaceRequest = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
    };

    const result = await initRemoteWorkspace(input, deps);

    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "WorkspaceAlreadyExistsError");
    }
  });

  await t.step("clones repository and sets current workspace", async () => {
    let clonedUrl: string | undefined;
    let clonedPath: string | undefined;
    let currentWorkspaceSet: string | undefined;

    const deps = createDefaultDeps({
      gitService: createMockGitService({
        clone: (url, path) => {
          clonedUrl = url;
          clonedPath = path;
          return Promise.resolve(Result.ok(undefined));
        },
      }),
      workspaceRepository: createMockWorkspaceRepository({
        exists: () => Promise.resolve(Result.ok(false)),
        pathFor: () => "/mock/home/workspaces/mywork",
      }),
      configRepository: {
        getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined as string | undefined)),
        setCurrentWorkspace: (name: string) => {
          currentWorkspaceSet = name;
          return Promise.resolve(Result.ok(undefined));
        },
      },
    });

    const input: InitRemoteWorkspaceRequest = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
    };

    const result = await initRemoteWorkspace(input, deps);

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.workspacePath, "/mock/home/workspaces/mywork");
    }
    assertEquals(clonedUrl, "https://github.com/user/repo.git");
    assertEquals(clonedPath, "/mock/home/workspaces/mywork");
    assertEquals(currentWorkspaceSet, "mywork");
  });

  await t.step("passes branch option to clone", async () => {
    let clonedBranch: string | undefined;

    const deps = createDefaultDeps({
      gitService: createMockGitService({
        clone: (_url, _path, options) => {
          clonedBranch = options?.branch;
          return Promise.resolve(Result.ok(undefined));
        },
      }),
    });

    const input: InitRemoteWorkspaceRequest = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
      branch: "develop",
    };

    const result = await initRemoteWorkspace(input, deps);

    assertEquals(result.type, "ok");
    assertEquals(clonedBranch, "develop");
  });

  await t.step("cleans up directory on clone failure", async () => {
    let removedPath: string | undefined;

    const deps = createDefaultDeps({
      gitService: createMockGitService({
        clone: () =>
          Promise.resolve(
            Result.error({
              kind: "VersionControlCommandFailedError" as const,
              message: "clone failed",
              cause: undefined,
              toString: () => "clone failed",
            }),
          ),
      }),
      workspaceRepository: createMockWorkspaceRepository({
        exists: () => Promise.resolve(Result.ok(false)),
        pathFor: () => "/mock/home/workspaces/mywork",
      }),
      removeDirectory: (path) => {
        removedPath = path;
        return Promise.resolve();
      },
    });

    const input: InitRemoteWorkspaceRequest = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://invalid.example.com/repo.git",
    };

    const result = await initRemoteWorkspace(input, deps);

    assertEquals(result.type, "error");
    assertEquals(removedPath, "/mock/home/workspaces/mywork");
  });

  await t.step("propagates workspace exists check error", async () => {
    const deps = createDefaultDeps({
      workspaceRepository: createMockWorkspaceRepository({
        exists: () =>
          Promise.resolve(
            Result.error(createRepositoryError("workspace", "load", "disk error")),
          ),
      }),
    });

    const input: InitRemoteWorkspaceRequest = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
    };

    const result = await initRemoteWorkspace(input, deps);

    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "RepositoryError");
    }
  });

  await t.step("propagates config set error", async () => {
    const deps = createDefaultDeps({
      configRepository: {
        getCurrentWorkspace: () => Promise.resolve(Result.ok(undefined)),
        setCurrentWorkspace: () =>
          Promise.resolve(
            Result.error(createRepositoryError("config", "save", "write failed")),
          ),
      },
    });

    const input: InitRemoteWorkspaceRequest = {
      workspaceName: getWorkspaceName("mywork"),
      remoteUrl: "https://github.com/user/repo.git",
    };

    const result = await initRemoteWorkspace(input, deps);

    assertEquals(result.type, "error");
    if (result.type === "error") {
      assertEquals(result.error.kind, "RepositoryError");
    }
  });
});
