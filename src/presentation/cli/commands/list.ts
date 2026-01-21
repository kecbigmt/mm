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
import { createPlacement } from "../../../domain/primitives/placement.ts";
import { parseItemId } from "../../../domain/primitives/item_id.ts";
import type { SectionSummary } from "../../../domain/services/section_query_service.ts";
import { buildPartitions, formatWarning } from "../partitioning/build_partitions.ts";
import {
  formatDateHeader,
  formatItemHeadHeader,
  formatItemLine,
  formatSectionStub,
  type ItemIdResolver,
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

type ListOptions = {
  workspace?: string;
  type?: ItemIconValue;
  all?: boolean;
  print?: boolean;
  noPager?: boolean;
};

const DEFAULT_DATE_WINDOW_DAYS = 7;

/**
 * Compute today's date in the given timezone.
 */
const computeTodayInTimezone = (now: Date, timezone: string): Date => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(
    Number(lookup.get("year")),
    Number(lookup.get("month")) - 1,
    Number(lookup.get("day")),
  );
};

/**
 * Add days to a date (handles month/year boundaries).
 */
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Format a Date as YYYY-MM-DD string.
 */
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function listAction(options: ListOptions, locatorArg?: string) {
  profilerInit("ls command");
  const debug = isDebugMode();

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

  const cwdResult = await profileAsync("getCwd", () =>
    CwdResolutionService.getCwd(
      {
        getEnv: (name) => Deno.env.get(name),
        itemRepository: deps.itemRepository,
      },
      now,
    ));

  if (cwdResult.type === "error") {
    console.error(formatError(cwdResult.error, debug));
    profilerFinish();
    return;
  }

  if (cwdResult.value.warning) {
    console.error(`Warning: ${cwdResult.value.warning}`);
  }

  const cwd = cwdResult.value.placement;
  const statusFilter: ListItemsStatusFilter = options.all ? "all" : "open";
  const isPrintMode = options.print === true;

  // Resolve PlacementRange and effective expression for workflow
  let placementRange: PlacementRange;
  let effectiveExpression: string | undefined;

  if (locatorArg) {
    // Parse and resolve locator expression
    const rangeExprResult = parseRangeExpression(locatorArg);
    if (rangeExprResult.type === "error") {
      console.error(formatError(rangeExprResult.error, debug));
      profilerFinish();
      return;
    }

    const pathResolver = createPathResolver({
      aliasRepository: deps.aliasRepository,
      itemRepository: deps.itemRepository,
      timezone: deps.timezone,
      today: now,
    });

    const resolveResult = await pathResolver.resolveRange(cwd, rangeExprResult.value);
    if (resolveResult.type === "error") {
      console.error(formatError(resolveResult.error, debug));
      profilerFinish();
      return;
    }

    placementRange = resolveResult.value;
    effectiveExpression = locatorArg;
  } else {
    // If cwd is an item-head section, use cwd as the target
    // Otherwise, default to today-7d..today+7d date range
    if (cwd.head.kind === "item") {
      placementRange = { kind: "single", at: cwd };
      effectiveExpression = ".";
    } else {
      const todayResult = computeTodayInTimezone(now, deps.timezone.toString());
      const fromDate = addDays(todayResult, -DEFAULT_DATE_WINDOW_DAYS);
      const toDate = addDays(todayResult, DEFAULT_DATE_WINDOW_DAYS);

      const fromDateStr = formatDateString(fromDate);
      const toDateStr = formatDateString(toDate);

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

  // Format output
  const output = profileSync("formatOutput", () => {
    const formatterOptions: ListFormatterOptions = {
      printMode: isPrintMode,
      timezone: deps.timezone,
      now: nowDateTime,
    };

    const outputLines: string[] = [];

    for (const partition of partitions) {
      // Format header
      if (partition.header.kind === "date") {
        outputLines.push(formatDateHeader(partition.header.date, now, formatterOptions));
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
      for (const item of partition.items) {
        const dateStr = item.data.placement.head.kind === "date"
          ? item.data.placement.head.date.toString()
          : undefined;
        outputLines.push(formatItemLine(item, formatterOptions, dateStr, resolveItemId));
      }

      // Format stubs
      for (const stub of partition.stubs) {
        const stubSummary: SectionSummary = {
          placement: createPlacement(
            partition.header.kind === "date"
              ? { kind: "date", date: partition.header.date }
              : partition.header.parent.head,
            [],
          ),
          itemCount: stub.itemCount,
          sectionCount: stub.sectionCount,
        };
        outputLines.push(formatSectionStub(stubSummary, stub.relativePath, formatterOptions));
      }

      // Add empty line between partitions
      outputLines.push("");
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
    .action(listAction);
}
