import { assertEquals } from "@std/assert";
import { SyncPullWorkflow } from "./sync_pull.ts";
import { Result } from "../../shared/result.ts";
import { createWorkspaceSettings, WorkspaceSettings } from "../models/workspace.ts";
import { timezoneIdentifierFromString } from "../primitives/timezone_identifier.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import {
  createVersionControlCommandFailedError,
  VersionControlError,
} from "../services/version_control_service.ts";

const mockVersionControlService = () => {
  const calls: string[] = [];
  let shouldFailPull = false;
  let pullErrorMessage = "git pull failed: rejected";
  let hasUncommitted = false;
  let remoteDefaultBranch = "main";
  let currentBranch = "main";

  return {
    clone: () => {
      calls.push("clone");
      return Promise.resolve(Result.ok(undefined));
    },
    init: () => {
      calls.push("init");
      return Promise.resolve(Result.ok(undefined));
    },
    setRemote: (_cwd: string, _name: string, url: string) => {
      calls.push(`remote:${url}`);
      return Promise.resolve(Result.ok(undefined));
    },
    stage: () => {
      calls.push("stage");
      return Promise.resolve(Result.ok(undefined));
    },
    commit: (_cwd: string, msg: string): Promise<Result<void, VersionControlError>> => {
      calls.push(`commit:${msg}`);
      return Promise.resolve(Result.ok(undefined));
    },
    validateBranchName: (
      _cwd: string,
      branch: string,
    ): Promise<Result<void, VersionControlError>> => {
      calls.push(`validateBranch:${branch}`);
      return Promise.resolve(Result.ok(undefined));
    },
    push: (
      _cwd: string,
      remote: string,
      branch: string,
      options?: { force?: boolean },
    ): Promise<Result<string, VersionControlError>> => {
      const forceFlag = options?.force ? ":force" : "";
      calls.push(`push:${remote}:${branch}${forceFlag}`);
      return Promise.resolve(Result.ok("Everything up-to-date\n"));
    },
    pull: (
      _cwd: string,
      remote: string,
      branch: string,
    ): Promise<Result<string, VersionControlError>> => {
      calls.push(`pull:${remote}:${branch}`);
      if (shouldFailPull) {
        return Promise.resolve(
          Result.error(createVersionControlCommandFailedError(pullErrorMessage)),
        );
      }
      return Promise.resolve(Result.ok("Already up to date.\n"));
    },
    getCurrentBranch: (_cwd: string): Promise<Result<string, VersionControlError>> => {
      calls.push(`getCurrentBranch`);
      return Promise.resolve(Result.ok(currentBranch));
    },
    checkoutBranch: (
      _cwd: string,
      branch: string,
      _create: boolean,
    ): Promise<Result<void, VersionControlError>> => {
      calls.push(`checkoutBranch:${branch}`);
      return Promise.resolve(Result.ok(undefined));
    },
    hasUncommittedChanges: (_cwd: string): Promise<Result<boolean, VersionControlError>> => {
      calls.push(`hasUncommittedChanges`);
      return Promise.resolve(Result.ok(hasUncommitted));
    },
    getRemoteDefaultBranch: (
      _cwd: string,
      remote: string,
    ): Promise<Result<string, VersionControlError>> => {
      calls.push(`getRemoteDefaultBranch:${remote}`);
      return Promise.resolve(Result.ok(remoteDefaultBranch));
    },
    hasChangesInPath: (
      _cwd: string,
      _fromRef: string,
      _toRef: string,
      _path: string,
    ): Promise<Result<boolean, VersionControlError>> => {
      calls.push(`hasChangesInPath`);
      return Promise.resolve(Result.ok(false));
    },
    getCalls: () => calls,
    setFailPull: (fail: boolean, message?: string) => {
      shouldFailPull = fail;
      if (message) pullErrorMessage = message;
    },
    setHasUncommitted: (uncommitted: boolean) => {
      hasUncommitted = uncommitted;
    },
    setRemoteDefaultBranch: (branch: string) => {
      remoteDefaultBranch = branch;
    },
    setCurrentBranch: (branch: string) => {
      currentBranch = branch;
    },
  };
};

const mockWorkspaceRepo = (
  gitEnabled: boolean,
  remote: string | null,
  branch?: string | null,
) => {
  const tzResult = timezoneIdentifierFromString("UTC");
  if (tzResult.type === "error") throw new Error("Invalid tz");

  const settings = createWorkspaceSettings({
    timezone: tzResult.value,
    sync: {
      vcs: "git",
      enabled: gitEnabled,
      mode: "auto-commit" as const,
      git: {
        remote,
        branch: branch === null ? undefined : (branch ?? "main"),
      },
    },
  });

  let savedSettings = settings;

  return {
    load: () => Promise.resolve(Result.ok(savedSettings)),
    save: (_root: string, s: WorkspaceSettings) => {
      savedSettings = s;
      return Promise.resolve(Result.ok(undefined));
    },
    getSavedSettings: () => savedSettings,
    list: () => Promise.resolve(Result.ok([])),
    exists: () => Promise.resolve(Result.ok(true)),
    create: () => Promise.resolve(Result.ok(undefined)),
    pathFor: (_name: string) => "path",
  };
};

Deno.test("SyncPullWorkflow success flow", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  assertEquals(git.getCalls(), [
    "hasUncommittedChanges",
    "getCurrentBranch",
    "pull:https://github.com/user/repo.git:main",
  ]);
});

Deno.test("SyncPullWorkflow already up to date", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.includes("Already up to date"), true);
  }
});

Deno.test("SyncPullWorkflow fails when git not enabled", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(false, null);

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(
      result.error,
      { type: "git_not_enabled" },
    );
  }
  assertEquals(git.getCalls(), []); // No git operations should be called
});

Deno.test("SyncPullWorkflow fails when no remote configured", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(true, null);

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(
      result.error,
      { type: "no_remote_configured" },
    );
  }
  assertEquals(git.getCalls(), []);
});

Deno.test("SyncPullWorkflow resolves remote default branch when no branch configured", async () => {
  const git = mockVersionControlService();
  git.setRemoteDefaultBranch("develop");
  git.setCurrentBranch("develop"); // Simulate local repo is on develop
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git", null);

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  assertEquals(git.getCalls(), [
    "getRemoteDefaultBranch:https://github.com/user/repo.git",
    "hasUncommittedChanges",
    "getCurrentBranch",
    "pull:https://github.com/user/repo.git:develop",
  ]);

  // Verify branch was persisted to workspace.json
  const savedSettings = (repo as ReturnType<typeof mockWorkspaceRepo>).getSavedSettings();
  assertEquals(savedSettings.data.sync.git?.branch, "develop");
});

Deno.test("SyncPullWorkflow fails when has uncommitted changes", async () => {
  const git = mockVersionControlService();
  git.setHasUncommitted(true);
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(
      result.error,
      { type: "uncommitted_changes" },
    );
  }
  assertEquals(git.getCalls(), ["hasUncommittedChanges"]);
});

Deno.test("SyncPullWorkflow fails on non-fast-forward update", async () => {
  const git = mockVersionControlService();
  git.setFailPull(
    true,
    "git pull failed: fatal: Not possible to fast-forward, aborting.",
  );
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    if ("kind" in result.error) {
      assertEquals(result.error.kind, "VersionControlCommandFailedError");
      assertEquals(result.error.message.includes("Not possible to fast-forward"), true);
    }
  }
  assertEquals(git.getCalls(), [
    "hasUncommittedChanges",
    "getCurrentBranch",
    "pull:https://github.com/user/repo.git:main",
  ]);
});

Deno.test("SyncPullWorkflow fails when pull command fails", async () => {
  const git = mockVersionControlService();
  git.setFailPull(true, "git pull failed: Could not resolve host: github.com");
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    if ("kind" in result.error) {
      assertEquals(result.error.kind, "VersionControlCommandFailedError");
      assertEquals(result.error.message.includes("Could not resolve host"), true);
    }
  }
  assertEquals(git.getCalls(), [
    "hasUncommittedChanges",
    "getCurrentBranch",
    "pull:https://github.com/user/repo.git:main",
  ]);
});

Deno.test("SyncPullWorkflow fails when current branch does not match configured branch", async () => {
  const git = mockVersionControlService();
  git.setCurrentBranch("develop"); // Current branch is develop
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git", "main"); // Configured branch is main

  const result = await SyncPullWorkflow.execute(
    {
      workspaceRoot: "/ws",
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(
      result.error,
      {
        type: "branch_mismatch",
        currentBranch: "develop",
        configuredBranch: "main",
      },
    );
  }
  assertEquals(git.getCalls(), ["hasUncommittedChanges", "getCurrentBranch"]);
});
