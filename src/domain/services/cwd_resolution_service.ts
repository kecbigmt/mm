import { Result } from "../../shared/result.ts";
import { formatDateStringForTimezone } from "../../shared/timezone_format.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import {
  createDirectory,
  Directory,
  parseCalendarDay,
  parseDirectory,
  TimezoneIdentifier,
} from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { SessionRepository } from "../repositories/session_repository.ts";
import { Item } from "../models/item.ts";

export type CwdResolutionError = ValidationError<"CwdResolution"> | RepositoryError;

export type CwdResolutionDependencies = Readonly<{
  readonly sessionRepository: SessionRepository;
  readonly workspacePath: string;
  readonly itemRepository: ItemRepository;
  readonly timezone: TimezoneIdentifier;
}>;

export type CwdValidationDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
}>;

export type CwdSaveDependencies = Readonly<{
  readonly sessionRepository: SessionRepository;
  readonly workspacePath: string;
}>;

export type CwdResult = Readonly<{
  readonly directory: Directory;
  readonly warning?: string;
}>;

/**
 * Creates a directory for today's date in the given timezone.
 * This is the "home" directory, matching bash cd behavior.
 */
const createTodayDirectory = (
  now: Date,
  timezone: TimezoneIdentifier,
): Result<Directory, ValidationError<"CwdResolution">> => {
  const dateStr = formatDateStringForTimezone(now, timezone);
  const calendarDayResult = parseCalendarDay(dateStr);
  if (calendarDayResult.type === "error") {
    return Result.error(
      createValidationError("CwdResolution", [
        createValidationIssue("Failed to parse today's date", {
          code: "invalid_date",
          path: ["value"],
        }),
      ]),
    );
  }
  return Result.ok(createDirectory({ kind: "date", date: calendarDayResult.value }, []));
};

const defaultCwdDirectory = (now: Date, timezone: TimezoneIdentifier): Directory => {
  const result = createTodayDirectory(now, timezone);
  if (result.type === "error") {
    throw new Error("Failed to create default CWD directory: invalid date");
  }
  return result.value;
};

const resolveDirectoryToItem = async (
  directory: Directory,
  deps: CwdValidationDependencies,
): Promise<Item | undefined> => {
  if (directory.head.kind === "date" || directory.head.kind === "permanent") {
    return undefined;
  }

  const loadResult = await deps.itemRepository.load(directory.head.id);
  if (loadResult.type === "ok" && loadResult.value) {
    return loadResult.value;
  }

  return undefined;
};

export const CwdResolutionService = {
  /**
   * Creates a directory for today's date in the given timezone.
   * This is the "home" directory, matching bash cd behavior.
   */
  createTodayDirectory,

  async getCwd(
    deps: CwdResolutionDependencies,
  ): Promise<Result<CwdResult, CwdResolutionError>> {
    const now = new Date();

    const sessionResult = await deps.sessionRepository.load();
    if (sessionResult.type === "error") {
      return sessionResult;
    }

    const session = sessionResult.value;

    // No session or workspace mismatch -> default to today
    if (!session || session.workspace !== deps.workspacePath) {
      return Result.ok({ directory: defaultCwdDirectory(now, deps.timezone) });
    }

    const parseResult = parseDirectory(session.cwd);
    if (parseResult.type === "error") {
      return Result.ok({
        directory: defaultCwdDirectory(now, deps.timezone),
        warning: `Invalid cwd value "${session.cwd}" in session, falling back to today`,
      });
    }

    const directory = parseResult.value;

    if (directory.head.kind === "item") {
      const item = await resolveDirectoryToItem(directory, deps);
      if (item === undefined) {
        return Result.ok({
          directory: defaultCwdDirectory(now, deps.timezone),
          warning: `Item in session cwd not found, falling back to today`,
        });
      }
    }

    return Result.ok({ directory });
  },

  async setCwd(
    directory: Directory,
    deps: CwdSaveDependencies,
    previousDirectory?: Directory,
  ): Promise<Result<void, CwdResolutionError>> {
    const previousCwd = previousDirectory?.toString();

    const saveResult = await deps.sessionRepository.save({
      workspace: deps.workspacePath,
      cwd: directory.toString(),
      previousCwd,
    });
    return saveResult;
  },

  async getPreviousCwd(
    deps: CwdResolutionDependencies,
  ): Promise<Result<Directory, CwdResolutionError>> {
    const sessionResult = await deps.sessionRepository.load();
    if (sessionResult.type === "error") {
      return sessionResult;
    }

    const session = sessionResult.value;

    if (!session || session.workspace !== deps.workspacePath || !session.previousCwd) {
      return Result.error(
        createValidationError("CwdResolution", [
          createValidationIssue("no previous directory", {
            code: "no_previous",
            path: ["value"],
          }),
        ]),
      );
    }

    const parseResult = parseDirectory(session.previousCwd);
    if (parseResult.type === "error") {
      return Result.error(
        createValidationError("CwdResolution", [
          createValidationIssue("previous directory is invalid", {
            code: "invalid_previous",
            path: ["value"],
          }),
        ]),
      );
    }

    const directory = parseResult.value;

    // Validate item-backed directories to avoid navigating to deleted items
    if (directory.head.kind === "item") {
      const item = await resolveDirectoryToItem(directory, deps);
      if (item === undefined) {
        return Result.error(
          createValidationError("CwdResolution", [
            createValidationIssue("previous directory references a deleted item", {
              code: "invalid_previous",
              path: ["value"],
            }),
          ]),
        );
      }
    }

    return Result.ok(directory);
  },

  async validateDirectory(
    target: Directory,
    deps: CwdValidationDependencies,
  ): Promise<Result<Directory, CwdResolutionError>> {
    if (target.head.kind === "date" || target.head.kind === "permanent") {
      return Result.ok(target);
    }

    const item = await resolveDirectoryToItem(target, deps);
    if (item === undefined) {
      return Result.error(
        createValidationError("CwdResolution", [
          createValidationIssue("target directory does not resolve to a valid item", {
            code: "invalid_target",
            path: ["value"],
          }),
        ]),
      );
    }

    return Result.ok(target);
  },
};
