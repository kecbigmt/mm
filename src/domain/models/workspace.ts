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

export type WorkspaceSettingsData = Readonly<{
  readonly timezone: TimezoneIdentifier;
}>;

export type WorkspaceSettings = Readonly<{
  readonly kind: typeof WORKSPACE_SETTINGS_KIND;
  readonly data: WorkspaceSettingsData;
  toJSON(): WorkspaceSettingsSnapshot;
}>;

export type WorkspaceSettingsSnapshot = Readonly<{
  readonly timezone: string;
}>;

export type WorkspaceSettingsValidationError = ValidationError<typeof WORKSPACE_SETTINGS_KIND>;

const instantiate = (data: WorkspaceSettingsData): WorkspaceSettings => {
  const frozen = Object.freeze({ timezone: data.timezone });
  return Object.freeze({
    kind: WORKSPACE_SETTINGS_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({ timezone: frozen.timezone.toString() });
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

  return Result.ok(instantiate({ timezone: timezoneResult.value }));
};
