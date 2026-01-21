import { Command } from "@cliffy/command";
import { bold } from "@std/fmt/colors";
import { Result } from "../../../shared/result.ts";
import { resolveMmHome } from "../dependencies.ts";
import { workspaceNameFromString } from "../../../domain/primitives/workspace_name.ts";
import { createFileSystemConfigRepository } from "../../../infrastructure/fileSystem/config_repository.ts";
import { createFileSystemWorkspaceRepository } from "../../../infrastructure/fileSystem/workspace_repository.ts";
import { parseTimezoneIdentifier } from "../../../domain/primitives/timezone_identifier.ts";
import { CliDependencyError } from "../dependencies.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { createGitVersionControlService } from "../../../infrastructure/git/git_client.ts";
import { WorkspaceInitRemoteWorkflow } from "../../../domain/workflows/workspace_init_remote.ts";
import { createWorkspaceScanner } from "../../../infrastructure/fileSystem/workspace_scanner.ts";
import { rebuildFromItems } from "../../../infrastructure/fileSystem/index_rebuilder.ts";
import {
  replaceIndex,
  writeAliasIndex,
  writeGraphIndex,
} from "../../../infrastructure/fileSystem/index_writer.ts";
import { Item } from "../../../domain/models/item.ts";

const reportError = (error: CliDependencyError, debug: boolean): void => {
  if (error.type === "repository") {
    console.error(formatError(error.error, debug));
  } else {
    console.error(formatError(error, debug));
  }
};

const resolveEnvironment = () => {
  const homeResult = resolveMmHome();
  if (homeResult.type === "error") {
    return Result.error(homeResult.error);
  }
  const home = homeResult.value;
  return Result.ok({
    home,
    repository: createFileSystemWorkspaceRepository({ home }),
    config: createFileSystemConfigRepository({ home }),
  });
};

const timezoneOrReport = (timezone?: string) => {
  const candidate = typeof timezone === "string" && timezone.trim().length > 0
    ? timezone.trim()
    : "UTC";
  return parseTimezoneIdentifier(candidate);
};

const formatIssues = (
  issues: ReadonlyArray<{ message: string }>,
): string => issues.map((issue) => issue.message).join(", ");

const listAction = async () => {
  const debug = isDebugMode();
  const envResult = resolveEnvironment();
  if (envResult.type === "error") {
    reportError(envResult.error, debug);
    return;
  }
  const env = envResult.value;

  const currentResult = await env.config.getCurrentWorkspace();
  if (currentResult.type === "error") {
    console.error(formatError(currentResult.error, debug));
    return;
  }
  const current = currentResult.value ?? "home";

  const listResult = await env.repository.list();
  if (listResult.type === "error") {
    console.error(formatError(listResult.error, debug));
    return;
  }

  const workspaces = listResult.value;
  if (workspaces.length === 0) {
    console.log("No workspaces found.");
    console.log("\nCreate a workspace with: mm workspace init <name>");
    return;
  }

  console.log("Workspaces:");
  for (const workspace of workspaces) {
    const name = workspace.toString();
    if (name === current) {
      console.log(`  * ${name} (current)`);
    } else {
      console.log(`    ${name}`);
    }
  }
};

/**
 * Default action for `mm workspace` with no arguments.
 * Shows hint message followed by workspace list.
 */
const defaultListAction = async () => {
  console.log(`${bold("Hint:")} Use \`mm ws -h\` for a list of available commands.`);
  console.log("");
  await listAction();
};

const rebuildIndex = async (workspaceRoot: string): Promise<void> => {
  const scanner = createWorkspaceScanner(workspaceRoot);
  const items: Item[] = [];

  for await (const result of scanner.scanAllItems()) {
    if (result.type === "ok") {
      items.push(result.value);
    }
  }

  if (items.length === 0) {
    return;
  }

  const rebuildResult = await rebuildFromItems(items);
  if (rebuildResult.type === "error") {
    console.warn(`Warning: Index rebuild failed: ${rebuildResult.error.message}`);
    return;
  }

  const { graphEdges, aliases, itemsProcessed, edgesCreated, aliasesCreated } = rebuildResult.value;

  const graphWriteResult = await writeGraphIndex(workspaceRoot, graphEdges, { temp: true });
  if (graphWriteResult.type === "error") {
    console.warn(`Warning: Failed to write graph index: ${graphWriteResult.error.message}`);
    return;
  }

  const aliasWriteResult = await writeAliasIndex(workspaceRoot, aliases, { temp: true });
  if (aliasWriteResult.type === "error") {
    console.warn(`Warning: Failed to write alias index: ${aliasWriteResult.error.message}`);
    return;
  }

  const replaceResult = await replaceIndex(workspaceRoot);
  if (replaceResult.type === "error") {
    console.warn(`Warning: Failed to replace index: ${replaceResult.error.message}`);
    return;
  }

  console.log(
    `Index rebuilt: ${itemsProcessed} items, ${edgesCreated} edges, ${aliasesCreated} aliases`,
  );
};

const initAction = async (
  options: Record<string, unknown>,
  name: string,
) => {
  const debug = isDebugMode();
  const envResult = resolveEnvironment();
  if (envResult.type === "error") {
    reportError(envResult.error, debug);
    return;
  }
  const env = envResult.value;

  const parsedName = workspaceNameFromString(name);
  if (parsedName.type === "error") {
    console.error(formatIssues(parsedName.error.issues));
    return;
  }

  const remoteUrl = typeof options.remote === "string" ? options.remote : undefined;
  const branch = typeof options.branch === "string" ? options.branch : undefined;

  // Remote mode: clone from remote repository
  if (remoteUrl) {
    const gitService = createGitVersionControlService();

    const result = await WorkspaceInitRemoteWorkflow.execute(
      {
        workspaceName: parsedName.value,
        remoteUrl,
        branch,
      },
      {
        gitService,
        workspaceRepository: env.repository,
        configRepository: env.config,
        removeDirectory: async (path) => {
          try {
            await Deno.remove(path, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        },
      },
    );

    if (result.type === "error") {
      console.error(formatError(result.error, debug));
      Deno.exit(1);
    }

    console.log(`Cloned workspace: ${parsedName.value.toString()}`);
    console.log(`Switched to workspace: ${parsedName.value.toString()}`);

    // Rebuild index
    await rebuildIndex(result.value.workspacePath);
    return;
  }

  // Local mode: create empty workspace
  const hostTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneInput = typeof options.timezone === "string" ? options.timezone : hostTimezone;
  const timezoneResult = timezoneOrReport(timezoneInput);
  if (timezoneResult.type === "error") {
    console.error(formatIssues(timezoneResult.error.issues));
    return;
  }

  const existsResult = await env.repository.exists(parsedName.value);
  if (existsResult.type === "error") {
    console.error(formatError(existsResult.error, debug));
    return;
  }
  if (existsResult.value) {
    console.error(`Workspace '${parsedName.value.toString()}' already exists.`);
    return;
  }

  const createResult = await env.repository.create(parsedName.value, timezoneResult.value);
  if (createResult.type === "error") {
    console.error(formatError(createResult.error, debug));
    return;
  }

  const setResult = await env.config.setCurrentWorkspace(parsedName.value.toString());
  if (setResult.type === "error") {
    console.error(formatError(setResult.error, debug));
    return;
  }

  console.log(`Switched to workspace: ${parsedName.value.toString()}`);
};

const useAction = async (
  name: string,
) => {
  const debug = isDebugMode();
  const envResult = resolveEnvironment();
  if (envResult.type === "error") {
    reportError(envResult.error, debug);
    return;
  }
  const env = envResult.value;

  const parsedName = workspaceNameFromString(name);
  if (parsedName.type === "error") {
    console.error(formatIssues(parsedName.error.issues));
    return;
  }

  const existsResult = await env.repository.exists(parsedName.value);
  if (existsResult.type === "error") {
    console.error(formatError(existsResult.error, debug));
    return;
  }

  let wasCreated = false;
  if (!existsResult.value) {
    const timezoneResult = timezoneOrReport();
    if (timezoneResult.type === "error") {
      console.error(formatIssues(timezoneResult.error.issues));
      return;
    }
    const createResult = await env.repository.create(parsedName.value, timezoneResult.value);
    if (createResult.type === "error") {
      console.error(formatError(createResult.error, debug));
      return;
    }
    wasCreated = true;
  }

  const setResult = await env.config.setCurrentWorkspace(parsedName.value.toString());
  if (setResult.type === "error") {
    console.error(formatError(setResult.error, debug));
    return;
  }

  if (wasCreated) {
    console.log(`Created new workspace: ${parsedName.value.toString()}`);
  }
  console.log(`Switched to workspace: ${parsedName.value.toString()}`);
};

export const createWorkspaceCommand = () =>
  new Command()
    .description("Workspace management")
    .action(defaultListAction)
    .command(
      "list",
      new Command()
        .description("List workspaces")
        .action(listAction),
    ).alias("ls")
    .command(
      "init",
      new Command()
        .description("Initialize a new workspace")
        .arguments("<name:string>")
        .option("-t, --timezone <timezone:string>", "Timezone identifier")
        .option("-r, --remote <url:string>", "Clone from remote Git repository")
        .option("-b, --branch <branch:string>", "Branch to checkout (with --remote)")
        .action(initAction),
    )
    .command(
      "use",
      new Command()
        .description("Switch to workspace")
        .arguments("<name:string>")
        .action(async (_options, name: string) => {
          await useAction(name);
        }),
    );
