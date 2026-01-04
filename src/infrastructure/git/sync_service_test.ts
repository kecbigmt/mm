import { assertEquals } from "@std/assert";
import { createSyncService } from "./sync_service.ts";
import { Result } from "../../shared/result.ts";
import { VersionControlService } from "../../domain/services/version_control_service.ts";

// Mock factory for VersionControlService
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

Deno.test("SyncService.prePull", async (t) => {
  await t.step("skips pull when sync is disabled", async () => {
    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: false,
      syncMode: "auto-sync",
      remote: "origin",
    });

    assertEquals(result.pulled, false);
    assertEquals(result.skipped, true);
    assertEquals(pullCalled, false);
  });

  await t.step("skips pull when mode is auto-commit", async () => {
    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-commit",
      remote: "origin",
    });

    assertEquals(result.pulled, false);
    assertEquals(result.skipped, true);
    assertEquals(pullCalled, false);
  });

  await t.step("executes pull when mode is auto-sync", async () => {
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

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    assertEquals(result.pulled, true);
    assertEquals(result.skipped, false);
    assertEquals(pullCalled, true);
    assertEquals(pullRemote, "https://github.com/test/repo.git");
    assertEquals(pullBranch, "main");
  });

  await t.step("executes pull when mode is lazy-sync", async () => {
    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok("Already up to date."));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "lazy-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    assertEquals(result.pulled, true);
    assertEquals(pullCalled, true);
  });

  await t.step("skips pull when no remote configured", async () => {
    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: undefined,
    });

    assertEquals(result.pulled, false);
    assertEquals(result.skipped, true);
    assertEquals(pullCalled, false);
  });

  await t.step("returns warning when pull fails due to network error", async () => {
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

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    assertEquals(result.pulled, false);
    assertEquals(result.skipped, false);
    assertEquals(result.warning?.type, "network_error");
  });

  await t.step("returns warning when pull fails due to rebase conflict", async () => {
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

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      branch: "main",
    });

    assertEquals(result.pulled, false);
    assertEquals(result.skipped, false);
    assertEquals(result.warning?.type, "pull_failed");
  });

  await t.step("uses default branch 'main' when branch not configured", async () => {
    let pullBranch = "";
    const vcs = createMockVersionControlService({
      pull: (_cwd, _remote, branch) => {
        pullBranch = branch;
        return Promise.resolve(Result.ok(""));
      },
      getRemoteDefaultBranch: () => Promise.resolve(Result.ok("main")),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      // branch not set
    });

    assertEquals(result.pulled, true);
    assertEquals(pullBranch, "main");
  });

  await t.step("falls back to 'main' when getRemoteDefaultBranch fails", async () => {
    let pullBranch = "";
    const vcs = createMockVersionControlService({
      pull: (_cwd, _remote, branch) => {
        pullBranch = branch;
        return Promise.resolve(Result.ok(""));
      },
      getRemoteDefaultBranch: () =>
        Promise.resolve(
          Result.error({
            kind: "VersionControlCommandFailedError" as const,
            message: "Failed to get default branch",
            cause: undefined,
            toString: () => "VersionControlCommandFailedError",
          }),
        ),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.prePull({
      workspaceRoot: "/test",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/test/repo.git",
      // branch not set
    });

    assertEquals(result.pulled, true);
    assertEquals(pullBranch, "main");
  });
});
