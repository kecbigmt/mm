import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { ListItemsStatusFilter, ListItemsWorkflow } from "../../../domain/workflows/list_items.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import type { ItemIconValue } from "../../../domain/primitives/item_icon.ts";
import { parseRangeExpression } from "../path_parser.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import {
  createDateRange,
  type PlacementRange,
} from "../../../domain/primitives/placement_range.ts";
import { parseCalendarDay } from "../../../domain/primitives/calendar_day.ts";
import { dateTimeFromDate } from "../../../domain/primitives/date_time.ts";
import { Result } from "../../../shared/result.ts";
import { formatDateStringForTimezone } from "../../../shared/timezone_format.ts";
import { createPlacement } from "../../../domain/primitives/placement.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import type { RangeExpression } from "../../../domain/primitives/path_types.ts";
import type { SectionSummary } from "../../../domain/services/section_query_service.ts";
import { buildPartitions, formatWarning } from "../partitioning/build_partitions.ts";
import { expandStubs } from "../partitioning/expand_stubs.ts";
import {
  formatDateHeader,
  formatItemHeadHeader,
  formatItemLine,
  type ItemIdResolver,
  type ItemLineContext,
  type ListFormatterOptions,
} from "../formatters/list_formatter.ts";
import { outputWithPager } from "../pager.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import {
  profileAsync,
  profilerFinish,
  profilerInit,
  profileSync,
} from "../../../shared/profiler.ts";
import { itemTypeEnum } from "../types.ts";
import type { Item } from "../../../domain/models/item.ts";
import { createPrefixLengthResolver } from "../formatters/alias_prefix_resolver.ts";

type ListOptions = {
  workspace?: string;
  type?: ItemIconValue;
  all?: boolean;
  print?: boolean;
  noPager?: boolean;
  depth?: number;
};

const DEFAULT_DATE_WINDOW_DAYS = 7;

/**
 * Add days to a date string (YYYY-MM-DD format).
 */
const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");
  return `${newYear}-${newMonth}-${newDay}`;
};

/**
 * Create a placement for today's date in the given timezone.
 */
const createTodayPlacement = (
  now: Date,
  timezone: Parameters<typeof formatDateStringForTimezone>[1],
): ReturnType<typeof createPlacement> => {
  const todayStr = formatDateStringForTimezone(now, timezone);
  const todayResult = parseCalendarDay(todayStr);
  if (todayResult.type === "error") {
    throw new Error("Failed to compute today's date");
  }
  return createPlacement({ kind: "date", date: todayResult.value }, []);
};

/**
 * Check if a RangeExpression requires cwd for resolution.
 * Returns true if any path segment is relative (., .., or numeric).
 */
const rangeExpressionRequiresCwd = (expr: RangeExpression): boolean => {
  const checkPath = (segments: ReadonlyArray<{ kind: string }>): boolean => {
    if (segments.length === 0) return false;
    const first = segments[0];
    // Relative navigation or numeric section reference requires cwd
    return first.kind === "dot" || first.kind === "dotdot" || first.kind === "numeric";
  };

  if (expr.kind === "single") {
    return checkPath(expr.path.segments);
  }
  // For range, check both from and to
  return checkPath(expr.from.segments) || checkPath(expr.to.segments);
};

export async function listAction(options: ListOptions, locatorArg?: string) {
  profilerInit("ls command");
  const debug = isDebugMode();

  // Validate depth option
  if (options.depth !== undefined && options.depth < 0) {
    console.error("error: depth must be a non-negative integer");
    profilerFinish();
    return;
  }

  const depsResult = await profileAsync(
    "loadCliDependencies",
    () => loadCliDependencies(options.workspace),
  );
  if (depsResult.type === "error") {
    if (depsResult.error.type === "repository") {
      console.error(formatError(depsResult.error.error, debug));
    } else {
      console.error(formatError(depsResult.error, debug));
    }
    profilerFinish();
    return;
  }

  const deps = depsResult.value;
  const now = new Date();
  const nowDateTime = Result.unwrap(dateTimeFromDate(now));
  const statusFilter: ListItemsStatusFilter = options.all ? "all" : "open";
  const isPrintMode = options.print === true;

  // Resolve PlacementRange and effective expression for workflow
  let placementRange: PlacementRange;
  let effectiveExpression: string | undefined;
  let cwd: ReturnType<typeof createPlacement> | undefined;
  let cwdFromSession = false; // Track if cwd was loaded from session (vs placeholder)

  if (locatorArg) {
    // Parse locator expression first to check if cwd is needed
    const rangeExprResult = parseRangeExpression(locatorArg);
    if (rangeExprResult.type === "error") {
      console.error(formatError(rangeExprResult.error, debug));
      profilerFinish();
      return;
    }

    const rangeExpr = rangeExprResult.value;
    const needsCwd = rangeExpressionRequiresCwd(rangeExpr);

    // Only load cwd if the expression requires it (relative paths)
    // For absolute paths, skip cwd loading for performance
    if (needsCwd) {
      const cwdResult = await profileAsync("getCwd", () =>
        CwdResolutionService.getCwd({
          sessionRepository: deps.sessionRepository,
          workspacePath: deps.root,
          itemRepository: deps.itemRepository,
          timezone: deps.timezone,
        }));

      if (cwdResult.type === "error") {
        console.error(formatError(cwdResult.error, debug));
        profilerFinish();
        return;
      }

      if (cwdResult.value.warning) {
        console.error(`Warning: ${cwdResult.value.warning}`);
      }

      cwd = cwdResult.value.placement;
      cwdFromSession = true;
    } else {
      // Use today's date as cwd placeholder for path resolution
      // cwdFromSession stays false - base date won't be extracted from this
      cwd = createTodayPlacement(now, deps.timezone);
    }

    const pathResolver = createPathResolver({
      aliasRepository: deps.aliasRepository,
      itemRepository: deps.itemRepository,
      timezone: deps.timezone,
      today: now,
      prefixCandidates: () => deps.cacheUpdateService.getAliases(),
    });

    const resolveResult = await pathResolver.resolveRange(cwd, rangeExpr);
    if (resolveResult.type === "error") {
      console.error(formatError(resolveResult.error, debug));
      profilerFinish();
      return;
    }

    placementRange = resolveResult.value;
    effectiveExpression = locatorArg;
  } else {
    // No locator - need cwd to determine default behavior
    const cwdResult = await profileAsync("getCwd", () =>
      CwdResolutionService.getCwd({
        sessionRepository: deps.sessionRepository,
        workspacePath: deps.root,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
      }));

    if (cwdResult.type === "error") {
      console.error(formatError(cwdResult.error, debug));
      profilerFinish();
      return;
    }

    if (cwdResult.value.warning) {
      console.error(`Warning: ${cwdResult.value.warning}`);
    }

    cwd = cwdResult.value.placement;
    cwdFromSession = true;

    // If cwd is an item-head or permanent section, use cwd as the target
    // Otherwise, default to today-7d..today+7d date range
    if (cwd.head.kind === "item" || cwd.head.kind === "permanent") {
      placementRange = { kind: "single", at: cwd };
      effectiveExpression = ".";
    } else {
      const todayStr = cwd.head.kind === "date"
        ? cwd.head.date.toString()
        : formatDateStringForTimezone(now, deps.timezone);
      const fromDateStr = addDaysToDateString(todayStr, -DEFAULT_DATE_WINDOW_DAYS);
      const toDateStr = addDaysToDateString(todayStr, DEFAULT_DATE_WINDOW_DAYS);

      const fromResult = parseCalendarDay(fromDateStr);
      const toResult = parseCalendarDay(toDateStr);

      if (fromResult.type === "error" || toResult.type === "error") {
        console.error("Failed to compute default date range");
        return;
      }

      placementRange = createDateRange(fromResult.value, toResult.value);
      // Build expression for workflow
      effectiveExpression = `${fromDateStr}..${toDateStr}`;
    }
  }

  // Execute workflow to get items
  const workflowResult = await profileAsync(
    "ListItemsWorkflow.execute",
    () =>
      ListItemsWorkflow.execute(
        {
          expression: effectiveExpression,
          cwd,
          today: now,
          timezone: deps.timezone,
          status: statusFilter,
          icon: options.type,
        },
        {
          itemRepository: deps.itemRepository,
          aliasRepository: deps.aliasRepository,
          prefixCandidates: () => deps.cacheUpdateService.getAliases(),
        },
      ),
  );

  if (workflowResult.type === "error") {
    console.error(formatError(workflowResult.error, debug));
    profilerFinish();
    return;
  }

  const { items } = workflowResult.value;

  // Update cache with displayed items
  await profileAsync(
    "cacheUpdateService.updateFromItems",
    () => deps.cacheUpdateService.updateFromItems(items),
  );

  // Query sections for numeric ranges
  let sections: ReadonlyArray<SectionSummary> = [];
  if (placementRange.kind === "numericRange" || placementRange.kind === "single") {
    const parent = placementRange.kind === "numericRange"
      ? placementRange.parent
      : placementRange.at;

    const sectionsResult = await profileAsync(
      "sectionQueryService.listSections",
      () => deps.sectionQueryService.listSections(parent),
    );
    if (sectionsResult.type === "error") {
      console.error(`Failed to query sections: ${sectionsResult.error.message}`);
      profilerFinish();
      return;
    }
    sections = sectionsResult.value;
  }

  // Look up alias by item ID (simple implementation)
  const aliasMap = new Map<string, string>();
  for (const item of items) {
    const alias = item.data.alias?.toString();
    if (alias) {
      aliasMap.set(item.data.id.toString(), alias);
    }
  }

  // For item-head ranges, try to get the parent item's alias
  if (
    (placementRange.kind === "numericRange" || placementRange.kind === "single") &&
    (placementRange.kind === "numericRange"
      ? placementRange.parent.head.kind === "item"
      : placementRange.at.head.kind === "item")
  ) {
    const parentId = placementRange.kind === "numericRange"
      ? placementRange.parent.head.kind === "item" ? placementRange.parent.head.id.toString() : null
      : placementRange.at.head.kind === "item"
      ? placementRange.at.head.id.toString()
      : null;

    if (parentId && !aliasMap.has(parentId)) {
      // Get the parent item ID from the placement range
      const parentItemId = placementRange.kind === "numericRange" &&
          placementRange.parent.head.kind === "item"
        ? placementRange.parent.head.id
        : placementRange.kind === "single" && placementRange.at.head.kind === "item"
        ? placementRange.at.head.id
        : null;

      if (parentItemId) {
        const parentItemResult = await deps.itemRepository.load(parentItemId);
        if (parentItemResult.type === "ok" && parentItemResult.value) {
          const parentAlias = parentItemResult.value.data.alias?.toString();
          if (parentAlias) {
            aliasMap.set(parentId, parentAlias);
          }
        }
      }
    }
  }

  const lookupAlias = (id: string): string | undefined => aliasMap.get(id);

  // Build a resolver for project/context ItemIds
  // Collect all unique project/context IDs that need resolution
  const projectContextIds = new Set<string>();
  for (const item of items) {
    if (item.data.project) {
      projectContextIds.add(item.data.project.toString());
    }
    if (item.data.contexts) {
      for (const ctx of item.data.contexts) {
        projectContextIds.add(ctx.toString());
      }
    }
  }

  // Look up referenced items and build alias map for them
  const refItemAliasMap = new Map<string, string>();
  for (const refId of projectContextIds) {
    // Skip if already in aliasMap (item is in current list)
    if (aliasMap.has(refId)) {
      refItemAliasMap.set(refId, aliasMap.get(refId)!);
      continue;
    }
    // Look up the referenced item
    const parseResult = parseItemId(refId);
    if (parseResult.type === "ok") {
      const loadResult = await deps.itemRepository.load(parseResult.value);
      if (loadResult.type === "ok" && loadResult.value) {
        const refAlias = loadResult.value.data.alias?.toString();
        if (refAlias) {
          refItemAliasMap.set(refId, refAlias);
        }
      }
    }
  }

  // Create resolver function
  const resolveItemId: ItemIdResolver = (id: string): string | undefined => refItemAliasMap.get(id);

  // Compute prefix lengths using completion cache as the scope.
  // This ensures prefix hints match what prefix resolution accepts.
  const cachedAliases = await profileAsync(
    "readCachedAliases",
    () => deps.cacheUpdateService.getAliases(),
  );
  const getPrefixLength = profileSync("computePrefixLengths", () => {
    const sortedAliases = [...cachedAliases].sort();
    return createPrefixLengthResolver(sortedAliases);
  });

  // Build display label function for item sections
  const getDisplayLabel = (
    parent: ReturnType<typeof createPlacement>,
    sectionPrefix: number,
  ): string => {
    let headStr: string;
    if (parent.head.kind === "date") {
      headStr = parent.head.date.toString();
    } else if (parent.head.kind === "item") {
      headStr = lookupAlias(parent.head.id.toString()) ?? parent.head.id.toString();
    } else {
      headStr = "permanent";
    }

    if (sectionPrefix === 0 && parent.section.length === 0) {
      return headStr;
    }

    if (parent.section.length === 0) {
      return `${headStr}/${sectionPrefix}`;
    }

    return `${headStr}/${parent.section.join("/")}/${sectionPrefix}`;
  };

  // Build partitions
  const partitionResult = profileSync("buildPartitions", () =>
    buildPartitions({
      items,
      range: placementRange,
      sections,
      getDisplayLabel,
    }));

  // Emit warnings to stderr
  for (const warning of partitionResult.warnings) {
    console.error(formatWarning(warning));
  }

  const { partitions } = partitionResult;

  // Check for empty result
  if (partitions.length === 0) {
    console.log("(empty)");
    profilerFinish();
    return;
  }

  // Extract base date from cwd for bolding
  // Only use session cwd (not placeholder) for base date extraction
  // When cwd is a date directory, that date is the base date
  // For absolute paths or non-date cwd, base date is undefined (falls back to today)
  const baseDate = cwdFromSession && cwd?.head.kind === "date" ? cwd.head.date : undefined;

  // Determine effective depth for section expansion
  // Default: 1 for item-head single placements, 0 for date ranges/numeric ranges
  const isItemHeadSingle = placementRange.kind === "single" &&
    placementRange.at.head.kind !== "date";
  const effectiveDepth = options.depth !== undefined ? options.depth : isItemHeadSingle ? 1 : 0;

  const formatterOptions: ListFormatterOptions = {
    printMode: isPrintMode,
    timezone: deps.timezone,
    now: nowDateTime,
  };

  // Build item line formatter that captures shared context (alias resolution, prefix highlighting)
  const formatItems = (itemList: ReadonlyArray<Item>, lines: string[]) => {
    for (const item of itemList) {
      const dateStr = item.data.placement.head.kind === "date"
        ? item.data.placement.head.date.toString()
        : undefined;
      const alias = item.data.alias?.toString();
      const prefixLen = alias ? getPrefixLength(alias) : undefined;
      const lineContext: ItemLineContext = {
        dateStr,
        resolveItemId,
        prefixLength: prefixLen,
      };
      lines.push(formatItemLine(item, formatterOptions, lineContext));
    }
  };

  // Build item filter matching the main listing workflow's filters
  // (status + snooze + icon) so expanded sections are consistent
  const itemFilterFn = (item: Item): boolean => {
    // Status filter
    if (statusFilter !== "all" && item.data.status.isClosed()) return false;
    // Snooze filter (only when status is not "all")
    if (statusFilter !== "all" && item.isSnoozing(nowDateTime)) return false;
    // Icon/type filter
    if (options.type && item.data.icon.toString() !== options.type) return false;
    return true;
  };

  // Format output (async to support depth expansion)
  const output = await profileAsync("formatOutput", async () => {
    const outputLines: string[] = [];

    for (const partition of partitions) {
      // Format header (skip date headers in print mode for flat output)
      if (partition.header.kind === "date") {
        if (!isPrintMode) {
          outputLines.push(
            formatDateHeader(partition.header.date, now, formatterOptions, baseDate),
          );
        }
      } else {
        outputLines.push(
          formatItemHeadHeader(
            partition.header.displayLabel,
            undefined,
            formatterOptions,
          ),
        );
      }

      // Format items
      formatItems(partition.items, outputLines);

      // Format stubs (with optional depth expansion)
      await expandStubs(
        partition.stubs,
        effectiveDepth,
        outputLines,
        { itemRepository: deps.itemRepository, sectionQueryService: deps.sectionQueryService },
        formatterOptions,
        formatItems,
        itemFilterFn,
      );

      // Add empty line between partitions (skip in print mode for flat output)
      if (!isPrintMode) {
        outputLines.push("");
      }
    }

    // Remove trailing empty line
    while (outputLines.length > 0 && outputLines[outputLines.length - 1] === "") {
      outputLines.pop();
    }

    return outputLines.join("\n");
  });

  // Output handling: pager/no-pager/print
  await profileAsync("output", async () => {
    if (isPrintMode || options.noPager) {
      console.log(output);
    } else {
      await outputWithPager(output);
    }
  });

  profilerFinish();
}

export function createListCommand() {
  return new Command()
    .description("List items in current directory or target path")
    .arguments("[locator:string]")
    .type("itemType", itemTypeEnum)
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-t, --type <type:itemType>", "Filter by item type (note, task, event)")
    .option("-a, --all", "Include closed items")
    .option("-p, --print", "Plain output without colors (includes ISO date)")
    .option("--no-pager", "Do not use pager")
    .option("-d, --depth <depth:integer>", "Expand section contents to this depth (default: 1)")
    .action(listAction);
}
