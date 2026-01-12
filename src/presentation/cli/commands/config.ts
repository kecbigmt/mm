import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import {
  createWorkspaceSettings,
  DEFAULT_AUTO_SYNC_SETTINGS,
  DEFAULT_LAZY_SYNC_SETTINGS,
  VersionControlSyncMode,
  WorkspaceSettings,
} from "../../../domain/models/workspace.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";

// Note: sync.vcs is intentionally excluded because it's always "git" and cannot be changed.
// Including it would confuse users since it's not configurable.
type ConfigKey =
  | "timezone"
  | "sync.enabled"
  | "sync.mode"
  | "sync.git.remote"
  | "sync.git.branch"
  | "sync.lazy.commits"
  | "sync.lazy.minutes";

const VALID_KEYS: ConfigKey[] = [
  "timezone",
  "sync.enabled",
  "sync.mode",
  "sync.git.remote",
  "sync.git.branch",
  "sync.lazy.commits",
  "sync.lazy.minutes",
];

function isValidKey(key: string): key is ConfigKey {
  return VALID_KEYS.includes(key as ConfigKey);
}

function getValueByKey(
  settings: WorkspaceSettings,
  key: ConfigKey,
): string | boolean | number | null | undefined {
  const data = settings.data;
  // Use auto-sync defaults for auto-sync mode, lazy-sync defaults for explicit lazy settings
  const defaultSettings = data.sync.lazy ? DEFAULT_LAZY_SYNC_SETTINGS : DEFAULT_AUTO_SYNC_SETTINGS;
  switch (key) {
    case "timezone":
      return data.timezone.toString();
    case "sync.enabled":
      return data.sync.enabled;
    case "sync.mode":
      return data.sync.mode;
    case "sync.git.remote":
      return data.sync.git?.remote ?? null;
    case "sync.git.branch":
      return data.sync.git?.branch;
    case "sync.lazy.commits":
      return data.sync.lazy?.commits ?? defaultSettings.commits;
    case "sync.lazy.minutes":
      return data.sync.lazy?.minutes ?? defaultSettings.minutes;
  }
}

function formatValue(value: string | boolean | number | null | undefined): string {
  if (value === null) return "(not set)";
  if (value === undefined) return "(not set)";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toString();
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
    console.log(`  ${key}: ${formatValue(value)}`);
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

      const depsResult = await loadCliDependencies();
      if (depsResult.type === "error") {
        console.error(formatError(depsResult.error, debug));
        Deno.exit(1);
      }

      const { root, workspaceRepository, versionControlService, stateRepository } =
        depsResult.value;
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
            if (value !== "auto-commit" && value !== "auto-sync" && value !== "lazy-sync") {
              console.error(
                `Invalid value for sync.mode: must be 'auto-commit' or 'auto-sync'`,
              );
              Deno.exit(1);
            }
            // lazy-sync is now an alias for auto-sync (backward compatibility)
            const mode: VersionControlSyncMode = value === "lazy-sync" ? "auto-sync" : value;
            // When setting lazy-sync, also set default lazy settings if not already configured
            let lazy = currentData.sync.lazy;
            if (value === "lazy-sync" && !lazy) {
              lazy = DEFAULT_LAZY_SYNC_SETTINGS;
            }
            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                mode,
                lazy,
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

          case "sync.lazy.commits": {
            const commits = parseInt(value, 10);
            if (isNaN(commits) || commits < 1) {
              console.error(`Invalid value for sync.lazy.commits: must be a positive integer`);
              Deno.exit(1);
            }
            const currentLazy = currentData.sync.lazy ?? DEFAULT_LAZY_SYNC_SETTINGS;
            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                lazy: {
                  ...currentLazy,
                  commits,
                },
              },
            });
            break;
          }

          case "sync.lazy.minutes": {
            const minutes = parseInt(value, 10);
            if (isNaN(minutes) || minutes < 0) {
              console.error(
                `Invalid value for sync.lazy.minutes: must be a non-negative integer (0 disables time threshold)`,
              );
              Deno.exit(1);
            }
            const currentLazy = currentData.sync.lazy ?? DEFAULT_LAZY_SYNC_SETTINGS;
            newSettings = createWorkspaceSettings({
              timezone: currentData.timezone,
              sync: {
                ...currentData.sync,
                lazy: {
                  ...currentLazy,
                  minutes,
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
            stateRepository,
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
