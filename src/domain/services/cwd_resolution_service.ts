import { Result } from "../../shared/result.ts";
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
import { Item } from "../models/item.ts";

export type CwdResolutionError = ValidationError<"CwdResolution"> | RepositoryError;

export type CwdResolutionDependencies = Readonly<{
  readonly getEnv: (name: string) => string | undefined;
  readonly itemRepository: ItemRepository;
  readonly timezone: TimezoneIdentifier;
}>;

export type CwdValidationDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
}>;

export type CwdResult = Readonly<{
  readonly placement: Placement;
  readonly warning?: string;
}>;

const ENV_VAR_NAME = "MM_CWD";

/**
 * Compute today's date in the given timezone.
 */
const computeTodayInTimezone = (now: Date, timezone: TimezoneIdentifier): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
};

const defaultCwdPlacement = (now: Date, timezone: TimezoneIdentifier): Placement => {
  const dateStr = computeTodayInTimezone(now, timezone);
  const calendarDayResult = parseCalendarDay(dateStr);
  if (calendarDayResult.type === "error") {
    throw new Error("Failed to create default CWD placement: invalid date");
  }
  return createPlacement({ kind: "date", date: calendarDayResult.value }, []);
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
  async getCwd(
    deps: CwdResolutionDependencies,
  ): Promise<Result<CwdResult, CwdResolutionError>> {
    const now = new Date();
    const envValue = deps.getEnv(ENV_VAR_NAME);

    if (!envValue || envValue.trim() === "") {
      return Result.ok({ placement: defaultCwdPlacement(now, deps.timezone) });
    }

    const parseResult = parsePlacement(envValue);
    if (parseResult.type === "error") {
      return Result.ok({
        placement: defaultCwdPlacement(now, deps.timezone),
        warning: `Invalid ${ENV_VAR_NAME} value "${envValue}", falling back to today`,
      });
    }

    const placement = parseResult.value;

    if (placement.head.kind === "item") {
      const item = await resolvePlacementToItem(placement, deps);
      if (item === undefined) {
        return Result.ok({
          placement: defaultCwdPlacement(now, deps.timezone),
          warning: `Item in ${ENV_VAR_NAME} not found, falling back to today`,
        });
      }
    }

    return Result.ok({ placement });
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
