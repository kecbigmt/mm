import { bold, cyan, dim } from "@std/fmt/colors";
import { Item } from "../../../domain/models/item.ts";
import { formatItemIcon } from "./list_formatter.ts";

/**
 * Format an item's full details for display in show command.
 *
 * Output format:
 * ```
 * {alias} {icon} {title} +{project} @{context}... on:{date}
 *
 * {body}
 *
 * UUID: {uuid}
 * Created: {createdAt}
 * Updated: {updatedAt}
 * Closed: {closedAt}  # if closed
 * Start: {startAt}    # if event
 * Duration: {duration} # if event
 * ```
 */
export const formatItemDetail = (item: Item): string => {
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
    startAt,
    duration,
  } = item.data;

  const parts: string[] = [];

  // === HEADER LINE ===
  const headerParts: string[] = [];

  // Alias or UUID
  const identifier = alias?.toString() ?? id.toString();
  headerParts.push(cyan(identifier));

  // Icon
  const iconStr = formatItemIcon(icon, status);
  headerParts.push(iconStr);

  // Title
  headerParts.push(bold(title.toString()));

  // Project (todo.txt convention: +project)
  if (project) {
    headerParts.push(dim(`+${project.toString()}`));
  }

  // Contexts (todo.txt convention: @context)
  if (contexts && contexts.length > 0) {
    for (const context of contexts) {
      headerParts.push(dim(`@${context.toString()}`));
    }
  }

  // Date (from placement)
  const placement = item.data.placement;
  if (placement.head.kind === "date") {
    const dateStr = placement.head.date.toString();
    headerParts.push(dim(`on:${dateStr}`));
  }

  parts.push(headerParts.join(" "));

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

  if (startAt) {
    parts.push(dim(`Start: ${startAt.toString()}`));
  }

  if (duration) {
    parts.push(dim(`Duration: ${duration.toString()}`));
  }

  return parts.join("\n");
};
