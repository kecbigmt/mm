/**
 * Check if debug mode is enabled via MM_DEBUG environment variable
 */
export function isDebugMode(): boolean {
  const debug = Deno.env.get("MM_DEBUG");
  return debug === "1" || debug === "true";
}
