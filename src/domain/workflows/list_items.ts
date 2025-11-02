import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { Path, parsePath } from "../primitives/path.ts";
import { parseLocator, ParseLocatorOptions } from "../primitives/locator.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";

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
          if (lastSeg.start.kind === "Date" && lastSeg.end.kind === "Date") {
            const baseSegments = path.segments.slice(0, -1);
            const basePath = parsePath(
              baseSegments.length === 0 ? "/" : `/${baseSegments.map((s) => s.toString()).join("/")}`,
              options,
            );
            if (basePath.type === "error") {
              return Result.error(
                createValidationError("ListItems", basePath.error.issues),
              );
            }

            const endDatePath = parsePath(`/${lastSeg.end.toString()}`, options);
            if (endDatePath.type === "error") {
              return Result.error(
                createValidationError("ListItems", endDatePath.error.issues),
              );
            }

            return expandDateRange(basePath.value, endDatePath.value, deps).then((result) =>
              result.type === "ok"
                ? Result.ok({ items: result.value })
                : result
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

    const listResult = await deps.itemRepository.listByPath(targetPath);
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

