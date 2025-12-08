import { assertEquals } from "@std/assert";
import { SyncPushWorkflow } from "./sync_push.ts";
import { Result } from "../../shared/result.ts";
import { createWorkspaceSettings, WorkspaceSettings } from "../models/workspace.ts";
import { timezoneIdentifierFromString } from "../primitives/timezone_identifier.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import {
  createVersionControlError,
  VersionControlError,
} from "../services/version_control_service.ts";

const mockVersionControlService = () => {
  const calls: string[] = [];
  let shouldFailPush = false;
  let currentBranch = "main";

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
        return Promise.resolve(
          Result.error(createVersionControlError("git push failed: rejected")),
        );
      }
      return Promise.resolve(Result.ok("Everything up-to-date\n"));
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
    getCalls: () => calls,
    setFailPush: (fail: boolean) => {
      shouldFailPush = fail;
    },
    setCurrentBranch: (branch: string) => {
      currentBranch = branch;
    },
  };
};

const mockWorkspaceRepo = (gitEnabled: boolean, remote: string | null, branch?: string) => {
  const tzResult = timezoneIdentifierFromString("UTC");
  if (tzResult.type === "error") throw new Error("Invalid tz");

  const settings = createWorkspaceSettings({
    timezone: tzResult.value,
    git: {
      enabled: gitEnabled,
      remote,
      branch: branch ?? "main",
      syncMode: "auto-commit",
    },
  });

  return {
    load: () => Promise.resolve(Result.ok(settings)),
    save: (_root: string, _s: WorkspaceSettings) => {
      return Promise.resolve(Result.ok(undefined));
    },
    list: () => Promise.resolve(Result.ok([])),
    exists: () => Promise.resolve(Result.ok(true)),
    create: () => Promise.resolve(Result.ok(undefined)),
    pathFor: (_name: string) => "path",
  };
};

Deno.test("SyncPushWorkflow success flow", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: false,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  assertEquals(git.getCalls(), ["getCurrentBranch", "push:origin:main"]);
});

Deno.test("SyncPushWorkflow with force flag", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: true,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  assertEquals(git.getCalls(), ["getCurrentBranch", "push:origin:main:force"]);
});

Deno.test("SyncPushWorkflow with custom branch", async () => {
  const git = mockVersionControlService();
  git.setCurrentBranch("develop");
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git", "develop");

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: false,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "ok");
  assertEquals(git.getCalls(), ["getCurrentBranch", "push:origin:develop"]);
});

Deno.test("SyncPushWorkflow fails when git not enabled", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(false, null);

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: false,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
    assertEquals(
      result.error.toString().includes("Git sync is not enabled"),
      true,
    );
  }
  assertEquals(git.getCalls(), []); // No git operations should be called
});

Deno.test("SyncPushWorkflow fails when no remote configured", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo(true, null);

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: false,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
    assertEquals(
      result.error.toString().includes("No remote configured"),
      true,
    );
  }
  assertEquals(git.getCalls(), []);
});

Deno.test("SyncPushWorkflow fails when push is rejected", async () => {
  const git = mockVersionControlService();
  git.setFailPush(true);
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git");

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: false,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "VersionControlError");
    assertEquals(result.error.message, "git push failed: rejected");
  }
  assertEquals(git.getCalls(), ["getCurrentBranch", "push:origin:main"]);
});

Deno.test("SyncPushWorkflow fails when current branch does not match configured branch", async () => {
  const git = mockVersionControlService();
  git.setCurrentBranch("feature-test");
  const repo = mockWorkspaceRepo(true, "https://github.com/user/repo.git", "main");

  const result = await SyncPushWorkflow.execute(
    {
      workspaceRoot: "/ws",
      force: false,
    },
    {
      gitService: git,
      workspaceRepository: repo as unknown as WorkspaceRepository,
    },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.kind, "ValidationError");
    assertEquals(
      result.error.toString().includes('Current branch "feature-test" does not match'),
      true,
    );
    assertEquals(
      result.error.toString().includes('configured branch "main"'),
      true,
    );
  }
  assertEquals(git.getCalls(), ["getCurrentBranch"]);
});
