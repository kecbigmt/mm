import { assertEquals } from "@std/assert";
import { PrePullWorkflow } from "./pre_pull.ts";
import { Result } from "../../shared/result.ts";
import { VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { createWorkspaceSettings } from "../models/workspace.ts";
import { parseTimezoneIdentifier } from "../primitives/timezone_identifier.ts";

// Helper to create test workspace settings
const createTestWorkspaceSettings = (options: {
  enabled: boolean;
  mode: "auto-commit" | "auto-sync" | "lazy-sync";
  remote?: string | null;
  branch?: string;
}) => {
  const tz = parseTimezoneIdentifier("UTC");
  if (tz.type === "error") throw new Error("Invalid timezone");
  return createWorkspaceSettings({
    timezone: tz.value,
    sync: {
      vcs: "git",
      enabled: options.enabled,
      mode: options.mode,
      git: options.remote !== undefined ? { remote: options.remote, branch: options.branch } : null,
    },
  });
};

// Mock factories
const createMockVersionControlService = (
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
  ...overrides,
});

const createMockWorkspaceRepository = (
  settings: ReturnType<typeof createTestWorkspaceSettings>,
): WorkspaceRepository => ({
  load: () => Promise.resolve(Result.ok(settings)),
  save: () => Promise.resolve(Result.ok(undefined)),
  list: () => Promise.resolve(Result.ok([])),
  exists: () => Promise.resolve(Result.ok(false)),
  create: () => Promise.resolve(Result.ok(undefined)),
  pathFor: () => "/test",
});

Deno.test("PrePullWorkflow", async (t) => {
  await t.step("skips pull when sync is disabled", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: false,
      mode: "auto-sync",
      remote: "origin",
    });

    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, false);
      assertEquals(result.value.skipped, true);
    }
    assertEquals(pullCalled, false);
  });

  await t.step("skips pull when mode is auto-commit", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-commit",
      remote: "origin",
    });

    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, false);
      assertEquals(result.value.skipped, true);
    }
    assertEquals(pullCalled, false);
  });

  await t.step("executes pull when mode is auto-sync", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    let pullCalled = false;
    let pullRemote = "";
    let pullBranch = "";
    const vcs = createMockVersionControlService({
      pull: (_cwd, remote, branch) => {
        pullCalled = true;
        pullRemote = remote;
        pullBranch = branch;
        return Promise.resolve(Result.ok("Already up to date."));
      },
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, true);
      assertEquals(result.value.skipped, false);
    }
    assertEquals(pullCalled, true);
    assertEquals(pullRemote, "https://github.com/test/repo.git");
    assertEquals(pullBranch, "main");
  });

  await t.step("executes pull when mode is lazy-sync", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "lazy-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok("Already up to date."));
      },
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, true);
    }
    assertEquals(pullCalled, true);
  });

  await t.step("skips pull when no remote configured", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-sync",
      remote: null,
    });

    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, false);
      assertEquals(result.value.skipped, true);
    }
    assertEquals(pullCalled, false);
  });

  await t.step("returns warning when pull fails due to network error", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    const vcs = createMockVersionControlService({
      pull: () =>
        Promise.resolve(
          Result.error({
            kind: "VersionControlCommandFailedError" as const,
            message: "ssh: connect to host github.com port 22: Connection refused",
            cause: undefined,
            toString: () => "VersionControlCommandFailedError",
          }),
        ),
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, false);
      assertEquals(result.value.warning?.type, "network_error");
    }
  });

  await t.step("returns warning when pull fails due to rebase conflict", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    const vcs = createMockVersionControlService({
      pull: () =>
        Promise.resolve(
          Result.error({
            kind: "VersionControlCommandFailedError" as const,
            message: "CONFLICT (content): Merge conflict in items/2025/01/01/note.md",
            cause: undefined,
            toString: () => "VersionControlCommandFailedError",
          }),
        ),
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, false);
      assertEquals(result.value.warning?.type, "pull_failed");
    }
  });

  await t.step("uses default branch 'main' when branch not configured", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      // branch not set
    });

    let pullBranch = "";
    const vcs = createMockVersionControlService({
      pull: (_cwd, _remote, branch) => {
        pullBranch = branch;
        return Promise.resolve(Result.ok(""));
      },
      getRemoteDefaultBranch: () => Promise.resolve(Result.ok("main")),
    });

    const result = await PrePullWorkflow.execute(
      { workspaceRoot: "/test" },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, true);
    }
    assertEquals(pullBranch, "main");
  });

  await t.step("calls onPull callback when provided", async () => {
    const settings = createTestWorkspaceSettings({
      enabled: true,
      mode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    let callbackInvoked = false;
    const vcs = createMockVersionControlService({
      pull: () => Promise.resolve(Result.ok("")),
    });

    const result = await PrePullWorkflow.execute(
      {
        workspaceRoot: "/test",
        onPull: async (op) => {
          callbackInvoked = true;
          return await op();
        },
      },
      {
        versionControlService: vcs,
        workspaceRepository: createMockWorkspaceRepository(settings),
      },
    );

    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value.pulled, true);
    }
    assertEquals(callbackInvoked, true);
  });
});
