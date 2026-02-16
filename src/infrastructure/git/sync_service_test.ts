import { assertEquals } from "@std/assert";
import { createSyncService } from "./sync_service.ts";
import { Result } from "../../shared/result.ts";
import {
  createVersionControlCommandFailedError,
  VersionControlService,
} from "../../domain/services/version_control_service.ts";

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
  hasUnpushedCommits: () => Promise.resolve(Result.ok(false)),
  ...overrides,
});

Deno.test("SyncService.pull", async (t) => {
  await t.step("skips pull when sync is disabled", async () => {
    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.pull({
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
    const result = await syncService.pull({
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
    const result = await syncService.pull({
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

  await t.step("skips pull when no remote configured", async () => {
    let pullCalled = false;
    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.pull({
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
    const result = await syncService.pull({
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
    const result = await syncService.pull({
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
    const result = await syncService.pull({
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
    const result = await syncService.pull({
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

Deno.test("SyncService.commit", async (t) => {
  await t.step("stages and commits successfully", async () => {
    let stageCalled = false;
    let commitCalled = false;
    let commitMessage = "";

    const vcs = createMockVersionControlService({
      stage: () => {
        stageCalled = true;
        return Promise.resolve(Result.ok(undefined));
      },
      commit: (_cwd, message) => {
        commitCalled = true;
        commitMessage = message;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.commit({
      workspaceRoot: "/test",
      summary: "create new note",
    });

    assertEquals(result.committed, true);
    assertEquals(result.error, undefined);
    assertEquals(stageCalled, true);
    assertEquals(commitCalled, true);
    assertEquals(commitMessage, "mm: create new note");
  });

  await t.step("stages correct files", async () => {
    let stagedFiles: string[] = [];

    const vcs = createMockVersionControlService({
      stage: (_cwd, files) => {
        stagedFiles = files;
        return Promise.resolve(Result.ok(undefined));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    await syncService.commit({
      workspaceRoot: "/test",
      summary: "create new note",
    });

    assertEquals(stagedFiles, ["items", "tags", "workspace.json"]);
  });

  await t.step("handles stage failure gracefully", async () => {
    const vcs = createMockVersionControlService({
      stage: () =>
        Promise.resolve(Result.error(createVersionControlCommandFailedError("Permission denied"))),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.commit({
      workspaceRoot: "/test",
      summary: "create new note",
    });

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

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.commit({
      workspaceRoot: "/test",
      summary: "create new note",
    });

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

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.commit({
      workspaceRoot: "/test",
      summary: "create new note",
    });

    assertEquals(result.committed, false);
    assertEquals(result.error, undefined);
  });

  await t.step("handles 'clean' working tree gracefully", async () => {
    const vcs = createMockVersionControlService({
      commit: () =>
        Promise.resolve(
          Result.error(
            createVersionControlCommandFailedError(
              "On branch main, nothing to commit, working tree clean",
            ),
          ),
        ),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.commit({
      workspaceRoot: "/test",
      summary: "create new note",
    });

    assertEquals(result.committed, false);
    assertEquals(result.error, undefined);
  });
});

Deno.test("SyncService.push", async (t) => {
  await t.step("pushes successfully", async () => {
    let pushCalled = false;
    let pushRemote = "";
    let pushBranch = "";

    const vcs = createMockVersionControlService({
      getCurrentBranch: () => Promise.resolve(Result.ok("main")),
      push: (_cwd, remote, branch) => {
        pushCalled = true;
        pushRemote = remote;
        pushBranch = branch;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    });

    assertEquals(result.pushed, true);
    assertEquals(result.error, undefined);
    assertEquals(pushCalled, true);
    assertEquals(pushRemote, "https://github.com/user/repo.git");
    assertEquals(pushBranch, "main");
  });

  await t.step("returns error when no remote configured", async () => {
    const vcs = createMockVersionControlService();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.push({
      workspaceRoot: "/test",
      remote: undefined,
      branch: "main",
    });

    assertEquals(result.pushed, false);
    assertEquals(result.error, { type: "no_remote_configured" });
  });

  await t.step("returns error when no branch configured", async () => {
    const vcs = createMockVersionControlService();

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: undefined,
    });

    assertEquals(result.pushed, false);
    assertEquals(result.error, { type: "no_branch_configured" });
  });

  await t.step("returns error when getCurrentBranch fails", async () => {
    const vcs = createMockVersionControlService({
      getCurrentBranch: () =>
        Promise.resolve(
          Result.error(createVersionControlCommandFailedError("Not a git repository")),
        ),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    });

    assertEquals(result.pushed, false);
    assertEquals(result.error, {
      type: "get_current_branch_failed",
      details: "Not a git repository",
    });
  });

  await t.step("handles push failure gracefully", async () => {
    const vcs = createMockVersionControlService({
      push: () =>
        Promise.resolve(Result.error(createVersionControlCommandFailedError("push rejected"))),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    });

    assertEquals(result.pushed, false);
    assertEquals(result.error, {
      type: "push_failed",
      details: "push rejected",
    });
  });

  await t.step("handles network error gracefully", async () => {
    const vcs = createMockVersionControlService({
      push: () =>
        Promise.resolve(
          Result.error(
            createVersionControlCommandFailedError(
              "ssh: connect to host github.com port 22: Connection refused",
            ),
          ),
        ),
    });

    const syncService = createSyncService({ versionControlService: vcs });
    const result = await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    });

    assertEquals(result.pushed, false);
    assertEquals(result.error, { type: "network_error" });
  });

  await t.step("does not call pull before push", async () => {
    let pullCalled = false;

    const vcs = createMockVersionControlService({
      pull: () => {
        pullCalled = true;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    });

    assertEquals(pullCalled, false);
  });

  await t.step("uses current branch for push", async () => {
    let pushBranch = "";

    const vcs = createMockVersionControlService({
      getCurrentBranch: () => Promise.resolve(Result.ok("feature-branch")),
      push: (_cwd, _remote, branch) => {
        pushBranch = branch;
        return Promise.resolve(Result.ok(""));
      },
    });

    const syncService = createSyncService({ versionControlService: vcs });
    await syncService.push({
      workspaceRoot: "/test",
      remote: "https://github.com/user/repo.git",
      branch: "main",
    });

    assertEquals(pushBranch, "feature-branch");
  });
});
