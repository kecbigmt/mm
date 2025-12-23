import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  parseTimezoneIdentifier,
  TimezoneIdentifier,
  TimezoneIdentifierValidationError,
} from "../primitives/mod.ts";

const WORKSPACE_SETTINGS_KIND = "WorkspaceSettings" as const;

export type VersionControlSyncMode = "auto-commit" | "auto-sync";

export type VcsType = "git";

export type GitSyncSettings = Readonly<{
  remote: string | null;
  branch?: string;
}>;

export type GitSyncSettingsSnapshot = Readonly<{
  remote: string | null;
  branch?: string;
}>;

export type SyncSettings = Readonly<{
  vcs: VcsType;
  enabled: boolean;
  mode: VersionControlSyncMode;
  git: GitSyncSettings | null;
}>;

export type SyncSettingsSnapshot = Readonly<{
  vcs: string;
  enabled: boolean;
  mode: string;
  git?: GitSyncSettingsSnapshot | null;
}>;

export type WorkspaceSettingsData = Readonly<{
  readonly timezone: TimezoneIdentifier;
  readonly sync: SyncSettings;
}>;

export type WorkspaceSettings = Readonly<{
  readonly kind: typeof WORKSPACE_SETTINGS_KIND;
  readonly data: WorkspaceSettingsData;
  toJSON(): WorkspaceSettingsSnapshot;
}>;

export type WorkspaceSettingsSnapshot = Readonly<{
  readonly timezone: string;
  readonly sync?: SyncSettingsSnapshot;
}>;

export type WorkspaceSettingsValidationError = ValidationError<typeof WORKSPACE_SETTINGS_KIND>;

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  vcs: "git",
  enabled: false,
  mode: "auto-commit",
  git: null,
};

const instantiate = (data: WorkspaceSettingsData): WorkspaceSettings => {
  const frozen = Object.freeze({
    timezone: data.timezone,
    sync: Object.freeze({
      vcs: data.sync.vcs,
      enabled: data.sync.enabled,
      mode: data.sync.mode,
      git: data.sync.git ? Object.freeze({ ...data.sync.git }) : null,
    }),
  });
  return Object.freeze({
    kind: WORKSPACE_SETTINGS_KIND,
    data: frozen,
    toJSON() {
      const gitSnapshot: GitSyncSettingsSnapshot | null = frozen.sync.git
        ? (frozen.sync.git.branch !== undefined
          ? {
            remote: frozen.sync.git.remote,
            branch: frozen.sync.git.branch,
          }
          : {
            remote: frozen.sync.git.remote,
          })
        : null;

      const syncSnapshot: SyncSettingsSnapshot = {
        vcs: frozen.sync.vcs,
        enabled: frozen.sync.enabled,
        mode: frozen.sync.mode,
        git: gitSnapshot,
      };

      return Object.freeze({
        timezone: frozen.timezone.toString(),
        sync: Object.freeze(syncSnapshot),
      });
    },
  });
};

const prefixIssues = (
  field: string,
  error: TimezoneIdentifierValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createWorkspaceSettings = (
  data: WorkspaceSettingsData,
): WorkspaceSettings => instantiate(data);

export const parseWorkspaceSettings = (
  snapshot: WorkspaceSettingsSnapshot,
): Result<WorkspaceSettings, WorkspaceSettingsValidationError> => {
  const timezoneResult = parseTimezoneIdentifier(snapshot.timezone);
  if (timezoneResult.type === "error") {
    const issues = prefixIssues("timezone", timezoneResult.error);
    return Result.error(createValidationError(WORKSPACE_SETTINGS_KIND, issues));
  }

  let syncSettings = DEFAULT_SYNC_SETTINGS;
  if (snapshot.sync) {
    const mode: VersionControlSyncMode = snapshot.sync.mode === "auto-sync"
      ? "auto-sync"
      : "auto-commit";

    let gitSyncSettings: GitSyncSettings | null = null;
    if (snapshot.sync.git) {
      gitSyncSettings = {
        remote: typeof snapshot.sync.git.remote === "string" ? snapshot.sync.git.remote : null,
        branch: typeof snapshot.sync.git.branch === "string" && snapshot.sync.git.branch !== ""
          ? snapshot.sync.git.branch
          : undefined,
      };
    }

    syncSettings = {
      vcs: "git", // Currently only git is supported
      enabled: typeof snapshot.sync.enabled === "boolean" ? snapshot.sync.enabled : false,
      mode: mode,
      git: gitSyncSettings,
    };
  }

  return Result.ok(instantiate({ timezone: timezoneResult.value, sync: syncSettings }));
};
