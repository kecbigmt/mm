import { assertEquals } from "@std/assert";
import { SyncWorkflow } from "./sync.ts";
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
  let shouldFailPush = false;
  let pushErrorMessage = "git push failed: rejected";
  let hasUncommitted = false;
  let remoteDefaultBranch = "main";

  return {
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
      if (shouldFailPush) {
        return Promise.resolve(Result.error(createVersionControlCommandFailedError(pushErrorMessage)));
      }
      return Promise.resolve(Result.ok("Everything up-to-date\n"));
    },
    pull: (
      _cwd: string,
      remote: string,
      branch: string,
    ): Promise<Result<string, VersionControlError>> => {
      calls.push(`pull:${remote}:${branch}`);
      if (shouldFailPull) {
        return Promise.resolve(Result.error(createVersionControlCommandFailedError(pullErrorMessage)));
      }
      return Promise.resolve(Result.ok("Already up to date.\n"));
    },
    getCurrentBranch: (_cwd: string): Promise<Result<string, VersionControlError>> => {
      calls.push(`getCurrentBranch`);
      return Promise.resolve(Result.ok("main"));
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
      _remote: string,
    ): Promise<Result<string, VersionControlError>> => {
      calls.push(`getRemoteDefaultBranch`);
      return Promise.resolve(Result.ok(remoteDefaultBranch));
    },
    getCalls: () => calls,
    setFailPull: (should: boolean, message?: string) => {
      shouldFailPull = should;
      if (message) pullErrorMessage = message;
    },
    setFailPush: (should: boolean, message?: string) => {
      shouldFailPush = should;
      if (message) pushErrorMessage = message;
    },
    setHasUncommitted: (has: boolean) => {
      hasUncommitted = has;
    },
    setRemoteDefaultBranch: (branch: string) => {
      remoteDefaultBranch = branch;
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

  const gitConfig = {
    enabled: gitEnabled,
    remote,
    branch: branch === null ? undefined : (branch ?? "main"),
    syncMode: "auto-commit" as const,
  };

  const settings = createWorkspaceSettings({
    timezone: tzResult.value,
    git: gitConfig,
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

Deno.test("SyncWorkflow - success with pull and push", async () => {
  const gitService = mockVersionControlService();
  const workspaceRepo = mockWorkspaceRepo(true, "git@github.com:user/test.git", "main");

  const result = await SyncWorkflow.execute(
    { workspaceRoot: "/test/workspace" },
    {
      gitService,
      workspaceRepository: workspaceRepo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.includes("Already up to date"), true);
    assertEquals(result.value.includes("Everything up-to-date"), true);
  }

  const calls = gitService.getCalls();
  assertEquals(calls.includes("hasUncommittedChanges"), true);
  assertEquals(calls.includes("pull:git@github.com:user/test.git:main"), true);
  assertEquals(calls.includes("getCurrentBranch"), true);
  assertEquals(calls.includes("push:origin:main"), true);
});

Deno.test("SyncWorkflow - git not enabled", async () => {
  const gitService = mockVersionControlService();
  const workspaceRepo = mockWorkspaceRepo(false, null);

  const result = await SyncWorkflow.execute(
    { workspaceRoot: "/test/workspace" },
    {
      gitService,
      workspaceRepository: workspaceRepo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error" && "issues" in result.error) {
    assertEquals(
      result.error.issues[0].message.includes("Git sync is not enabled"),
      true,
    );
  }
});

Deno.test("SyncWorkflow - no remote configured", async () => {
  const gitService = mockVersionControlService();
  const workspaceRepo = mockWorkspaceRepo(true, null);

  const result = await SyncWorkflow.execute(
    { workspaceRoot: "/test/workspace" },
    {
      gitService,
      workspaceRepository: workspaceRepo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error" && "issues" in result.error) {
    assertEquals(
      result.error.issues[0].message.includes("No remote configured"),
      true,
    );
  }
});

Deno.test("SyncWorkflow - pull fails, push not attempted", async () => {
  const gitService = mockVersionControlService();
  gitService.setFailPull(true, "non-fast-forward");
  const workspaceRepo = mockWorkspaceRepo(true, "git@github.com:user/test.git", "main");

  const result = await SyncWorkflow.execute(
    { workspaceRoot: "/test/workspace" },
    {
      gitService,
      workspaceRepository: workspaceRepo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error" && "message" in result.error) {
    assertEquals(result.error.message.includes("non-fast-forward"), true);
  }

  const calls = gitService.getCalls();
  assertEquals(calls.includes("pull:git@github.com:user/test.git:main"), true);
  // Push should not be called when pull fails
  assertEquals(calls.includes("push:origin:main"), false);
});

Deno.test("SyncWorkflow - pull succeeds, push fails", async () => {
  const gitService = mockVersionControlService();
  gitService.setFailPush(true, "rejected (non-fast-forward)");
  const workspaceRepo = mockWorkspaceRepo(true, "git@github.com:user/test.git", "main");

  const result = await SyncWorkflow.execute(
    { workspaceRoot: "/test/workspace" },
    {
      gitService,
      workspaceRepository: workspaceRepo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error" && "message" in result.error) {
    assertEquals(result.error.message.includes("non-fast-forward"), true);
  }

  const calls = gitService.getCalls();
  assertEquals(calls.includes("pull:git@github.com:user/test.git:main"), true);
  assertEquals(calls.includes("push:origin:main"), true);
});

Deno.test("SyncWorkflow - uncommitted changes", async () => {
  const gitService = mockVersionControlService();
  gitService.setHasUncommitted(true);
  const workspaceRepo = mockWorkspaceRepo(true, "git@github.com:user/test.git", "main");

  const result = await SyncWorkflow.execute(
    { workspaceRoot: "/test/workspace" },
    {
      gitService,
      workspaceRepository: workspaceRepo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error" && "issues" in result.error) {
    assertEquals(
      result.error.issues[0].message.includes("uncommitted changes"),
      true,
    );
  }
});
