import { ValidationError } from "../../shared/errors.ts";

/**
 * Check if debug mode is enabled via MM_DEBUG environment variable
 */
export function isDebugMode(): boolean {
  const debug = Deno.env.get("MM_DEBUG");
  return debug === "1" || debug === "true";
}

/**
 * Format error message for user display
 * In debug mode: shows full technical details
 * In normal mode: shows only user-friendly message
 */
export function formatError(error: unknown): string {
  const debug = isDebugMode();

  // Handle ValidationError
  if (
    typeof error === "object" && error !== null &&
    "kind" in error && error.kind === "ValidationError" &&
    "toString" in error && typeof error.toString === "function"
  ) {
    const validationError = error as ValidationError<string>;

    if (debug) {
      // Debug mode: show full technical details
      return validationError.toString();
    } else {
      // Normal mode: show only the core message(s) from issues
      if (validationError.issues.length > 0) {
        return validationError.issues.map((issue) => issue.message).join("\n");
      }
      return validationError.message;
    }
  }

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
}
