import { Result } from "../../shared/result.ts";
import { VersionControlError, VersionControlService } from "../services/version_control_service.ts";
import { WorkspaceRepository } from "../repositories/workspace_repository.ts";
import { createRepositoryError, RepositoryError } from "../repositories/repository_error.ts";
import { createWorkspaceSettings } from "../models/workspace.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";

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
  | VersionControlError
  | RepositoryError
  | ValidationError<string>;

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
    const validUrlRegex = /^(?:(?:https?|git|ssh|file):\/\/|git@[^:]+:|\/|\.\.?\/)/;
    if (!input.remoteUrl.match(validUrlRegex)) {
      return Result.error(createValidationError("SyncInitInput", [
        { message: "Invalid Git URL format", path: ["remoteUrl"] },
      ]));
    }

    // Validate branch name if provided
    if (input.branch) {
      const branchCheck = await deps.gitService.validateBranchName(
        input.workspaceRoot,
        input.branch,
      );
      if (branchCheck.type === "error") {
        if (branchCheck.error.message.includes("Invalid branch name")) {
          return Result.error(createValidationError("SyncInitInput", [
            { message: `Invalid branch name: ${input.branch}`, path: ["branch"] },
          ]));
        }
        return Result.error(branchCheck.error);
      }
    }

    // 1. Init Repo
    const initResult = await deps.gitService.init(input.workspaceRoot);
    if (initResult.type === "error") {
      return Result.error(initResult.error);
    }

    // 2. Handle branch
    let actualBranch: string;
    if (input.branch) {
      // Branch specified: checkout or create
      const checkoutResult = await deps.gitService.checkoutBranch(
        input.workspaceRoot,
        input.branch,
        true, // create if not exists
      );
      if (checkoutResult.type === "error") {
        return Result.error(checkoutResult.error);
      }
      actualBranch = input.branch;
    } else {
      // No branch specified: use current branch
      const currentBranchResult = await deps.gitService.getCurrentBranch(input.workspaceRoot);
      if (currentBranchResult.type === "error") {
        return Result.error(currentBranchResult.error);
      }
      actualBranch = currentBranchResult.value;
    }

    // 3. Configure Remote
    const remoteResult = await deps.gitService.setRemote(
      input.workspaceRoot,
      "origin",
      input.remoteUrl,
      { force: input.force },
    );
    if (remoteResult.type === "error") {
      return Result.error(remoteResult.error);
    }

    // 4. Update Workspace Config
    const settingsResult = await deps.workspaceRepository.load(input.workspaceRoot);
    if (settingsResult.type === "error") {
      return Result.error(settingsResult.error);
    }
    const currentSettings = settingsResult.value;
    const newSettings = createWorkspaceSettings({
      timezone: currentSettings.data.timezone,
      git: {
        enabled: true,
        remote: input.remoteUrl,
        branch: actualBranch,
        syncMode: "auto-commit",
      },
    });
    const saveResult = await deps.workspaceRepository.save(input.workspaceRoot, newSettings);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }

    // 5. Create/Update .gitignore
    const gitignorePath = `${input.workspaceRoot}/.gitignore`;
    try {
      const gitignoreExists = await deps.fileExists(gitignorePath);
      const requiredEntries = [".state.json", ".index/", ".tmp/", ".DS_Store", "*.swp"];

      let finalGitignoreContent = GITIGNORE_CONTENT;

      if (gitignoreExists) {
        const currentContent = await deps.readFile(gitignorePath);
        if (
          !currentContent.includes("# mm local state / caches") &&
          !currentContent.includes(".state.json")
        ) {
          finalGitignoreContent = currentContent + "\n" + GITIGNORE_CONTENT;
        } else {
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
    } catch (e) {
      return Result.error(createRepositoryError(
        "workspace",
        "ensure",
        "Failed to create .gitignore",
        { cause: e },
      ));
    }

    // 6. Initial Commit
    const stageResult = await deps.gitService.stage(input.workspaceRoot, ["."]);
    if (stageResult.type === "error") {
      return Result.error(stageResult.error);
    }

    const commitResult = await deps.gitService.commit(
      input.workspaceRoot,
      "mm: initialize workspace git repository",
    );
    if (commitResult.type === "error") {
      const msg = commitResult.error.message.toLowerCase();
      if (msg.includes("nothing to commit") || msg.includes("clean")) {
        // Idempotent success
      } else {
        return Result.error(commitResult.error);
      }
    }

    return Result.ok(undefined);
  },
};
