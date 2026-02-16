import { bold, cyan, dim } from "@std/fmt/colors";
import { Item } from "../../../domain/models/item.ts";
import { type ItemIdResolver } from "./list_formatter.ts";

/**
 * Truncates a UUID to a short display form (first 8 characters).
 */
const truncateUuid = (uuid: string): string => uuid.slice(0, 8) + "…";

/**
 * Format an item's full details for display in show command.
 *
 * Output format:
 * ```
 * {alias} {title}
 * {type}:{status} +{project} @{context}... on:{date}
 *
 * {body}
 *
 * UUID: {uuid}
 * Created: {createdAt}
 * Updated: {updatedAt}
 * Closed: {closedAt}       # if closed
 * SnoozeUntil: {snoozeUntil} # if snoozing
 * Start: {startAt}         # if event
 * Duration: {duration}     # if event
 * ```
 */
export const formatItemDetail = (item: Item, resolveItemId?: ItemIdResolver): string => {
  const {
    id,
    title,
    icon,
    status,
    alias,
    project,
    contexts,
    body,
    createdAt,
    updatedAt,
    closedAt,
    snoozeUntil,
    startAt,
    duration,
  } = item.data;

  const parts: string[] = [];

  // === HEADER LINE 1: alias + title ===
  const identifier = alias?.toString() ?? id.toString();
  parts.push(`${cyan(identifier)} ${bold(title.toString())}`);

  // === HEADER LINE 2: type:status + metadata ===
  const metaParts: string[] = [];

  // Type and status
  const typeStr = icon.toString();
  const statusStr = status.toString();
  metaParts.push(dim(`${typeStr}:${statusStr}`));

  // Project (todo.txt convention: +project)
  if (project) {
    const projectId = project.toString();
    const displayStr = resolveItemId?.(projectId) ?? truncateUuid(projectId);
    metaParts.push(dim(`+${displayStr}`));
  }

  // Contexts (todo.txt convention: @context)
  if (contexts && contexts.length > 0) {
    for (const context of contexts) {
      const contextId = context.toString();
      const displayStr = resolveItemId?.(contextId) ?? truncateUuid(contextId);
      metaParts.push(dim(`@${displayStr}`));
    }
  }

  // Date (from directory)
  const dir = item.data.directory;
  if (dir.head.kind === "date") {
    const dateStr = dir.head.date.toString();
    metaParts.push(dim(`on:${dateStr}`));
  }

  parts.push(metaParts.join(" "));

  // === BODY SECTION ===
  if (body && body.trim().length > 0) {
    parts.push(""); // blank line
    parts.push(body.trim());
  }

  // === METADATA SECTION ===
  parts.push(""); // blank line
  parts.push(dim(`UUID: ${id.toString()}`));
  parts.push(dim(`Created: ${createdAt.toString()}`));
  parts.push(dim(`Updated: ${updatedAt.toString()}`));

  if (closedAt) {
    parts.push(dim(`Closed: ${closedAt.toString()}`));
  }

  if (snoozeUntil) {
    parts.push(dim(`SnoozeUntil: ${snoozeUntil.toString()}`));
  }

  if (startAt) {
    parts.push(dim(`Start: ${startAt.toString()}`));
  }

  if (duration) {
    parts.push(dim(`Duration: ${duration.toString()}`));
  }

  return parts.join("\n");
};
