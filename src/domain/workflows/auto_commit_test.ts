import { assertEquals } from "@std/assert";
import { AutoCommitWorkflow } from "./auto_commit.ts";
import { Result } from "../../shared/result.ts";
import {
  createVersionControlCommandFailedError,
  VersionControlService,
} from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { createWorkspaceSettings } from "../models/workspace.ts";
import { createRepositoryError } from "../repositories/repository_error.ts";
import { parseTimezoneIdentifier } from "../primitives/timezone_identifier.ts";

// Mock VersionControlService
const createMockGitService = (
  overrides?: Partial<VersionControlService>,
): VersionControlService => ({
  init: () => Promise.resolve(Result.ok(undefined)),
  setRemote: () => Promise.resolve(Result.ok(undefined)),
  stage: () => Promise.resolve(Result.ok(undefined)),
  commit: () => Promise.resolve(Result.ok(undefined)),
  validateBranchName: () => Promise.resolve(Result.ok(undefined)),
  push: () => Promise.resolve(Result.ok("pushed")),
  pull: () => Promise.resolve(Result.ok("pulled")),
  getCurrentBranch: () => Promise.resolve(Result.ok("main")),
  checkoutBranch: () => Promise.resolve(Result.ok(undefined)),
  hasUncommittedChanges: () => Promise.resolve(Result.ok(false)),
  getRemoteDefaultBranch: () => Promise.resolve(Result.ok("main")),
  ...overrides,
});

// Mock WorkspaceRepository
const createMockWorkspaceRepository = (
  settings?: ReturnType<typeof createWorkspaceSettings>,
): WorkspaceRepository => ({
  load: () => {
    if (settings) {
      return Promise.resolve(Result.ok(settings));
    }
    return Promise.resolve(Result.error(createRepositoryError("workspace", "load", "Not found")));
  },
  save: () => Promise.resolve(Result.ok(undefined)),
  list: () => Promise.resolve(Result.ok([])),
  exists: () => Promise.resolve(Result.ok(false)),
  create: () => Promise.resolve(Result.ok(undefined)),
  pathFor: () => "/test/workspace/workspace.json",
});

Deno.test("AutoCommitWorkflow - skips when workspace settings cannot be loaded", async () => {
  const versionControlService = createMockGitService();
  const workspaceRepository = createMockWorkspaceRepository();

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new note",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, false);
    assertEquals(result.value.message, undefined);
  }
});

Deno.test("AutoCommitWorkflow - skips when git.enabled is false", async () => {
  const timezoneResult = parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") throw new Error("Invalid timezone");

  const settings = createWorkspaceSettings({
    timezone: timezoneResult.value,
    git: {
      enabled: false,
      remote: null,
      branch: undefined,
      syncMode: "auto-commit",
    },
  });

  const versionControlService = createMockGitService();
  const workspaceRepository = createMockWorkspaceRepository(settings);

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new note",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, false);
    assertEquals(result.value.message, undefined);
  }
});

Deno.test("AutoCommitWorkflow - commits successfully in auto-commit mode", async () => {
  const timezoneResult = parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") throw new Error("Invalid timezone");

  const settings = createWorkspaceSettings({
    timezone: timezoneResult.value,
    git: {
      enabled: true,
      remote: "https://github.com/user/repo.git",
      branch: "main",
      syncMode: "auto-commit",
    },
  });

  const versionControlService = createMockGitService();
  const workspaceRepository = createMockWorkspaceRepository(settings);

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new note",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, true);
    assertEquals(result.value.message, "Auto-committed: mm: create new note");
  }
});

Deno.test("AutoCommitWorkflow - commits successfully in auto-sync mode", async () => {
  const timezoneResult = parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") throw new Error("Invalid timezone");

  const settings = createWorkspaceSettings({
    timezone: timezoneResult.value,
    git: {
      enabled: true,
      remote: "https://github.com/user/repo.git",
      branch: "main",
      syncMode: "auto-sync",
    },
  });

  const versionControlService = createMockGitService();
  const workspaceRepository = createMockWorkspaceRepository(settings);

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new task",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, true);
    assertEquals(result.value.message, "Auto-committed: mm: create new task");
  }
});

Deno.test("AutoCommitWorkflow - handles stage failure gracefully", async () => {
  const timezoneResult = parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") throw new Error("Invalid timezone");

  const settings = createWorkspaceSettings({
    timezone: timezoneResult.value,
    git: {
      enabled: true,
      remote: "https://github.com/user/repo.git",
      branch: "main",
      syncMode: "auto-commit",
    },
  });

  const versionControlService = createMockGitService({
    stage: () =>
      Promise.resolve(Result.error(createVersionControlCommandFailedError("Permission denied"))),
  });
  const workspaceRepository = createMockWorkspaceRepository(settings);

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new note",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, false);
    assertEquals(result.value.message, "Warning: Auto-commit stage failed: Permission denied");
  }
});

Deno.test("AutoCommitWorkflow - handles commit failure gracefully", async () => {
  const timezoneResult = parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") throw new Error("Invalid timezone");

  const settings = createWorkspaceSettings({
    timezone: timezoneResult.value,
    git: {
      enabled: true,
      remote: "https://github.com/user/repo.git",
      branch: "main",
      syncMode: "auto-commit",
    },
  });

  const versionControlService = createMockGitService({
    commit: () =>
      Promise.resolve(Result.error(createVersionControlCommandFailedError("Git not found"))),
  });
  const workspaceRepository = createMockWorkspaceRepository(settings);

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new note",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, false);
    assertEquals(result.value.message, "Warning: Auto-commit failed: Git not found");
  }
});

Deno.test("AutoCommitWorkflow - handles 'nothing to commit' gracefully", async () => {
  const timezoneResult = parseTimezoneIdentifier("UTC");
  if (timezoneResult.type === "error") throw new Error("Invalid timezone");

  const settings = createWorkspaceSettings({
    timezone: timezoneResult.value,
    git: {
      enabled: true,
      remote: "https://github.com/user/repo.git",
      branch: "main",
      syncMode: "auto-commit",
    },
  });

  const versionControlService = createMockGitService({
    commit: () =>
      Promise.resolve(
        Result.error(
          createVersionControlCommandFailedError("nothing to commit, working tree clean"),
        ),
      ),
  });
  const workspaceRepository = createMockWorkspaceRepository(settings);

  const result = await AutoCommitWorkflow.execute(
    {
      workspaceRoot: "/test/workspace",
      summary: "create new note",
    },
    { versionControlService, workspaceRepository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.committed, false);
    assertEquals(result.value.message, undefined);
  }
});
