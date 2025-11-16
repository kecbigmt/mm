import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createPlacement, parseCalendarDay, Placement } from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { StateRepository } from "../repositories/state_repository.ts";
import { Item } from "../models/item.ts";

export type CwdResolutionError = ValidationError<"CwdResolution"> | RepositoryError;

export type CwdResolutionDependencies = Readonly<{
  readonly stateRepository: StateRepository;
  readonly itemRepository: ItemRepository;
}>;

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
  deps: CwdResolutionDependencies,
): Promise<Item | undefined> => {
  if (placement.head.kind === "date") {
    return undefined;
  }

  const loadResult = await deps.itemRepository.load(placement.head.id);
  if (loadResult.type === "ok" && loadResult.value) {
    return loadResult.value;
  }

  return undefined;
};

const findNearestValidAncestor = async (
  placement: Placement,
  deps: CwdResolutionDependencies,
): Promise<Placement> => {
  let current = placement;

  while (true) {
    const item = await resolvePlacementToItem(current, deps);
    if (item !== undefined) {
      return current;
    }

    const parent = current.parent();
    if (!parent) {
      break;
    }
    current = parent;
  }

  return defaultCwdPlacement(new Date());
};

export const CwdResolutionService = {
  async getCwd(
    deps: CwdResolutionDependencies,
    today: Date,
  ): Promise<Result<Placement, CwdResolutionError>> {
    const cwdResult = await deps.stateRepository.loadCwd();
    if (cwdResult.type === "error") {
      return Result.error(cwdResult.error);
    }

    const cwd = cwdResult.value;
    if (!cwd) {
      const defaultPlacement = defaultCwdPlacement(today);
      return Result.ok(defaultPlacement);
    }

    const isDatePlacement = cwd.head.kind === "date";
    if (isDatePlacement) {
      return Result.ok(cwd);
    }

    const item = await resolvePlacementToItem(cwd, deps);
    if (item === undefined) {
      const resolved = await findNearestValidAncestor(cwd, deps);
      await deps.stateRepository.saveCwd(resolved);
      return Result.ok(resolved);
    }

    return Result.ok(cwd);
  },

  async setCwd(
    target: Placement,
    deps: CwdResolutionDependencies,
  ): Promise<Result<Placement, CwdResolutionError>> {
    const isDatePlacement = target.head.kind === "date";
    if (!isDatePlacement) {
      // Validate that the item exists
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
    }

    const setResult = await deps.stateRepository.saveCwd(target);
    if (setResult.type === "error") {
      return Result.error(setResult.error);
    }

    return Result.ok(target);
  },
};
