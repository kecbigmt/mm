import { bold, cyan, dim } from "@std/fmt/colors";
import { Item } from "../../../domain/models/item.ts";

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
    metaParts.push(dim(`+${project.toString()}`));
  }

  // Contexts (todo.txt convention: @context)
  if (contexts && contexts.length > 0) {
    for (const context of contexts) {
      metaParts.push(dim(`@${context.toString()}`));
    }
  }

  // Date (from placement)
  const placement = item.data.placement;
  if (placement.head.kind === "date") {
    const dateStr = placement.head.date.toString();
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

  if (startAt) {
    parts.push(dim(`Start: ${startAt.toString()}`));
  }

  if (duration) {
    parts.push(dim(`Duration: ${duration.toString()}`));
  }

  return parts.join("\n");
};
