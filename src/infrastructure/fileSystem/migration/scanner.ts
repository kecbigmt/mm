import { join } from "@std/path";
import { Result } from "../../../shared/result.ts";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.ts";
import { walkFiles } from "../file_walker.ts";
import type { MigrationScanError, RawItemFile, RawItemFrontmatter } from "./types.ts";

/**
 * Scan all raw item files in a workspace without domain-level parsing.
 * Returns raw frontmatter + body for migration processing.
 */
export async function* scanRawItems(
  workspaceRoot: string,
): AsyncIterableIterator<Result<RawItemFile, MigrationScanError>> {
  const itemsDir = join(workspaceRoot, "items");

  for await (const filePath of walkFiles(itemsDir, ".md")) {
    let content: string;
    try {
      content = await Deno.readTextFile(filePath);
    } catch (error) {
      yield Result.error({
        kind: "io_error",
        message: "failed to read item file",
        path: filePath,
        cause: error,
      });
      continue;
    }

    const fmResult = parseFrontmatter<RawItemFrontmatter>(content);
    if (fmResult.type === "error") {
      yield Result.error({
        kind: "parse_error",
        message: "failed to parse frontmatter",
        path: filePath,
        cause: fmResult.error,
      });
      continue;
    }

    yield Result.ok({
      filePath,
      frontmatter: fmResult.value.frontmatter,
      body: fmResult.value.body,
    });
  }
}

/**
 * Rewrite an item file with updated frontmatter.
 */
export const writeRawItemFile = async (
  filePath: string,
  frontmatter: RawItemFrontmatter,
  body: string,
): Promise<Result<void, MigrationScanError>> => {
  const content = serializeFrontmatter(frontmatter as Record<string, unknown>, body);
  const tempPath = `${filePath}.tmp`;
  try {
    await Deno.writeTextFile(tempPath, content);
    await Deno.rename(tempPath, filePath);
    return Result.ok(undefined);
  } catch (error) {
    try {
      await Deno.remove(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    return Result.error({
      kind: "io_error",
      message: "failed to write item file",
      path: filePath,
      cause: error,
    });
  }
};
