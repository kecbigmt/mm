import { bold, cyan, dim } from "@std/fmt/colors";
import { Item } from "../../../domain/models/item.ts";
import { ItemIcon } from "../../../domain/primitives/item_icon.ts";
import { ItemStatus } from "../../../domain/primitives/item_status.ts";
import { CalendarDay } from "../../../domain/primitives/calendar_day.ts";
import { TimezoneIdentifier } from "../../../domain/primitives/timezone_identifier.ts";
import type { DateTime } from "../../../domain/primitives/date_time.ts";
import { SectionSummary } from "../../../domain/services/section_query_service.ts";

/**
 * Options for list formatting.
 */
export type ListFormatterOptions = Readonly<{
  /** When true, output plain text without ANSI colors */
  printMode: boolean;
  /** Workspace timezone for displaying event times */
  timezone: TimezoneIdentifier;
  /** Current time for computing snoozing state */
  now: DateTime;
}>;

/**
 * Resolver function to convert ItemId UUIDs to display strings.
 * Returns the alias if available, or a truncated UUID, or undefined if not found.
 */
export type ItemIdResolver = (id: string) => string | undefined;

/**
 * Per-item context for formatting a single item line.
 * Groups optional parameters that vary per item (as opposed to ListFormatterOptions
 * which are shared across all items in a single list render).
 */
export type ItemLineContext = Readonly<{
  /** Date string (YYYY-MM-DD) for the item's placement day, used in print mode */
  dateStr?: string;
  /** Resolver for project/context ItemId UUIDs to display aliases */
  resolveItemId?: ItemIdResolver;
  /** Number of characters in the shortest unique prefix for alias highlighting */
  prefixLength?: number;
}>;

/**
 * Returns the symbol for an item based on its type, status, and snoozing state.
 *
 * Type symbols (when open and not snoozing):
 * - note: -
 * - task: •
 * - event: ○
 * - topic: ◆
 *
 * Status/state symbols:
 * - closed: ✓
 * - snoozing: ~
 */
export const formatItemIcon = (
  icon: ItemIcon,
  status: ItemStatus,
  isSnoozing: boolean,
): string => {
  if (status.isClosed()) {
    return "✓";
  }
  if (isSnoozing) {
    return "~";
  }

  // Open items show type symbol
  const iconValue = icon.toString();
  switch (iconValue) {
    case "note":
      return "-";
    case "task":
      return "•";
    case "event":
      return "○";
    case "topic":
      return "◆";
    default:
      return "-";
  }
};

/**
 * Formats a time in HH:MM format in the given timezone.
 */
const formatTimeInTimezone = (date: Date, timezone: TimezoneIdentifier): string => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone.toString(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
};

/**
 * Formats the event time string (colored mode).
 *
 * - With startAt only: HH:MM
 * - With startAt and duration: HH:MM-HH:MM
 * - Without startAt: undefined
 */
const formatEventTimeString = (
  item: Item,
  timezone: TimezoneIdentifier,
): string | undefined => {
  const { startAt, duration } = item.data;

  if (!startAt) {
    return undefined;
  }

  const startTime = formatTimeInTimezone(startAt.toDate(), timezone);

  if (duration) {
    const endDate = startAt.addDuration(duration);
    const endTime = formatTimeInTimezone(endDate.toDate(), timezone);
    return `${startTime}-${endTime}`;
  }

  return startTime;
};

/**
 * Formats the type token for print mode.
 *
 * Format: <type> or <type>:<status>
 * - task, task:closed, task:snoozing
 * - event, event:closed, event:snoozing
 * - note, note:closed, note:snoozing
 * - topic, topic:closed, topic:snoozing
 */
const formatTypeToken = (
  icon: ItemIcon,
  status: ItemStatus,
  isSnoozing: boolean,
): string => {
  const iconValue = icon.toString();
  const statusSuffix = status.isClosed() ? ":closed" : isSnoozing ? ":snoozing" : "";
  return `${iconValue}${statusSuffix}`;
};

/**
 * Formats the date+time string for print mode events.
 *
 * - With time: <date>T<HH:MM> or <date>T<HH:MM-HH:MM>
 * - Without time: <date>
 */
const formatDateTimeForPrint = (
  dateStr: string,
  item: Item,
  timezone: TimezoneIdentifier,
): string => {
  const timeStr = formatEventTimeString(item, timezone);
  if (timeStr) {
    return `${dateStr}T${timeStr}`;
  }
  return dateStr;
};

/**
 * Truncates a UUID to a short display form (first 8 characters).
 */
const truncateUuid = (uuid: string): string => uuid.slice(0, 8) + "…";

/**
 * Resolves an item ID to a display string using the resolver or falling back to truncated UUID.
 */
const resolveIdToDisplay = (
  id: string,
  resolveItemId?: ItemIdResolver,
): string => resolveItemId?.(id) ?? truncateUuid(id);

/**
 * Formats the metadata suffix (project, contexts, due date).
 * Returns an array of formatted strings without styling applied.
 */
const formatMetadata = (
  item: Item,
  resolveItemId?: ItemIdResolver,
): string[] => {
  const { project, contexts, dueAt } = item.data;
  const parts: string[] = [];

  if (project) {
    parts.push(`+${resolveIdToDisplay(project.toString(), resolveItemId)}`);
  }

  if (contexts && contexts.length > 0) {
    for (const context of contexts) {
      parts.push(`@${resolveIdToDisplay(context.toString(), resolveItemId)}`);
    }
  }

  if (dueAt) {
    parts.push(`→${dueAt.toString().slice(0, 10)}`);
  }

  return parts;
};

/**
 * Formats an item line for print mode (plain text, machine-readable).
 *
 * Format: <alias>:<type>[:status] <date|dateTime> <title> <project?> <contexts?> <due?>
 */
const formatItemLinePrintMode = (
  item: Item,
  timezone: TimezoneIdentifier,
  isSnoozing: boolean,
  context: ItemLineContext,
): string => {
  const { dateStr, resolveItemId } = context;
  const { icon, status, alias, title } = item.data;
  const parts: string[] = [];

  const identifier = alias?.toString() ?? item.data.id.toString();
  const typeToken = formatTypeToken(icon, status, isSnoozing);
  parts.push(`${identifier}:${typeToken}`);

  // Date/time column
  const isEvent = icon.toString() === "event";
  if (dateStr) {
    parts.push(isEvent ? formatDateTimeForPrint(dateStr, item, timezone) : dateStr);
  } else if (isEvent) {
    // For events without dateStr (e.g., permanent placement), still emit time if available
    const timeStr = formatEventTimeString(item, timezone);
    if (timeStr) {
      parts.push(timeStr);
    }
  }

  parts.push(title.toString());
  parts.push(...formatMetadata(item, resolveItemId));

  return parts.join(" ");
};

/**
 * Formats an item line for colored mode (terminal display with ANSI colors).
 *
 * Format: <icon> <alias> <time?> <title> <project?> <contexts?> <due?>
 */
const formatItemLineColoredMode = (
  item: Item,
  timezone: TimezoneIdentifier,
  isSnoozing: boolean,
  context: ItemLineContext,
): string => {
  const { resolveItemId, prefixLength } = context;
  const { icon, status, alias, title } = item.data;
  const parts: string[] = [];

  parts.push(formatItemIcon(icon, status, isSnoozing));

  const aliasStr = alias?.toString();
  if (aliasStr && prefixLength !== undefined && prefixLength > 0) {
    const prefix = aliasStr.slice(0, prefixLength);
    const rest = aliasStr.slice(prefixLength);
    parts.push(bold(cyan(prefix)) + dim(cyan(rest)));
  } else {
    parts.push(cyan(aliasStr ?? item.data.id.toString()));
  }

  if (icon.toString() === "event") {
    const timeStr = formatEventTimeString(item, timezone);
    if (timeStr) {
      parts.push(timeStr);
    }
  }

  parts.push(title.toString());
  parts.push(...formatMetadata(item, resolveItemId).map(dim));

  return parts.join(" ");
};

/**
 * Formats a single item line.
 *
 * Delegates to mode-specific formatters for clean separation of concerns.
 */
export const formatItemLine = (
  item: Item,
  options: ListFormatterOptions,
  context: ItemLineContext = {},
): string => {
  const { printMode, timezone, now } = options;
  const isSnoozing = item.isSnoozing(now);

  if (printMode) {
    return formatItemLinePrintMode(item, timezone, isSnoozing, context);
  }
  return formatItemLineColoredMode(item, timezone, isSnoozing, context);
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weekday names indexed by JavaScript's Date.getUTCDay() (0 = Sunday, 6 = Saturday).
 */
const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * Computes the relative label for a date.
 *
 * Returns:
 * - today, tomorrow, yesterday for 0, +1, -1 days
 * - next-{weekday} for +2 to +7 days
 * - last-{weekday} for -2 to -7 days
 * - +Nd for dates beyond +7 days
 * - ~Nd for dates beyond -7 days
 */
const computeRelativeLabel = (day: CalendarDay, referenceDate: Date): string => {
  const targetDate = day.toDate();
  const dayMs = targetDate.getTime();

  // Normalize reference to start of day in UTC
  const refDay = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  ));
  const refDayMs = refDay.getTime();

  const diffDays = Math.round((dayMs - refDayMs) / ONE_DAY_MS);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";

  // Within a week: use weekday labels
  if (diffDays >= 2 && diffDays <= 7) {
    const weekday = WEEKDAY_NAMES[targetDate.getUTCDay()];
    return `next-${weekday}`;
  }
  if (diffDays <= -2 && diffDays >= -7) {
    const weekday = WEEKDAY_NAMES[targetDate.getUTCDay()];
    return `last-${weekday}`;
  }

  // Beyond a week: use day count
  if (diffDays > 7) return `+${diffDays}d`;
  if (diffDays < -7) return `~${Math.abs(diffDays)}d`;

  return "";
};

/**
 * Formats a date header line.
 *
 * Format: [YYYY-MM-DD] <relative>
 * - relative labels:
 *   - today, tomorrow, yesterday (for 0, +1, -1 days)
 *   - next-{weekday} (for +2 to +7 days)
 *   - last-{weekday} (for -2 to -7 days)
 *   - +Nd (for beyond +7 days)
 *   - ~Nd (for beyond -7 days)
 * - Bold when day matches baseDate in colored mode
 * - If baseDate is not provided, falls back to bolding "today"
 */
export const formatDateHeader = (
  day: CalendarDay,
  referenceDate: Date,
  options: ListFormatterOptions,
  baseDate?: CalendarDay,
): string => {
  const { printMode } = options;
  const dateStr = `[${day.toString()}]`;
  const relative = computeRelativeLabel(day, referenceDate);

  let header = relative ? `${dateStr} ${relative}` : dateStr;

  if (!printMode) {
    const shouldBold = baseDate ? day.toString() === baseDate.toString() : relative === "today";
    if (shouldBold) {
      header = bold(header);
    }
  }

  return header;
};

/**
 * Formats a section stub line.
 *
 * Colored mode: 📁 <section-prefix>/ (items: <count>, sections: <count>)
 * Print mode: [section] <section-prefix>/ (items: <count>, sections: <count>)
 */
export const formatSectionStub = (
  summary: SectionSummary,
  relativePath: string,
  options: ListFormatterOptions,
): string => {
  const icon = options.printMode ? "[section]" : "📁";
  return `${icon} ${relativePath} (items: ${summary.itemCount}, sections: ${summary.sectionCount})`;
};

/**
 * Formats an item-head partition header.
 *
 * Format: [<alias-or-uuid>/<section?>]
 * - Uses alias if available, otherwise UUID
 * - Includes section prefix if provided
 * - Styled in colored mode
 *
 * Examples:
 * - [some-book/1]
 * - [019a85fc-67c4-7a54-be8e-305bae009f9e/2]
 * - [parent-alias]
 */
export const formatItemHeadHeader = (
  aliasOrId: string,
  sectionPrefix: string | undefined,
  options: ListFormatterOptions,
): string => {
  const { printMode } = options;
  const path = sectionPrefix ? `${aliasOrId}/${sectionPrefix}` : aliasOrId;
  const header = `[${path}]`;

  if (printMode) {
    return header;
  }

  return cyan(header);
};
