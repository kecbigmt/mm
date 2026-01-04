import { assertEquals } from "@std/assert";
import { createSyncService } from "./sync_service.ts";
import { Result } from "../../shared/result.ts";
import {
  createVersionControlCommandFailedError,
  VersionControlService,
} from "../../domain/services/version_control_service.ts";
import { StateRepository, SyncState } from "../../domain/repositories/state_repository.ts";
import { parsePlacement } from "../../domain/primitives/placement.ts";

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

// Mock factory for StateRepository
const createMockStateRepository = (
  overrides: Partial<StateRepository> = {},
): StateRepository => {
  const defaultPlacement = parsePlacement("2024-01-01");
  if (defaultPlacement.type === "error") throw new Error("Invalid default placement");
  return {
    loadCwd: () => Promise.resolve(Result.ok(defaultPlacement.value)),
    saveCwd: () => Promise.resolve(Result.ok(undefined)),
    loadSyncState: () =>
      Promise.resolve(
        Result.ok({
          commitsSinceLastSync: 0,
          lastSyncTimestamp: null,
        } as SyncState),
      ),
    saveSyncState: () => Promise.resolve(Result.ok(undefined)),
    ...overrides,
  };
};

Deno.test("SyncService.autoCommit", async (t) => {
  await t.step("skips when sync is disabled", async () => {
    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: false,
      syncMode: "auto-commit",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, false);
    assertEquals(result.error, undefined);
  });

  await t.step("commits successfully in auto-commit mode (no push)", async () => {
    let stageCalled = false;
    let commitCalled = false;
    let pushCalled = false;

    const vcs = createMockVersionControlService({
      stage: () => {
        stageCalled = true;
        return Promise.resolve(Result.ok(undefined));
      },
      commit: () => {
        commitCalled = true;
        return Promise.resolve(Result.ok(undefined));
      },
      push: () => {
        pushCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "auto-commit",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.error, undefined);
    assertEquals(stageCalled, true);
    assertEquals(commitCalled, true);
    assertEquals(pushCalled, false);
  });

  await t.step("auto-sync: commits and pushes successfully", async () => {
    let stageCalled = false;
    let commitCalled = false;
    let pullCalled = false;
    let pushCalled = false;

    const vcs = createMockVersionControlService({
      stage: () => {
        stageCalled = true;
        return Promise.resolve(Result.ok(undefined));
      },
      commit: () => {
        commitCalled = true;
        return Promise.resolve(Result.ok(undefined));
      },
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
      push: () => {
        pushCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new task",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, true);
    assertEquals(result.error, undefined);
    assertEquals(stageCalled, true);
    assertEquals(commitCalled, true);
    assertEquals(pullCalled, true);
    assertEquals(pushCalled, true);
  });

  await t.step("auto-sync: pull fails (rebase conflict)", async () => {
    const vcs = createMockVersionControlService({
      pull: () =>
        Promise.resolve(
          Result.error(
            createVersionControlCommandFailedError("CONFLICT (content): Merge conflict"),
          ),
        ),
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new task",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.error, {
      type: "pull_failed",
      details: "CONFLICT (content): Merge conflict",
    });
  });

  await t.step("auto-sync: push fails", async () => {
    const vcs = createMockVersionControlService({
      push: () =>
        Promise.resolve(Result.error(createVersionControlCommandFailedError("push rejected"))),
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new task",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.error, {
      type: "push_failed",
      details: "push rejected",
    });
  });

  await t.step("auto-sync: returns error when no remote configured", async () => {
    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new task",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: undefined,
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.error, { type: "no_remote_configured" });
  });

  await t.step("auto-sync: returns error when no branch configured", async () => {
    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new task",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/user/repo.git",
      branch: undefined,
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.error, { type: "no_branch_configured" });
  });

  await t.step("handles stage failure gracefully", async () => {
    const vcs = createMockVersionControlService({
      stage: () =>
        Promise.resolve(Result.error(createVersionControlCommandFailedError("Permission denied"))),
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "auto-commit",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, false);
    assertEquals(result.error, {
      type: "stage_failed",
      details: "Permission denied",
    });
  });

  await t.step("handles commit failure gracefully", async () => {
    const vcs = createMockVersionControlService({
      commit: () =>
        Promise.resolve(Result.error(createVersionControlCommandFailedError("Git not found"))),
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "auto-commit",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, false);
    assertEquals(result.error, {
      type: "commit_failed",
      details: "Git not found",
    });
  });

  await t.step("handles 'nothing to commit' gracefully", async () => {
    const vcs = createMockVersionControlService({
      commit: () =>
        Promise.resolve(
          Result.error(
            createVersionControlCommandFailedError("nothing to commit, working tree clean"),
          ),
        ),
    });
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "auto-commit",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, false);
    assertEquals(result.error, undefined);
  });

  await t.step("lazy-sync: increments commit count when below threshold", async () => {
    let savedCommitCount = -1;

    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository({
      loadSyncState: () =>
        Promise.resolve(
          Result.ok({
            commitsSinceLastSync: 3,
            lastSyncTimestamp: Date.now(),
          } as SyncState),
        ),
      saveSyncState: (state) => {
        savedCommitCount = state.commitsSinceLastSync;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "lazy-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
      lazy: { commits: 10, minutes: 10 },
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.syncTriggered, undefined);
    assertEquals(savedCommitCount, 4);
  });

  await t.step("lazy-sync: triggers sync when commit threshold met", async () => {
    let savedCommitCount = -1;

    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository({
      loadSyncState: () =>
        Promise.resolve(
          Result.ok({
            commitsSinceLastSync: 4,
            lastSyncTimestamp: Date.now(),
          } as SyncState),
        ),
      saveSyncState: (state) => {
        savedCommitCount = state.commitsSinceLastSync;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "lazy-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
      lazy: { commits: 5, minutes: 10 },
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, true);
    assertEquals(result.syncTriggered, true);
    assertEquals(savedCommitCount, 0);
  });

  await t.step("lazy-sync: triggers sync when time threshold met", async () => {
    let savedCommitCount = -1;

    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository({
      loadSyncState: () =>
        Promise.resolve(
          Result.ok({
            commitsSinceLastSync: 1,
            lastSyncTimestamp: Date.now() - 2 * 60 * 1000, // 2 minutes ago
          } as SyncState),
        ),
      saveSyncState: (state) => {
        savedCommitCount = state.commitsSinceLastSync;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "lazy-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
      lazy: { commits: 100, minutes: 1 },
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, true);
    assertEquals(result.syncTriggered, true);
    assertEquals(savedCommitCount, 0);
  });

  await t.step("lazy-sync: does not reset count on sync failure", async () => {
    let savedCommitCount = -1;

    const vcs = createMockVersionControlService({
      push: () =>
        Promise.resolve(Result.error(createVersionControlCommandFailedError("push failed"))),
    });
    const stateRepo = createMockStateRepository({
      loadSyncState: () =>
        Promise.resolve(
          Result.ok({
            commitsSinceLastSync: 4,
            lastSyncTimestamp: Date.now(),
          } as SyncState),
        ),
      saveSyncState: (state) => {
        savedCommitCount = state.commitsSinceLastSync;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "lazy-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
      lazy: { commits: 5, minutes: 10 },
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, false);
    assertEquals(result.syncTriggered, true);
    assertEquals(result.error?.type, "push_failed");
    assertEquals(savedCommitCount, 5);
  });

  await t.step("lazy-sync: uses default thresholds when not configured", async () => {
    let savedCommitCount = -1;

    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository({
      loadSyncState: () =>
        Promise.resolve(
          Result.ok({
            commitsSinceLastSync: 9,
            lastSyncTimestamp: Date.now(),
          } as SyncState),
        ),
      saveSyncState: (state) => {
        savedCommitCount = state.commitsSinceLastSync;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new note",
      syncEnabled: true,
      syncMode: "lazy-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
      // lazy not set - should use defaults (10 commits, 10 minutes)
    }, { stateRepository: stateRepo });

    assertEquals(result.committed, true);
    assertEquals(result.pushed, true);
    assertEquals(result.syncTriggered, true);
    assertEquals(savedCommitCount, 0);
  });

  await t.step("calls onSync wrapper for sync operations", async () => {
    let onSyncCalled = false;

    const vcs = createMockVersionControlService();
    const stateRepo = createMockStateRepository();

    const syncService = createSyncService({ versionControlService: vcs });
    await syncService.autoCommit({
      workspaceRoot: "/test",
      summary: "create new task",
      syncEnabled: true,
      syncMode: "auto-sync",
      remote: "https://github.com/user/repo.git",
      branch: "main",
      onSync: async (operation) => {
        onSyncCalled = true;
        return await operation();
      },
    }, { stateRepository: stateRepo });

    assertEquals(onSyncCalled, true);
  });
});
