import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { parsePath, Path } from "../primitives/path.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { StateRepository } from "../repositories/state_repository.ts";
import { Item } from "../models/item.ts";
import { LocatorResolutionService } from "./locator_resolution_service.ts";

export type CwdResolutionError = ValidationError<"CwdResolution"> | RepositoryError;

export type CwdResolutionDependencies = Readonly<{
  readonly stateRepository: StateRepository;
  readonly itemRepository: ItemRepository;
  readonly aliasRepository: AliasRepository;
}>;

const defaultCwdPath = (today: Date): Path => {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;
  const parsed = parsePath(`/${dateStr}`);
  if (parsed.type === "ok") {
    return parsed.value;
  }
  const rootParsed = parsePath("/");
  if (rootParsed.type === "ok") {
    return rootParsed.value;
  }
  throw new Error("Failed to create default CWD path");
};

const resolvePathToItem = async (
  path: Path,
  deps: CwdResolutionDependencies,
): Promise<Item | undefined> => {
  if (path.segments.length === 0) {
    return undefined;
  }

  const first = path.segments[0];
  if (first.kind === "ItemId") {
    const loadResult = await deps.itemRepository.load(
      first.value as import("../primitives/item_id.ts").ItemId,
    );
    if (loadResult.type === "ok" && loadResult.value) {
      return loadResult.value;
    }
  } else if (first.kind === "ItemAlias") {
    const resolveResult = await LocatorResolutionService.resolveItem(
      path.toString(),
      deps,
    );
    if (resolveResult.type === "ok" && resolveResult.value) {
      return resolveResult.value;
    }
  } else if (first.kind === "Date") {
    return undefined;
  }

  return undefined;
};

const findNearestValidAncestor = async (
  path: Path,
  deps: CwdResolutionDependencies,
): Promise<Path> => {
  let current = path;

  while (current.segments.length > 0) {
    const item = await resolvePathToItem(current, deps);
    if (item !== undefined) {
      return current;
    }

    const parent = current.parent();
    if (!parent) {
      break;
    }
    current = parent;
  }

  return defaultCwdPath(new Date());
};

export const CwdResolutionService = {
  async getCwd(
    deps: CwdResolutionDependencies,
    today: Date,
  ): Promise<Result<Path, CwdResolutionError>> {
    const cwdResult = await deps.stateRepository.loadCwd();
    if (cwdResult.type === "error") {
      return Result.error(cwdResult.error);
    }

    const cwd = cwdResult.value;
    if (!cwd) {
      const defaultPath = defaultCwdPath(today);
      return Result.ok(defaultPath);
    }

    const isDatePath = cwd.segments.length > 0 && cwd.segments[0].kind === "Date";
    if (isDatePath) {
      return Result.ok(cwd);
    }

    const item = await resolvePathToItem(cwd, deps);
    if (item === undefined && cwd.segments.length > 0) {
      const resolved = await findNearestValidAncestor(cwd, deps);
      await deps.stateRepository.saveCwd(resolved);
      return Result.ok(resolved);
    }

    return Result.ok(cwd);
  },

  async setCwd(
    target: Path,
    deps: CwdResolutionDependencies,
  ): Promise<Result<Path, CwdResolutionError>> {
    if (target.isRange()) {
      return Result.error(
        createValidationError("CwdResolution", [
          createValidationIssue("cannot set CWD to a range path", {
            code: "range_not_allowed",
            path: ["value"],
          }),
        ]),
      );
    }

    const isDatePath = target.segments.length > 0 && target.segments[0].kind === "Date";
    if (!isDatePath) {
      // Check if path ends with numeric sections
      // If so, validate that the item path (without numeric sections) resolves to a valid item
      let lastItemIndex = -1;
      for (let i = target.segments.length - 1; i >= 0; i -= 1) {
        const segment = target.segments[i];
        if (segment.kind === "Numeric") {
          continue;
        }
        if (segment.kind === "ItemAlias" || segment.kind === "ItemId") {
          lastItemIndex = i;
          break;
        }
        // If we hit a Date segment, stop (date segments are only at head)
        if (segment.kind === "Date") {
          break;
        }
      }

      if (lastItemIndex >= 0) {
        // Path ends with numeric sections; validate the item path
        const itemPathSegments = target.segments.slice(0, lastItemIndex + 1);
        const itemPath = parsePath(`/${itemPathSegments.map((s) => s.toString()).join("/")}`);
        if (itemPath.type === "ok") {
          const item = await resolvePathToItem(itemPath.value, deps);
          if (item === undefined) {
            return Result.error(
              createValidationError("CwdResolution", [
                createValidationIssue("target path does not resolve to a valid item", {
                  code: "invalid_target",
                  path: ["value"],
                }),
              ]),
            );
          }
        }
      } else {
        // Path doesn't end with numeric sections; validate entire path resolves to an item
        const item = await resolvePathToItem(target, deps);
        if (item === undefined && target.segments.length > 0) {
          return Result.error(
            createValidationError("CwdResolution", [
              createValidationIssue("target path does not resolve to a valid item", {
                code: "invalid_target",
                path: ["value"],
              }),
            ]),
          );
        }
      }
    }

    const setResult = await deps.stateRepository.saveCwd(target);
    if (setResult.type === "error") {
      return Result.error(setResult.error);
    }

    return Result.ok(target);
  },
};
