import { ValidationError } from "../../shared/errors.ts";
import { bold, red } from "@std/fmt/colors";

const ERROR_PREFIX = `${bold(red("error"))}: `;

/**
 * Format error message for user display
 * In debug mode: shows full technical details (no color)
 * In normal mode: shows only user-friendly message (red color)
 *
 * @param error - The error to format
 * @param isDebug - Whether to show debug details (default: false)
 */
export function formatError(error: unknown, isDebug = false): string {
  // Handle ValidationError
  if (
    typeof error === "object" && error !== null &&
    "kind" in error && (error as { kind: string }).kind === "ValidationError" &&
    "toString" in error && typeof error.toString === "function"
  ) {
    const validationError = error as ValidationError<string>;

    if (isDebug) {
      // Debug mode: show full technical details (no color)
      return validationError.toString();
    } else {
      // Normal mode: show only the core message(s) from issues with "error" prefix (bold+red)
      if (validationError.issues.length > 0) {
        const messages = validationError.issues.map((issue) => issue.message).join("\n");
        return `${ERROR_PREFIX}${messages}`;
      }
      return `${ERROR_PREFIX}${validationError.message}`;
    }
  }

  // Handle any BaseError-like object (has string kind and message)
  if (
    typeof error === "object" && error !== null &&
    "kind" in error && typeof (error as { kind: unknown }).kind === "string" &&
    "message" in error && typeof (error as { message: unknown }).message === "string"
  ) {
    const baseError = error as { kind: string; message: string; toString?(): string };

    if (isDebug) {
      if (typeof baseError.toString === "function") {
        return baseError.toString();
      }
      return `${baseError.kind}: ${baseError.message}`;
    }
    return `${ERROR_PREFIX}${baseError.message}`;
  }

  // Handle unexpected errors (not user-facing ValidationErrors)
  // In debug mode: show technical details
  // In normal mode: hide details and show generic message

  if (isDebug) {
    // Handle errors with message property
    if (
      typeof error === "object" && error !== null &&
      "message" in error && typeof error.message === "string"
    ) {
      return error.message;
    }

    // Handle errors with toString
    if (
      typeof error === "object" && error !== null &&
      "toString" in error && typeof error.toString === "function"
    ) {
      return error.toString();
    }

    // Fallback
    return String(error);
  } else {
    // Normal mode: don't expose internal error details
    return `${ERROR_PREFIX}An unexpected error occurred.`;
  }
}
