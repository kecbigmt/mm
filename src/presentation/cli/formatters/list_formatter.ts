import { bold, cyan, dim } from "@std/fmt/colors";
import { Item } from "../../../domain/models/item.ts";
import { ItemIcon } from "../../../domain/primitives/item_icon.ts";
import { ItemStatus } from "../../../domain/primitives/item_status.ts";
import { CalendarDay } from "../../../domain/primitives/calendar_day.ts";
import { TimezoneIdentifier } from "../../../domain/primitives/timezone_identifier.ts";
import { SectionSummary } from "../../../domain/services/section_query_service.ts";

/**
 * Options for list formatting.
 */
export type ListFormatterOptions = Readonly<{
  /** When true, output plain text without ANSI colors */
  printMode: boolean;
  /** Workspace timezone for displaying event times */
  timezone: TimezoneIdentifier;
}>;

/**
 * Returns the emoji icon for an item based on its type and status.
 *
 * - note: 📝 (open) / 🗞️ (closed)
 * - task: ✔️ (open) / ✅ (closed)
 * - event: 🕒
 */
export const formatItemIcon = (icon: ItemIcon, status: ItemStatus): string => {
  const iconValue = icon.toString();
  const isClosed = status.isClosed();

  switch (iconValue) {
    case "note":
      return isClosed ? "🗞️" : "📝";
    case "task":
      return isClosed ? "✅" : "✔️";
    case "event":
      return "🕒";
    default:
      return "📝";
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
 * Formats the event time portion of an item line.
 *
 * - With startAt only: 🕒(HH:MM)
 * - With startAt and duration: 🕒(HH:MM-HH:MM)
 * - Without startAt: 🕒
 */
const formatEventTime = (item: Item, timezone: TimezoneIdentifier): string => {
  const { startAt, duration } = item.data;

  if (!startAt) {
    return "🕒";
  }

  const startTime = formatTimeInTimezone(startAt.toDate(), timezone);

  if (duration) {
    const endDate = startAt.addDuration(duration);
    const endTime = formatTimeInTimezone(endDate.toDate(), timezone);
    return `🕒(${startTime}-${endTime})`;
  }

  return `🕒(${startTime})`;
};

/**
 * Formats a single item line.
 *
 * Template: <icon> <alias-or-id> <title> <time?> <context?> <due?>
 *
 * - alias-or-id: alias if present, else full UUID (cyan in colored mode)
 * - context: dim @tag format if present
 * - due: dim →YYYY-MM-DD format if dueAt exists
 */
export const formatItemLine = (item: Item, options: ListFormatterOptions): string => {
  const { printMode, timezone } = options;
  const { icon, status, alias, title, context, dueAt } = item.data;

  const parts: string[] = [];

  // Icon (with event time if applicable)
  if (icon.toString() === "event") {
    parts.push(formatEventTime(item, timezone));
  } else {
    parts.push(formatItemIcon(icon, status));
  }

  // Alias or UUID
  const identifier = alias?.toString() ?? item.data.id.toString();
  parts.push(printMode ? identifier : cyan(identifier));

  // Title
  parts.push(title.toString());

  // Context
  if (context) {
    const contextStr = `@${context.toString()}`;
    parts.push(printMode ? contextStr : dim(contextStr));
  }

  // Due date
  if (dueAt) {
    const dueStr = `→${dueAt.toString().slice(0, 10)}`;
    parts.push(printMode ? dueStr : dim(dueStr));
  }

  return parts.join(" ");
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes the relative label for a date.
 *
 * Returns: today, tomorrow, yesterday, +Nd (up to +7d), or empty for dates outside range.
 */
const computeRelativeLabel = (day: CalendarDay, referenceDate: Date): string => {
  const dayMs = day.toDate().getTime();

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
  if (diffDays > 1 && diffDays <= 7) return `+${diffDays}d`;
  if (diffDays < -1 && diffDays >= -7) return `${diffDays}d`;

  return "";
};

/**
 * Formats a date header line.
 *
 * Format: [YYYY-MM-DD] <relative>
 * - relative: today, tomorrow, yesterday, +Nd, -Nd (only for -7..+7 days)
 * - Bold when relative is "today" in colored mode
 */
export const formatDateHeader = (
  day: CalendarDay,
  referenceDate: Date,
  options: ListFormatterOptions,
): string => {
  const { printMode } = options;
  const dateStr = `[${day.toString()}]`;
  const relative = computeRelativeLabel(day, referenceDate);

  let header = relative ? `${dateStr} ${relative}` : dateStr;

  if (!printMode && relative === "today") {
    header = bold(header);
  }

  return header;
};

/**
 * Formats a section stub line.
 *
 * Format: 📁 <section-prefix>/ (items: <count>, sections: <count>)
 */
export const formatSectionStub = (
  summary: SectionSummary,
  relativePath: string,
  _options: ListFormatterOptions,
): string => {
  return `📁 ${relativePath} (items: ${summary.itemCount}, sections: ${summary.sectionCount})`;
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
