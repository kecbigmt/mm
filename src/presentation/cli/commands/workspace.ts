import { Command } from "@cliffy/command";
import { Result } from "../../../shared/result.ts";
import { resolveMmHome } from "../dependencies.ts";
import { workspaceNameFromString } from "../../../domain/primitives/workspace_name.ts";
import { createFileSystemConfigRepository } from "../../../infrastructure/fileSystem/config_repository.ts";
import { createFileSystemWorkspaceRepository } from "../../../infrastructure/fileSystem/workspace_repository.ts";
import { parseTimezoneIdentifier } from "../../../domain/primitives/timezone_identifier.ts";
import { CliDependencyError } from "../dependencies.ts";

const reportError = (error: CliDependencyError): void => {
  if (error.type === "repository") {
    console.error(error.error.message);
  } else {
    console.error(error.message);
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

const workspaceNameOrReport = (
  name: string,
): ReturnType<typeof workspaceNameFromString> => workspaceNameFromString(name);

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
  const envResult = resolveEnvironment();
  if (envResult.type === "error") {
    reportError(envResult.error);
    return;
  }
  const env = envResult.value;

  const currentResult = await env.config.getCurrentWorkspace();
  if (currentResult.type === "error") {
    console.error(currentResult.error.message);
    return;
  }
  const current = currentResult.value ?? "home";

  const listResult = await env.repository.list();
  if (listResult.type === "error") {
    console.error(listResult.error.message);
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

const initAction = async (
  options: Record<string, unknown>,
  name: string,
) => {
  const envResult = resolveEnvironment();
  if (envResult.type === "error") {
    reportError(envResult.error);
    return;
  }
  const env = envResult.value;

  const parsedName = workspaceNameOrReport(name);
  if (parsedName.type === "error") {
    console.error(formatIssues(parsedName.error.issues));
    return;
  }

  const timezoneInput = typeof options.timezone === "string" ? options.timezone : undefined;
  const timezoneResult = timezoneOrReport(timezoneInput);
  if (timezoneResult.type === "error") {
    console.error(formatIssues(timezoneResult.error.issues));
    return;
  }

  const existsResult = await env.repository.exists(parsedName.value);
  if (existsResult.type === "error") {
    console.error(existsResult.error.message);
    return;
  }
  if (existsResult.value) {
    console.error(`Workspace '${parsedName.value.toString()}' already exists.`);
    return;
  }

  const createResult = await env.repository.create(parsedName.value, timezoneResult.value);
  if (createResult.type === "error") {
    console.error(createResult.error.message);
    return;
  }

  const setResult = await env.config.setCurrentWorkspace(parsedName.value.toString());
  if (setResult.type === "error") {
    console.error(setResult.error.message);
    return;
  }

  console.log(`Switched to workspace: ${parsedName.value.toString()}`);
};

const useAction = async (
  name: string,
) => {
  const envResult = resolveEnvironment();
  if (envResult.type === "error") {
    reportError(envResult.error);
    return;
  }
  const env = envResult.value;

  const parsedName = workspaceNameOrReport(name);
  if (parsedName.type === "error") {
    console.error(formatIssues(parsedName.error.issues));
    return;
  }

  const existsResult = await env.repository.exists(parsedName.value);
  if (existsResult.type === "error") {
    console.error(existsResult.error.message);
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
      console.error(createResult.error.message);
      return;
    }
    wasCreated = true;
  }

  const setResult = await env.config.setCurrentWorkspace(parsedName.value.toString());
  if (setResult.type === "error") {
    console.error(setResult.error.message);
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
