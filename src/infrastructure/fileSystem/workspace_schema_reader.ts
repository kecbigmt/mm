import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";

/**
 * Reads the migration version from workspace.json.
 * Missing field defaults to 1 (pre-migration workspace).
 */
export const readMigrationVersion = async (
  workspaceRoot: string,
): Promise<Result<number, RepositoryError>> => {
  const path = join(workspaceRoot, "workspace.json");
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as { migration?: number };
    return Result.ok(typeof data.migration === "number" ? data.migration : 1);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(1);
    }
    return Result.error(
      createRepositoryError("workspace", "load", "failed to read migration version", {
        cause: error,
      }),
    );
  }
};

/**
 * Writes the migration version to workspace.json, preserving other fields.
 */
export const writeMigrationVersion = async (
  workspaceRoot: string,
  migration: number,
): Promise<Result<void, RepositoryError>> => {
  const path = join(workspaceRoot, "workspace.json");
  try {
    const text = await Deno.readTextFile(path);
    const data = JSON.parse(text) as Record<string, unknown>;
    data.migration = migration;
    const payload = JSON.stringify(data, null, 2);
    await Deno.writeTextFile(path, `${payload}\n`);
    return Result.ok(undefined);
  } catch (error) {
    return Result.error(
      createRepositoryError("workspace", "save", "failed to update migration version", {
        cause: error,
      }),
    );
  }
};
