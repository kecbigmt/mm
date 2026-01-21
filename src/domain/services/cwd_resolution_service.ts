import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createPlacement, parseCalendarDay, parsePlacement, Placement } from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { Item } from "../models/item.ts";

export type CwdResolutionError = ValidationError<"CwdResolution"> | RepositoryError;

export type CwdResolutionDependencies = Readonly<{
  readonly getEnv: (name: string) => string | undefined;
  readonly itemRepository: ItemRepository;
}>;

export type CwdValidationDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
}>;

export type CwdResult = Readonly<{
  readonly placement: Placement;
  readonly warning?: string;
}>;

const ENV_VAR_NAME = "MM_CWD";

const defaultCwdPlacement = (today: Date): Placement => {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;
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
    today: Date,
  ): Promise<Result<CwdResult, CwdResolutionError>> {
    const envValue = deps.getEnv(ENV_VAR_NAME);

    if (!envValue || envValue.trim() === "") {
      return Result.ok({ placement: defaultCwdPlacement(today) });
    }

    const parseResult = parsePlacement(envValue);
    if (parseResult.type === "error") {
      return Result.ok({
        placement: defaultCwdPlacement(today),
        warning: `Invalid ${ENV_VAR_NAME} value "${envValue}", falling back to today`,
      });
    }

    const placement = parseResult.value;

    if (placement.head.kind === "item") {
      const item = await resolvePlacementToItem(placement, deps);
      if (item === undefined) {
        return Result.ok({
          placement: defaultCwdPlacement(today),
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
