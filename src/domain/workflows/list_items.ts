import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { parsePath, Path } from "../primitives/path.ts";
import { parseLocator, ParseLocatorOptions } from "../primitives/locator.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { PathNormalizationService } from "../services/path_normalization_service.ts";

export type ListItemsInput = Readonly<{
  locator?: string;
  cwd?: Path;
  today?: Date;
}>;

export type ListItemsDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
}>;

export type ListItemsValidationError = ValidationError<"ListItems">;

export type ListItemsError = ListItemsValidationError | RepositoryError;

export type ListItemsResult = Readonly<{
  items: ReadonlyArray<Item>;
}>;

const expandDateRange = async (
  startPath: Path,
  endPath: Path,
  deps: ListItemsDependencies,
): Promise<Result<ReadonlyArray<Item>, ListItemsError>> => {
  const startSeg = startPath.segments[0];
  const endSeg = endPath.segments[0];

  if (!startSeg || !endSeg || startSeg.kind !== "Date" || endSeg.kind !== "Date") {
    return Result.error(
      createValidationError("ListItems", [
        createValidationIssue("date ranges must have date segments at the head", {
          code: "invalid_date_range",
          path: ["locator"],
        }),
      ]),
    );
  }

  const startDate = startSeg.value as import("../primitives/calendar_day.ts").CalendarDay;
  const endDate = endSeg.value as import("../primitives/calendar_day.ts").CalendarDay;

  const allItems: Item[] = [];
  const currentDate = new Date(startDate.data.year, startDate.data.month - 1, startDate.data.day);
  const end = new Date(endDate.data.year, endDate.data.month - 1, endDate.data.day);

  while (currentDate <= end) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const pathResult = parsePath(`/${dateStr}`);
    if (pathResult.type === "error") {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    const listResult = await deps.itemRepository.listByPath(pathResult.value);
    if (listResult.type === "error") {
      return Result.error(listResult.error);
    }

    allItems.push(...listResult.value);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  allItems.sort((a, b) => {
    const rankCompare = a.data.rank.compare(b.data.rank);
    if (rankCompare !== 0) {
      return rankCompare;
    }
    const aMs = a.data.createdAt.data.epochMilliseconds;
    const bMs = b.data.createdAt.data.epochMilliseconds;
    return aMs - bMs;
  });

  return Result.ok(allItems);
};

const expandNumericRange = async (
  parentPath: Path,
  startNum: number,
  endNum: number,
  deps: ListItemsDependencies,
  options: ParseLocatorOptions,
): Promise<Result<ReadonlyArray<Item>, ListItemsError>> => {
  // Normalize parent path first
  const normalizedResult = await PathNormalizationService.normalize(
    parentPath,
    {
      itemRepository: deps.itemRepository,
      aliasRepository: deps.aliasRepository,
    },
    { preserveAlias: false },
  );

  if (normalizedResult.type === "error") {
    if (normalizedResult.error.kind === "ValidationError") {
      return Result.error(
        createValidationError("ListItems", normalizedResult.error.issues),
      );
    }
    return Result.error(normalizedResult.error);
  }

  const normalizedParent = normalizedResult.value;
  const allItems: Item[] = [];

  // Iterate through numeric sections from startNum to endNum (inclusive)
  for (let num = startNum; num <= endNum; num++) {
    // Build path with numeric section
    const sectionPathStr = `${normalizedParent.toString()}/${num}`;
    const sectionPathResult = parsePath(sectionPathStr, options);
    if (sectionPathResult.type === "error") {
      continue;
    }

    const listResult = await deps.itemRepository.listByPath(sectionPathResult.value);
    if (listResult.type === "error") {
      // Continue to next section if one fails (section might not exist)
      continue;
    }

    allItems.push(...listResult.value);
  }

  // Sort all items by rank, then by created_at
  allItems.sort((a, b) => {
    const rankCompare = a.data.rank.compare(b.data.rank);
    if (rankCompare !== 0) {
      return rankCompare;
    }
    const aMs = a.data.createdAt.data.epochMilliseconds;
    const bMs = b.data.createdAt.data.epochMilliseconds;
    return aMs - bMs;
  });

  return Result.ok(allItems);
};

export const ListItemsWorkflow = {
  execute: async (
    input: ListItemsInput,
    deps: ListItemsDependencies,
  ): Promise<Result<ListItemsResult, ListItemsError>> => {
    const options: ParseLocatorOptions = {
      cwd: input.cwd,
      today: input.today ?? new Date(),
    };

    let targetPath: Path;

    if (input.locator) {
      const locatorResult = parseLocator(input.locator, options);
      if (locatorResult.type === "error") {
        return Result.error(
          createValidationError("ListItems", locatorResult.error.issues),
        );
      }

      const locator = locatorResult.value;
      if (locator.isRange()) {
        const path = locator.path;
        const lastSeg = path.segments[path.segments.length - 1];
        if (lastSeg && lastSeg.kind === "range") {
          // Handle date ranges
          if (lastSeg.start.kind === "Date" && lastSeg.end.kind === "Date") {
            const startDatePath = parsePath(`/${lastSeg.start.toString()}`, options);
            if (startDatePath.type === "error") {
              return Result.error(
                createValidationError("ListItems", startDatePath.error.issues),
              );
            }

            const endDatePath = parsePath(`/${lastSeg.end.toString()}`, options);
            if (endDatePath.type === "error") {
              return Result.error(
                createValidationError("ListItems", endDatePath.error.issues),
              );
            }

            return expandDateRange(startDatePath.value, endDatePath.value, deps).then(
              (result) => result.type === "ok" ? Result.ok({ items: result.value }) : result,
            );
          }

          // Handle numeric section ranges
          if (lastSeg.start.kind === "Numeric" && lastSeg.end.kind === "Numeric") {
            // TypeScript needs explicit type narrowing for union types
            const startNum = typeof lastSeg.start.value === "number" ? lastSeg.start.value : null;
            const endNum = typeof lastSeg.end.value === "number" ? lastSeg.end.value : null;

            if (startNum === null || endNum === null) {
              return Result.error(
                createValidationError("ListItems", [
                  createValidationIssue("numeric range segments must have numeric values", {
                    code: "invalid_numeric_range",
                    path: ["locator"],
                  }),
                ]),
              );
            }

            // Build parent path (all segments except the last range segment)
            const parentSegments = path.segments.slice(0, -1);
            let parentPath: Path;

            if (parentSegments.length > 0) {
              // Parent path has segments, use them
              const parentPathResult = parsePath(
                `/${parentSegments.map((s) => s.toString()).join("/")}`,
                options,
              );
              if (parentPathResult.type === "error") {
                return Result.error(
                  createValidationError("ListItems", parentPathResult.error.issues),
                );
              }
              parentPath = parentPathResult.value;
            } else {
              // No parent segments, use CWD as parent
              if (!input.cwd) {
                // Fallback to today if no CWD
                const today = input.today ?? new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, "0");
                const day = String(today.getDate()).padStart(2, "0");
                const defaultPathResult = parsePath(`/${year}-${month}-${day}`, options);
                if (defaultPathResult.type === "error") {
                  return Result.error(
                    createValidationError("ListItems", defaultPathResult.error.issues),
                  );
                }
                parentPath = defaultPathResult.value;
              } else {
                parentPath = input.cwd;
              }
            }

            return expandNumericRange(
              parentPath,
              startNum,
              endNum,
              deps,
              options,
            ).then(
              (result) => result.type === "ok" ? Result.ok({ items: result.value }) : result,
            );
          }
        }
      }

      targetPath = locator.path;
    } else {
      if (!input.cwd) {
        const today = input.today ?? new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        const defaultPath = parsePath(`/${year}-${month}-${day}`, options);
        if (defaultPath.type === "error") {
          return Result.error(
            createValidationError("ListItems", defaultPath.error.issues),
          );
        }
        targetPath = defaultPath.value;
      } else {
        targetPath = input.cwd;
      }
    }

    if (targetPath.isRange()) {
      return Result.error(
        createValidationError("ListItems", [
          createValidationIssue("ranges must be handled separately", {
            code: "range_unsupported",
            path: ["locator"],
          }),
        ]),
      );
    }

    // Normalize path before querying repository
    const normalizedResult = await PathNormalizationService.normalize(
      targetPath,
      {
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
      },
      { preserveAlias: false },
    );

    if (normalizedResult.type === "error") {
      // Map PathNormalizationError to ListItemsError
      if (normalizedResult.error.kind === "ValidationError") {
        return Result.error(
          createValidationError("ListItems", normalizedResult.error.issues),
        );
      }
      return Result.error(normalizedResult.error);
    }

    const normalizedPath = normalizedResult.value;
    const listResult = await deps.itemRepository.listByPath(normalizedPath);
    if (listResult.type === "error") {
      return Result.error(listResult.error);
    }

    const items = listResult.value.slice().sort((a, b) => {
      const rankCompare = a.data.rank.compare(b.data.rank);
      if (rankCompare !== 0) {
        return rankCompare;
      }
      const aMs = a.data.createdAt.data.epochMilliseconds;
      const bMs = b.data.createdAt.data.epochMilliseconds;
      return aMs - bMs;
    });

    return Result.ok({ items });
  },
};
