import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";

/**
 * Reads the raw schema field from workspace.json without parsing settings.
 * Used for schema version checking before full workspace loading.
 */
export const readWorkspaceSchema = async (
  workspaceRoot: string,
): Promise<Result<string | undefined, RepositoryError>> => {
  const path = join(workspaceRoot, "workspace.json");
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as { schema?: string };
    return Result.ok(typeof data.schema === "string" ? data.schema : undefined);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(undefined);
    }
    return Result.error(
      createRepositoryError("workspace", "load", "failed to read workspace schema", {
        cause: error,
      }),
    );
  }
};

/**
 * Writes the raw schema field to workspace.json, preserving other fields.
 */
export const writeWorkspaceSchema = async (
  workspaceRoot: string,
  schema: string,
): Promise<Result<void, RepositoryError>> => {
  const path = join(workspaceRoot, "workspace.json");
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as Record<string, unknown>;
    data.schema = schema;
    const payload = JSON.stringify(data, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("workspace", "save", "failed to update workspace schema", {
        cause: error,
      }),
    );
  }
};
