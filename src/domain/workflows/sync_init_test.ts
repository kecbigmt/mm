import { assertEquals } from "@std/assert";
import { SyncInitWorkflow } from "./sync_init.ts";
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
      if (branch === "invalid-branch") {
        return Promise.resolve(
          Result.error(createVersionControlCommandFailedError("Invalid branch name")),
        );
      }
      return Promise.resolve(Result.ok(undefined));
    },
    push: (
      _cwd: string,
      _remote: string,
      _branch: string,
      _options?: { force?: boolean },
    ): Promise<Result<string, VersionControlError>> => {
      calls.push("push");
      return Promise.resolve(Result.ok("Everything up-to-date\n"));
    },
    getCurrentBranch: (_cwd: string): Promise<Result<string, VersionControlError>> => {
      calls.push("getCurrentBranch");
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
    pull: (
      _cwd: string,
      _remote: string,
      _branch: string,
    ): Promise<Result<string, VersionControlError>> => {
      calls.push("pull");
      return Promise.resolve(Result.ok("Already up to date.\n"));
    },
    hasUncommittedChanges: (_cwd: string): Promise<Result<boolean, VersionControlError>> => {
      calls.push("hasUncommittedChanges");
      return Promise.resolve(Result.ok(false));
    },
    getRemoteDefaultBranch: (
      _cwd: string,
      _remote: string,
    ): Promise<Result<string, VersionControlError>> => {
      calls.push("getRemoteDefaultBranch");
      return Promise.resolve(Result.ok("main"));
    },
    hasChangesInPath: (
      _cwd: string,
      _fromRef: string,
      _toRef: string,
      _path: string,
    ): Promise<Result<boolean, VersionControlError>> => {
      calls.push("hasChangesInPath");
      return Promise.resolve(Result.ok(false));
    },
    getCalls: () => calls,
  };
};

const mockWorkspaceRepo = () => {
  const tzResult = timezoneIdentifierFromString("UTC");
  if (tzResult.type === "error") throw new Error("Invalid tz");

  let settings = createWorkspaceSettings({
    timezone: tzResult.value,
    sync: {
      vcs: "git",
      enabled: false,
      syncMode: "auto-commit",
      git: { remote: null, branch: "main" },
    },
  });

  return {
    load: () => Promise.resolve(Result.ok(settings)),
    save: (_root: string, s: WorkspaceSettings) => {
      settings = s;
      return Promise.resolve(Result.ok(undefined));
    },
    // unused
    list: () => Promise.resolve(Result.ok([])),
    exists: () => Promise.resolve(Result.ok(true)),
    create: () => Promise.resolve(Result.ok(undefined)),
    pathFor: (_name: string) => "path",

    getSettings: () => settings,
  };
};

Deno.test("SyncInitWorkflow success flow", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo();
  const files: Record<string, string> = {};

  const writeFile = (path: string, content: string) => {
    files[path] = content;
    return Promise.resolve();
  };
  const readFile = (path: string) => Promise.resolve(files[path] || "");
  const fileExists = () => Promise.resolve(false); // .gitignore doesn't exist

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://git.com/repo.git",
    branch: "dev",
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile,
    readFile,
    fileExists,
  });

  if (result.type !== "ok") {
    throw new Error(`failed: ${JSON.stringify(result)}`);
  }

  // Verify Config
  const settings = repo.getSettings();
  assertEquals(settings.data.sync.enabled, true);
  assertEquals(settings.data.sync.git?.remote, "https://git.com/repo.git");
  assertEquals(settings.data.sync.git?.branch, "dev");

  // Verify Files
  const gitignore = files["/ws/.gitignore"];
  if (!gitignore) throw new Error("gitignore not created");
  assertEquals(gitignore.includes(".state.json"), true);

  // Verify Git Calls
  const calls = git.getCalls();
  assertEquals(calls.includes("validateBranch:dev"), true);
  assertEquals(calls.includes("init"), true);
  assertEquals(calls.includes("remote:https://git.com/repo.git"), true);
  assertEquals(calls.some((c) => c.startsWith("commit:")), true);
});

Deno.test("SyncInitWorkflow appends to .gitignore if exists", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo();
  const files: Record<string, string> = {
    "/ws/.gitignore": "existing\n",
  };
  const writeFile = (path: string, content: string) => {
    files[path] = content;
    return Promise.resolve();
  };
  const readFile = (path: string) => Promise.resolve(files[path] || "");
  const fileExists = (path: string) => Promise.resolve(!!files[path]);

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://git.com/repo.git",
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile,
    readFile,
    fileExists,
  });
  assertEquals(result.type, "ok");

  const gitignore = files["/ws/.gitignore"];
  assertEquals(gitignore.includes("existing"), true);
  assertEquals(gitignore.includes(".state.json"), true);

  const calls = git.getCalls();
  // No branch specified, should call getCurrentBranch instead of validateBranch
  assertEquals(calls.includes("getCurrentBranch"), true);
});

Deno.test("SyncInitWorkflow fails on invalid URL", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo();

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "ftp://invalid.url",
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });

  // const calls = git.getCalls();
  // assertEquals(calls.includes("validateBranch:main"), true); // URL check happens before branch check
  assertEquals(result.type, "error", "Should fail on invalid URL");
  if (result.type === "error") {
    // Should be ValidationError
    assertEquals(result.error.kind, "ValidationError");
    assertEquals(result.error.message.includes("Valid URL"), false); // Message is specific about what is invalid
  }
});

Deno.test("SyncInitWorkflow allows ssh URL", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo();

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "git@github.com:user/repo.git", // scp-like
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });
  assertEquals(result.type, "ok");
  // No branch specified, should call getCurrentBranch instead of validateBranch
  assertEquals(git.getCalls().includes("getCurrentBranch"), true);
  assertEquals(git.getCalls().includes("remote:git@github.com:user/repo.git"), true);

  git.getCalls().length = 0; // Clear calls for the next execution

  const result2 = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "ssh://git@github.com/user/repo.git", // ssh:// scheme
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });
  assertEquals(result2.type, "ok");
  // No branch specified, should call getCurrentBranch instead of validateBranch
  assertEquals(git.getCalls().includes("getCurrentBranch"), true);
  assertEquals(git.getCalls().includes("remote:ssh://git@github.com/user/repo.git"), true);
});

Deno.test("SyncInitWorkflow fails on invalid branch", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo();

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://host/repo",
    branch: "invalid-branch",
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });
  assertEquals(result.type, "error");
  if (result.type === "error") {
    // Should be ValidationError
    assertEquals(result.error.kind, "ValidationError");
    // ValidationError message is generic, issues are specific
    assertEquals(result.error.toString().includes("Invalid branch name"), true);
  }
  const calls = git.getCalls();
  assertEquals(calls.includes("validateBranch:invalid-branch"), true);
  assertEquals(calls.includes("init"), false); // Should fail before init
});

Deno.test("SyncInitWorkflow returns git error when validation fails with generic system error", async () => {
  const git = mockVersionControlService();
  git.validateBranchName = ((_cwd: string, _branch: string) =>
    Promise.resolve(
      Result.error(createVersionControlCommandFailedError("fatal: ambiguous argument")),
    )) as unknown as typeof git.validateBranchName;

  const repo = mockWorkspaceRepo();
  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://url",
    branch: "main", // Explicitly specify branch to trigger validation
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });

  assertEquals(result.type, "error", "Should error");
  if (result.type === "error") {
    // Should be VersionControlError
    assertEquals(result.error.kind, "VersionControlCommandFailedError");
  }
});

Deno.test("SyncInitWorkflow ensures critical .gitignore entries even if file exists", async () => {
  const git = mockVersionControlService();
  const repo = mockWorkspaceRepo();
  const files: Record<string, string> = {
    "/ws/.gitignore": "existing\n.state.json\n",
  };

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://git.com/repo.git",
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: (path, c) => {
      files[path] = c;
      return Promise.resolve();
    },
    readFile: (path) => Promise.resolve(files[path]),
    fileExists: () => Promise.resolve(true),
  });
  assertEquals(result.type, "ok");

  const content = files["/ws/.gitignore"];
  assertEquals(content.includes(".state.json"), true);
  assertEquals(content.includes("# mm missing entries"), true);
  assertEquals(content.includes(".DS_Store"), true);

  const calls = git.getCalls();
  // No branch specified, should call getCurrentBranch instead of validateBranch
  assertEquals(calls.includes("getCurrentBranch"), true);
});

Deno.test("SyncInitWorkflow handles nothing to commit gracefully", async () => {
  const git = mockVersionControlService();
  // Explicitly cast the function to match the interface, effectively overriding the mock type
  git.commit = (() =>
    Promise.resolve(
      Result.error(createVersionControlCommandFailedError("nothing to commit, working tree clean")),
    )) as unknown as typeof git.commit;

  const repo = mockWorkspaceRepo();

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://git.com/repo.git",
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });

  assertEquals(result.type, "ok", "Should succeed even if nothing to commit");
  const calls = git.getCalls();
  // No branch specified, should call getCurrentBranch instead of validateBranch
  assertEquals(calls.includes("getCurrentBranch"), true);
});

Deno.test("SyncInitWorkflow returns git error when Git is not installed during validation", async () => {
  const git = mockVersionControlService();
  // Override validateBranchName to return specific "Git is not installed" error
  git.validateBranchName = ((_cwd: string, _branch: string) =>
    Promise.resolve(
      Result.error(
        createVersionControlCommandFailedError("Git is not installed or not in the PATH"),
      ),
    )) as unknown as typeof git.validateBranchName;

  const repo = mockWorkspaceRepo();

  const result = await SyncInitWorkflow.execute({
    workspaceRoot: "/ws",
    remoteUrl: "https://git.com/repo.git",
    branch: "main", // Explicitly specify branch to trigger validation
  }, {
    gitService: git,
    workspaceRepository: repo as unknown as WorkspaceRepository,
    writeFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
  });

  assertEquals(result.type, "error");
  if (result.type === "error") {
    // Should be VersionControlError
    assertEquals(result.error.kind, "VersionControlCommandFailedError");
    assertEquals(result.error.message.includes("Git is not installed"), true);
  }
});
