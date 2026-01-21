import { EnumType } from "@cliffy/command";

/**
 * Shared CLI type definitions
 *
 * This module contains type definitions used across multiple CLI commands
 * to ensure consistency and avoid duplication.
 */

// Item type enumeration for filtering by note, task, or event
export const itemTypeEnum = new EnumType(["note", "task", "event"]);
