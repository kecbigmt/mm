import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import {
  createWorkspaceSettings,
  VersionControlSyncMode,
  WorkspaceSettings,
} from "../../../domain/models/workspace.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";

type ConfigKey =
  | "timezone"
  | "sync.vcs"
  | "sync.enabled"
  | "sync.mode"
  | "sync.git.remote"
  | "sync.git.branch";

const VALID_KEYS: ConfigKey[] = [
  "timezone",
  "sync.vcs",
  "sync.enabled",
  "sync.mode",
  "sync.git.remote",
  "sync.git.branch",
];

const READ_ONLY_KEYS: ConfigKey[] = ["sync.vcs"];

function isValidKey(key: string): key is ConfigKey {
  return VALID_KEYS.includes(key as ConfigKey);
}

function isReadOnlyKey(key: ConfigKey): boolean {
  return READ_ONLY_KEYS.includes(key);
}

function getValueByKey(
  settings: WorkspaceSettings,
  key: ConfigKey,
): string | boolean | null | undefined {
  const data = settings.data;
  switch (key) {
    case "timezone":
      return data.timezone.toString();
    case "sync.vcs":
      return data.sync.vcs;
    case "sync.enabled":
      return data.sync.enabled;
    case "sync.mode":
      return data.sync.mode;
    case "sync.git.remote":
      return data.sync.git?.remote ?? null;
    case "sync.git.branch":
      return data.sync.git?.branch;
  }
}

function formatValue(value: string | boolean | null | undefined): string {
  if (value === null) return "(not set)";
  if (value === undefined) return "(not set)";
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}

async function listAllSettings(): Promise<void> {
  const debug = isDebugMode();
  const depsResult = await loadCliDependencies();
  if (depsResult.type === "error") {
    console.error(formatError(depsResult.error, debug));
    Deno.exit(1);
  }

  const { root, workspaceRepository } = depsResult.value;
  const settingsResult = await workspaceRepository.load(root);
  if (settingsResult.type === "error") {
    console.error(formatError(settingsResult.error, debug));
    Deno.exit(1);
  }

  const settings = settingsResult.value;

  console.log("Current configuration:");
  console.log();
  for (const key of VALID_KEYS) {
    const value = getValueByKey(settings, key);
    const readOnlyMarker = isReadOnlyKey(key) ? " (read-only)" : "";
    console.log(`  ${key}: ${formatValue(value)}${readOnlyMarker}`);
  }
}

export const createConfigCommand = () => {
  const listCommand = new Command()
    .description("List all configuration settings")
    .action(listAllSettings);

  const getCommand = new Command()
    .description("Get a configuration value")
    .arguments("<key:string>")
    .action(async (_options, key: string) => {
      const debug = isDebugMode();

      if (!isValidKey(key)) {
        console.error(`Unknown config key: ${key}`);
        console.error(`\nValid keys: ${VALID_KEYS.join(", ")}`);
        Deno.exit(1);
      }

      const depsResult = await loadCliDependencies();
      if (depsResult.type === "error") {
        console.error(formatError(depsResult.error, debug));
        Deno.exit(1);
      }

      const { root, workspaceRepository } = depsResult.value;
      const settingsResult = await workspaceRepository.load(root);
      if (settingsResult.type === "error") {
        console.error(formatError(settingsResult.error, debug));
        Deno.exit(1);
      }

      const settings = settingsResult.value;
      const value = getValueByKey(settings, key);
      console.log(formatValue(value));
    });

  const setCommand = new Command()
    .description("Set a configuration value")
    .arguments("<key:string> <value:string>")
    .action(async (_options, key: string, value: string) => {
      const debug = isDebugMode();

      if (!isValidKey(key)) {
        console.error(`Unknown config key: ${key}`);
        console.error(`\nValid keys: ${VALID_KEYS.join(", ")}`);
        Deno.exit(1);
      }

      if (isReadOnlyKey(key)) {
        console.error(`Cannot modify read-only key: ${key}`);
        Deno.exit(1);
      }

      const depsResult = await loadCliDependencies();
      if (depsResult.type === "error") {
        console.error(formatError(depsResult.error, debug));
        Deno.exit(1);
      }

      const { root, workspaceRepository, versionControlService } = depsResult.value;
      const settingsResult = await workspaceRepository.load(root);
      if (settingsResult.type === "error") {
        console.error(formatError(settingsResult.error, debug));
        Deno.exit(1);
      }

      const currentSettings = settingsResult.value;
      const currentData = currentSettings.data;

      let newSettings: WorkspaceSettings;

      try {
        switch (key) {
          case "timezone": {
            const { parseTimezoneIdentifier } = await import(
              "../../../domain/primitives/timezone_identifier.ts"
            );
            const tzResult = parseTimezoneIdentifier(value);
            if (tzResult.type === "error") {
              console.error(`Invalid timezone: ${value}`);
              Deno.exit(1);
            }
            newSettings = createWorkspaceSettings({
              timezone: tzResult.value,
              sync: currentData.sync,
            });
            break;
          }

          case "sync.enabled": {
            const enabled = value.toLowerCase() === "true";
            if (value.toLowerCase() !== "true" && value.toLowerCase() !== "false") {
              console.error(`Invalid value for sync.enabled: must be 'true' or 'false'`);
              Deno.exit(1);
            }

            // Check if enabling sync without remote configured
            if (enabled && !currentData.sync.git?.remote) {
              console.error(
                "Cannot enable sync: no remote configured. Run `mm sync init <remote-url>` first.",
              );
              Deno.exit(1);
            }

            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                enabled,
              },
            });
            break;
          }

          case "sync.mode": {
            if (value !== "auto-commit" && value !== "auto-sync") {
              console.error(`Invalid value for sync.mode: must be 'auto-commit' or 'auto-sync'`);
              Deno.exit(1);
            }
            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                mode: value as VersionControlSyncMode,
              },
            });
            break;
          }

          case "sync.git.remote": {
            // Check if git is initialized
            const initCheckResult = await versionControlService.getCurrentBranch(root);
            if (initCheckResult.type === "error") {
              console.error("Git is not initialized. Run `mm sync init <remote-url>` first.");
              Deno.exit(1);
            }

            // Update git remote
            const setRemoteResult = await versionControlService.setRemote(root, "origin", value, {
              force: true,
            });
            if (setRemoteResult.type === "error") {
              console.error(`Failed to update git remote: ${setRemoteResult.error.message}`);
              Deno.exit(1);
            }

            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                git: {
                  ...(currentData.sync.git ?? {}),
                  remote: value,
                },
              },
            });
            break;
          }

          case "sync.git.branch": {
            // Check if git is initialized
            const initCheckResult = await versionControlService.getCurrentBranch(root);
            if (initCheckResult.type === "error") {
              console.error("Git is not initialized. Run `mm sync init <remote-url>` first.");
              Deno.exit(1);
            }

            // Validate branch name
            const validateResult = await versionControlService.validateBranchName(root, value);
            if (validateResult.type === "error") {
              console.error(`Invalid branch name: ${validateResult.error.message}`);
              Deno.exit(1);
            }

            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                git: {
                  ...(currentData.sync.git ?? {}),
                  remote: currentData.sync.git?.remote ?? null,
                  branch: value,
                },
              },
            });
            break;
          }

          default:
            console.error(`Setting ${key} is not implemented yet`);
            Deno.exit(1);
        }
      } catch (error) {
        console.error(`Failed to update setting: ${error}`);
        Deno.exit(1);
      }

      // Save the new settings
      const saveResult = await workspaceRepository.save(root, newSettings);
      if (saveResult.type === "error") {
        console.error(formatError(saveResult.error, debug));
        Deno.exit(1);
      }

      console.log(`${key} = ${value}`);

      // Auto-commit if sync is enabled
      if (newSettings.data.sync.enabled) {
        await executeAutoCommit(
          {
            workspaceRoot: root,
            workspaceRepository,
            versionControlService,
          },
          "update workspace configuration",
        );
      }
    });

  return new Command()
    .description("View and modify workspace configuration")
    .action(listAllSettings)
    .command("list", listCommand)
    .command("get", getCommand)
    .command("set", setCommand);
};
