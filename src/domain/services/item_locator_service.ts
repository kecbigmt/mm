import { Result } from "../../shared/result.ts";
import { Item } from "../models/item.ts";
import { parseItemId } from "../primitives/item_id.ts";
import { parseAliasSlug } from "../primitives/alias_slug.ts";
import { parseCalendarDay, TimezoneIdentifier } from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { resolvePrefix } from "./alias_prefix_service.ts";
import { createDateRange } from "../primitives/mod.ts";
import { formatDateStringForTimezone } from "../../shared/timezone_format.ts";

const DEFAULT_DATE_WINDOW_DAYS = 7;

/** Add days to a YYYY-MM-DD date string using calendar-day arithmetic */
const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${
    String(date.getDate()).padStart(2, "0")
  }`;
};

export type ItemLocatorError =
  | { readonly kind: "not_found"; readonly locator: string }
  | {
    readonly kind: "ambiguous_prefix";
    readonly locator: string;
    readonly candidates: readonly string[];
  }
  | { readonly kind: "repository_error"; readonly error: RepositoryError };

export type ItemLocatorDependencies = Readonly<{
  readonly aliasRepository: AliasRepository;
  readonly itemRepository: ItemRepository;
  readonly timezone: TimezoneIdentifier;
  readonly today?: Date;
}>;

export type ItemLocatorService = Readonly<{
  resolve(locator: string): Promise<Result<Item, ItemLocatorError>>;
}>;

export const createItemLocatorService = (
  deps: ItemLocatorDependencies,
): ItemLocatorService => {
  const today = deps.today ?? new Date();

  const loadPrioritySet = async (): Promise<readonly string[]> => {
    const todayStr = formatDateStringForTimezone(today, deps.timezone);
    const fromStr = addDaysToDateString(todayStr, -DEFAULT_DATE_WINDOW_DAYS);
    const toStr = addDaysToDateString(todayStr, DEFAULT_DATE_WINDOW_DAYS);

    const fromDay = parseCalendarDay(fromStr);
    const toDay = parseCalendarDay(toStr);
    if (fromDay.type === "error" || toDay.type === "error") {
      return [];
    }

    const itemsResult = await deps.itemRepository.listByPlacement(
      createDateRange(fromDay.value, toDay.value),
    );
    if (itemsResult.type === "error") {
      return [];
    }

    return itemsResult.value
      .filter((item) => item.data.alias !== undefined)
      .map((item) => item.data.alias!.toString());
  };

  const resolve = async (locator: string): Promise<Result<Item, ItemLocatorError>> => {
    // 1. Try UUID
    const uuidResult = parseItemId(locator);
    if (uuidResult.type === "ok") {
      const loadResult = await deps.itemRepository.load(uuidResult.value);
      if (loadResult.type === "error") {
        return Result.error({ kind: "repository_error", error: loadResult.error });
      }
      if (loadResult.value) {
        return Result.ok(loadResult.value);
      }
      return Result.error({ kind: "not_found", locator });
    }

    // 2. Try exact alias
    const aliasResult = parseAliasSlug(locator);
    if (aliasResult.type === "ok") {
      const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
      if (aliasLoadResult.type === "error") {
        return Result.error({ kind: "repository_error", error: aliasLoadResult.error });
      }
      if (aliasLoadResult.value) {
        const itemLoadResult = await deps.itemRepository.load(aliasLoadResult.value.data.itemId);
        if (itemLoadResult.type === "error") {
          return Result.error({ kind: "repository_error", error: itemLoadResult.error });
        }
        if (itemLoadResult.value) {
          return Result.ok(itemLoadResult.value);
        }
        return Result.error({ kind: "not_found", locator });
      }
    }

    // 3. Prefix fallback
    const listResult = await deps.aliasRepository.list();
    if (listResult.type === "error") {
      return Result.error({ kind: "repository_error", error: listResult.error });
    }

    const allAliases = listResult.value;
    const allAliasStrings = allAliases.map((a) => a.data.slug.toString());
    const prioritySet = await loadPrioritySet();
    const prefixResult = resolvePrefix(locator, prioritySet, allAliasStrings);

    if (prefixResult.kind === "single") {
      const matched = allAliases.find(
        (a) => a.data.slug.toString() === prefixResult.alias,
      );
      if (matched) {
        const itemLoadResult = await deps.itemRepository.load(matched.data.itemId);
        if (itemLoadResult.type === "error") {
          return Result.error({ kind: "repository_error", error: itemLoadResult.error });
        }
        if (itemLoadResult.value) {
          return Result.ok(itemLoadResult.value);
        }
        return Result.error({ kind: "not_found", locator });
      }
    }

    if (prefixResult.kind === "ambiguous") {
      return Result.error({
        kind: "ambiguous_prefix",
        locator,
        candidates: prefixResult.candidates,
      });
    }

    return Result.error({ kind: "not_found", locator });
  };

  return { resolve };
};
