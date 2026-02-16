import { join } from "@std/path";

/**
 * Recursively walk directories yielding file paths matching a suffix.
 * Silently skips directories that do not exist.
 */
export async function* walkFiles(
  directory: string,
  suffix: string,
): AsyncIterableIterator<string> {
  try {
    for await (const entry of Deno.readDir(directory)) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory) {
        yield* walkFiles(entryPath, suffix);
      } else if (entry.isFile && entry.name.endsWith(suffix)) {
        yield entryPath;
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}
