import { Result } from "../../shared/result.ts";
import { formatDateStringForTimezone } from "../../shared/timezone_format.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import {
  createPlacement,
  parseCalendarDay,
  parsePlacement,
  Placement,
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
  readonly placement: Placement;
  readonly warning?: string;
}>;

/**
 * Creates a placement for today's date in the given timezone.
 * This is the "home" placement, matching bash cd behavior.
 */
const createTodayPlacement = (
  now: Date,
  timezone: TimezoneIdentifier,
): Result<Placement, ValidationError<"CwdResolution">> => {
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
  return Result.ok(createPlacement({ kind: "date", date: calendarDayResult.value }, []));
};

const defaultCwdPlacement = (now: Date, timezone: TimezoneIdentifier): Placement => {
  const result = createTodayPlacement(now, timezone);
  if (result.type === "error") {
    throw new Error("Failed to create default CWD placement: invalid date");
  }
  return result.value;
};

const resolvePlacementToItem = async (
  placement: Placement,
  deps: CwdValidationDependencies,
): Promise<Item | undefined> => {
  if (placement.head.kind === "date" || placement.head.kind === "permanent") {
    return undefined;
  }

  const loadResult = await deps.itemRepository.load(placement.head.id);
  if (loadResult.type === "ok" && loadResult.value) {
    return loadResult.value;
  }

  return undefined;
};

export const CwdResolutionService = {
  /**
   * Creates a placement for today's date in the given timezone.
   * This is the "home" placement, matching bash cd behavior.
   */
  createTodayPlacement,

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
      return Result.ok({ placement: defaultCwdPlacement(now, deps.timezone) });
    }

    const parseResult = parsePlacement(session.cwd);
    if (parseResult.type === "error") {
      return Result.ok({
        placement: defaultCwdPlacement(now, deps.timezone),
        warning: `Invalid cwd value "${session.cwd}" in session, falling back to today`,
      });
    }

    const placement = parseResult.value;

    if (placement.head.kind === "item") {
      const item = await resolvePlacementToItem(placement, deps);
      if (item === undefined) {
        return Result.ok({
          placement: defaultCwdPlacement(now, deps.timezone),
          warning: `Item in session cwd not found, falling back to today`,
        });
      }
    }

    return Result.ok({ placement });
  },

  async setCwd(
    placement: Placement,
    deps: CwdSaveDependencies,
    previousPlacement?: Placement,
  ): Promise<Result<void, CwdResolutionError>> {
    const previousCwd = previousPlacement?.toString();

    const saveResult = await deps.sessionRepository.save({
      workspace: deps.workspacePath,
      cwd: placement.toString(),
      previousCwd,
    });
    return saveResult;
  },

  async getPreviousCwd(
    deps: CwdResolutionDependencies,
  ): Promise<Result<Placement, CwdResolutionError>> {
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

    const parseResult = parsePlacement(session.previousCwd);
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

    const placement = parseResult.value;

    // Validate item-backed placements to avoid navigating to deleted items
    if (placement.head.kind === "item") {
      const item = await resolvePlacementToItem(placement, deps);
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

    return Result.ok(placement);
  },

  async validatePlacement(
    target: Placement,
    deps: CwdValidationDependencies,
  ): Promise<Result<Placement, CwdResolutionError>> {
    if (target.head.kind === "date" || target.head.kind === "permanent") {
      return Result.ok(target);
    }

    const item = await resolvePlacementToItem(target, deps);
    if (item === undefined) {
      return Result.error(
        createValidationError("CwdResolution", [
          createValidationIssue("target placement does not resolve to a valid item", {
            code: "invalid_target",
            path: ["value"],
          }),
        ]),
      );
    }

    return Result.ok(target);
  },
};
