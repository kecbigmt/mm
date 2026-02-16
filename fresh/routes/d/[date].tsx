import type { FreshContext } from "fresh";
import type { State } from "../../utils.ts";
import {
  isDateExpression,
  resolveRelativeDate,
} from "../../../src/domain/services/date_resolver.ts";
import { createDateDirectory } from "../../../src/domain/primitives/directory.ts";
import { createSingleRange } from "../../../src/domain/primitives/directory_range.ts";
import type { Item } from "../../../src/domain/models/item.ts";
import type { CalendarDay } from "../../../src/domain/primitives/calendar_day.ts";
import type { TimezoneIdentifier } from "../../../src/domain/primitives/timezone_identifier.ts";

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatDateHumanReadable = (day: CalendarDay): string => {
  const dateStr = day.toString(); // YYYY-MM-DD
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const isTodayInTimezone = (
  day: CalendarDay,
  timezone: TimezoneIdentifier,
  now: Date,
): boolean => {
  const todayResult = resolveRelativeDate("today", timezone, now);
  if (todayResult.type !== "ok") return false;
  return day.toString() === todayResult.value.toString();
};

export const handler = {
  GET: async (ctx: FreshContext<State>) => {
    const dateParam = ctx.params.date;

    // Validate date parameter
    if (!isDateExpression(dateParam)) {
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Invalid date</title></head>
<body>
<main>
  <h1>Invalid date format</h1>
  <p>The date "${escapeHtml(dateParam)}" is not valid.</p>
  <p>Valid formats: YYYY-MM-DD, today, tm, yesterday, +2d, ~1w, etc.</p>
</main>
</body>
</html>`;
      return new Response(html, {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Load items from repository if available
    let items: ReadonlyArray<Item> = [];
    const { itemRepository, timezone } = ctx.state;
    const now = new Date();

    // Resolve relative date to absolute date
    let resolvedDay: CalendarDay | undefined;
    if (timezone) {
      const resolvedDate = resolveRelativeDate(dateParam, timezone, now);
      if (resolvedDate.type === "ok") {
        resolvedDay = resolvedDate.value;
      }
    }

    if (itemRepository && resolvedDay) {
      const directory = createDateDirectory(resolvedDay);
      const range = createSingleRange(directory);
      const result = await itemRepository.listByDirectory(range);
      if (result.type === "ok") {
        items = result.value;
      }
    }

    const itemsHtml = items.length === 0 ? "<p>No items for this date.</p>" : "<ul>" +
      items
        .map(
          (item) =>
            `<li>
                <span class="icon">${escapeHtml(item.data.icon.toString())}</span>
                <span class="status">${escapeHtml(item.data.status.toString())}</span>
                <a href="/i/${item.data.id.toString()}">${
              escapeHtml(item.data.title.toString())
            }</a>
              </li>`,
        )
        .join("") +
      "</ul>";

    // Format header
    let headerText: string;
    if (resolvedDay) {
      const humanReadable = formatDateHumanReadable(resolvedDay);
      if (timezone && isTodayInTimezone(resolvedDay, timezone, now)) {
        headerText = `Today - ${humanReadable}`;
      } else {
        headerText = humanReadable;
      }
    } else {
      headerText = dateParam;
    }

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Date: ${escapeHtml(dateParam)}</title></head>
<body>
<main>
  <h1>${escapeHtml(headerText)}</h1>
  ${itemsHtml}
</main>
</body>
</html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
