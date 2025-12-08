import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createWorkspaceSettings } from "../models/workspace.ts";

export type SyncInitInput = {
  workspaceRoot: string;
  remoteUrl: string;
  branch?: string;
  force?: boolean;
};

export type SyncInitDependencies = {
  gitService: VersionControlService;
  workspaceRepository: WorkspaceRepository;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
};

export type SyncInitError =
  | { kind: "git"; error: VersionControlError }
  | { kind: "repository"; error: RepositoryError }
  | { kind: "validation"; message: string }
  | { kind: "fs"; message: string };

const GITIGNORE_CONTENT = `# mm local state / caches
.state.json
.index/
.tmp/

# OS/editor noise
.DS_Store
*.swp
`;

export const SyncInitWorkflow = {
  execute: async (
    input: SyncInitInput,
    deps: SyncInitDependencies,
  ): Promise<Result<void, SyncInitError>> => {
    // 0. Validate Input
    // Expanded regex to allow https, http, git, ssh, file, and scp-like syntax (git@...)
    // Also allows local paths starting with / or ./ or ../
    const validUrlRegex = /^(?:(?:https?|git|ssh|file):\/\/|git@[^:]+:|\/|\.\.?\/)/;
    if (!input.remoteUrl.match(validUrlRegex)) {
      return Result.error({ kind: "validation", message: "Invalid Git URL format" });
    }

    const branch = input.branch ?? "main";
    const branchCheck = await deps.gitService.validateBranchName(input.workspaceRoot, branch);
    // If checking fails, determine if it is a validation error or a git error
    if (branchCheck.type === "error") {
      if (branchCheck.error.message.includes("Invalid branch name")) {
        return Result.error({ kind: "validation", message: `Invalid branch name: ${branch}` });
      }
      // System error (e.g. git not installed, permission denied)
      return Result.error({ kind: "git", error: branchCheck.error });
    }

    // 1. Init Repo
    const initResult = await deps.gitService.init(input.workspaceRoot);
    if (initResult.type === "error") {
      return Result.error({ kind: "git", error: initResult.error });
    }

    // 2. Configure Remote
    const remoteResult = await deps.gitService.setRemote(
      input.workspaceRoot,
      "origin",
      input.remoteUrl,
      { force: input.force },
    );
    if (remoteResult.type === "error") {
      return Result.error({ kind: "git", error: remoteResult.error });
    }

    // 3. Update Workspace Config
    const settingsResult = await deps.workspaceRepository.load(input.workspaceRoot);
    if (settingsResult.type === "error") {
      return Result.error({ kind: "repository", error: settingsResult.error });
    }
    const currentSettings = settingsResult.value;
    const newSettings = createWorkspaceSettings({
      timezone: currentSettings.data.timezone,
      git: {
        enabled: true,
        remote: input.remoteUrl,
        branch: branch,
        syncMode: "auto-commit",
      },
    });
    const saveResult = await deps.workspaceRepository.save(input.workspaceRoot, newSettings);
    if (saveResult.type === "error") {
      return Result.error({ kind: "repository", error: saveResult.error });
    }

    // 4. Create/Update .gitignore
    const gitignorePath = `${input.workspaceRoot}/.gitignore`;
    const gitignoreExists = await deps.fileExists(gitignorePath);
    const requiredEntries = [".state.json", ".index/", ".tmp/", ".DS_Store", "*.swp"];

    let finalGitignoreContent = GITIGNORE_CONTENT;

    if (gitignoreExists) {
      const currentContent = await deps.readFile(gitignorePath);
      // If header is missing AND critical file .state.json is missing, might as well append the whole block
      if (
        !currentContent.includes("# mm local state / caches") &&
        !currentContent.includes(".state.json")
      ) {
        finalGitignoreContent = currentContent + "\n" + GITIGNORE_CONTENT;
      } else {
        // Strict check for missing entries
        const missingLines: string[] = [];
        for (const line of requiredEntries) {
          if (!currentContent.includes(line)) {
            missingLines.push(line);
          }
        }
        if (missingLines.length > 0) {
          finalGitignoreContent = currentContent + "\n# mm missing entries\n" +
            missingLines.join("\n") + "\n";
        } else {
          finalGitignoreContent = currentContent;
        }
      }
    }

    await deps.writeFile(gitignorePath, finalGitignoreContent);

    // 5. Initial Commit
    // Use "." to safely add all valid workspace files (respecting gitignore)
    const stageResult = await deps.gitService.stage(input.workspaceRoot, ["."]);
    if (stageResult.type === "error") {
      return Result.error({ kind: "git", error: stageResult.error });
    }

    const commitResult = await deps.gitService.commit(
      input.workspaceRoot,
      "mm: initialize workspace git repository",
    );
    if (commitResult.type === "error") {
      // Check if error is "nothing to commit"
      const msg = commitResult.error.message.toLowerCase();
      if (msg.includes("nothing to commit") || msg.includes("clean")) {
        // Idempotent success
      } else {
        return Result.error({ kind: "git", error: commitResult.error });
      }
    }

    return Result.ok(undefined);
  },
};
