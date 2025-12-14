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

export type GitSettings = Readonly<{
  enabled: boolean;
  remote: string | null;
  branch?: string;
  syncMode: VersionControlSyncMode;
}>;

export type GitSettingsSnapshot = Readonly<{
  enabled: boolean;
  remote: string | null;
  branch?: string;
  sync_mode: string;
}>;

export type WorkspaceSettingsData = Readonly<{
  readonly timezone: TimezoneIdentifier;
  readonly git: GitSettings;
}>;

export type WorkspaceSettings = Readonly<{
  readonly kind: typeof WORKSPACE_SETTINGS_KIND;
  readonly data: WorkspaceSettingsData;
  toJSON(): WorkspaceSettingsSnapshot;
}>;

export type WorkspaceSettingsSnapshot = Readonly<{
  readonly timezone: string;
  readonly git?: GitSettingsSnapshot;
}>;

export type WorkspaceSettingsValidationError = ValidationError<typeof WORKSPACE_SETTINGS_KIND>;

export const DEFAULT_GIT_SETTINGS: GitSettings = {
  enabled: false,
  remote: null,
  syncMode: "auto-commit",
};

const instantiate = (data: WorkspaceSettingsData): WorkspaceSettings => {
  const frozen = Object.freeze({
    timezone: data.timezone,
    git: Object.freeze({ ...data.git }),
  });
  return Object.freeze({
    kind: WORKSPACE_SETTINGS_KIND,
    data: frozen,
    toJSON() {
      const gitSnapshot: GitSettingsSnapshot = frozen.git.branch !== undefined
        ? {
          enabled: frozen.git.enabled,
          remote: frozen.git.remote,
          branch: frozen.git.branch,
          sync_mode: frozen.git.syncMode,
        }
        : {
          enabled: frozen.git.enabled,
          remote: frozen.git.remote,
          sync_mode: frozen.git.syncMode,
        };
      return Object.freeze({
        timezone: frozen.timezone.toString(),
        git: Object.freeze(gitSnapshot),
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

  let gitSettings = DEFAULT_GIT_SETTINGS;
  if (snapshot.git) {
    const mode: VersionControlSyncMode = snapshot.git.sync_mode === "auto-sync"
      ? "auto-sync"
      : "auto-commit";
    gitSettings = {
      enabled: typeof snapshot.git.enabled === "boolean" ? snapshot.git.enabled : false,
      remote: typeof snapshot.git.remote === "string" ? snapshot.git.remote : null,
      branch: typeof snapshot.git.branch === "string" && snapshot.git.branch !== ""
        ? snapshot.git.branch
        : undefined,
      syncMode: mode,
    };
  }

  return Result.ok(instantiate({ timezone: timezoneResult.value, git: gitSettings }));
};
