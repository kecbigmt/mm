/**
 * E2E Test Helpers
 *
 * Common utilities for E2E testing with isolated test environments.
 * All E2E scenarios should use these helpers to ensure test isolation.
 */

import { join } from "@std/path";

export type CommandResult = Readonly<{
  success: boolean;
  stdout: string;
  stderr: string;
}>;

export type TestContext = Readonly<{
  testHome: string;
  originalHome: string | undefined;
}>;

/**
 * Sets up an isolated test environment with a temporary MM_HOME.
 */
export const setupTestEnvironment = async (): Promise<TestContext> => {
  const testHome = await Deno.makeTempDir({ prefix: "mm_e2e_test_" });
  const originalHome = Deno.env.get("MM_HOME");
  Deno.env.set("MM_HOME", testHome);
  return { testHome, originalHome };
};

/**
 * Tears down the test environment and restores original state.
 */
export const cleanupTestEnvironment = async (ctx: TestContext): Promise<void> => {
  if (ctx.originalHome !== undefined) {
    Deno.env.set("MM_HOME", ctx.originalHome);
  } else {
    Deno.env.delete("MM_HOME");
  }
  if (Deno.env.get("MM_E2E_KEEP") === "1") {
    console.warn(`MM_E2E_KEEP=1 set; preserving test home at ${ctx.testHome}`);
    return;
  }
  await Deno.remove(ctx.testHome, { recursive: true });
};

/**
 * Runs an mm CLI command in a subprocess with the test MM_HOME.
 */
export const runCommand = async (
  testHome: string,
  args: string[],
): Promise<CommandResult> => {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "src/main.ts",
      ...args,
    ],
    cwd: Deno.cwd(),
    env: {
      ...Deno.env.toObject(),
      MM_HOME: testHome,
    },
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  const { success, stdout, stderr } = await process.output();
  return {
    success,
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
  };
};

export const getCurrentDateFromCli = async (testHome: string): Promise<string> => {
  const pwdResult = await runCommand(testHome, ["pwd"]);
  if (!pwdResult.success) {
    throw new Error(`Failed to resolve current date from pwd: ${pwdResult.stderr}`);
  }
  const match = pwdResult.stdout.match(/^\/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : getTodayString();
};

/**
 * Initializes a workspace. Convenience wrapper for common test setup.
 */
export const initWorkspace = async (
  testHome: string,
  name: string,
): Promise<CommandResult> => {
  return await runCommand(testHome, ["workspace", "init", name]);
};

/**
 * Resolves the file system path for a workspace directory.
 */
export const getWorkspacePath = (testHome: string, name: string): string => {
  return join(testHome, "workspaces", name);
};

/**
 * Returns today's date for testing date-based operations.
 */
export const getTodayString = (): string => {
  return new Date().toISOString().split("T")[0];
};

/**
 * Extracts item ID from command output for test assertions.
 */
export const parseItemIdFromOutput = (output: string): string | null => {
  const match = output.match(/Created item: ([a-f0-9-]+)/);
  return match ? match[1] : null;
};

/**
 * Extracts alias from command output for test assertions.
 */
export const parseAliasFromOutput = (output: string): string | null => {
  const match = output.match(/Alias: ([a-z0-9-]+)/);
  return match ? match[1] : null;
};

/**
 * Calculates a date string by adding days to a base date.
 * Useful for testing relative date operations.
 */
export const addDaysToString = (dateStr: string, days: number): string => {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
};

/**
 * Finds the next occurrence of a weekday from a given date.
 * Returns the date string (YYYY-MM-DD) of the next occurrence.
 * If today is the target weekday, returns next week's occurrence.
 */
export const findNextWeekday = (dateStr: string, weekday: string): string => {
  const WEEKDAY_INDEX: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const targetIndex = WEEKDAY_INDEX[weekday.toLowerCase()];
  if (targetIndex === undefined) {
    throw new Error(`Invalid weekday: ${weekday}`);
  }

  const date = new Date(dateStr + "T00:00:00Z");
  const baseIndex = date.getUTCDay();
  let delta = (targetIndex - baseIndex + 7) % 7;
  if (delta === 0) {
    delta = 7; // Next week if today is the target weekday
  }
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().split("T")[0];
};

/**
 * Finds the previous occurrence of a weekday from a given date.
 * Returns the date string (YYYY-MM-DD) of the previous occurrence.
 * If today is the target weekday, returns last week's occurrence.
 */
export const findPreviousWeekday = (dateStr: string, weekday: string): string => {
  const WEEKDAY_INDEX: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const targetIndex = WEEKDAY_INDEX[weekday.toLowerCase()];
  if (targetIndex === undefined) {
    throw new Error(`Invalid weekday: ${weekday}`);
  }

  const date = new Date(dateStr + "T00:00:00Z");
  const baseIndex = date.getUTCDay();
  let delta = (baseIndex - targetIndex + 7) % 7;
  if (delta === 0) {
    delta = 7; // Last week if today is the target weekday
  }
  date.setUTCDate(date.getUTCDate() - delta);
  return date.toISOString().split("T")[0];
};

/**
 * Gets the first item ID from the filesystem for a given date.
 * Assumes exactly one item exists for the date. Use this after creating a single item.
 * @param testHome - Test environment home directory
 * @param workspaceName - Workspace name
 * @param dateStr - Date string (YYYY-MM-DD), defaults to today
 * @returns The item ID (UUID)
 */
export const getLatestItemId = async (
  testHome: string,
  workspaceName: string,
  dateStr?: string,
): Promise<string> => {
  const workspaceDir = getWorkspacePath(testHome, workspaceName);
  const candidates = await collectItemDirectories(workspaceDir, dateStr);
  if (candidates.length === 0) {
    throw new Error(`No items found${dateStr ? ` for date ${dateStr}` : ""}`);
  }

  const sorted = candidates.map((candidate) => candidate.id).sort();
  return sorted[0];
};

/**
 * Gets item IDs from a date directory, ordered by creation (directory name is UUID).
 * Returns an array of item IDs in creation order.
 */
export const getItemIdsFromDate = async (
  testHome: string,
  workspaceName: string,
  dateStr: string,
): Promise<string[]> => {
  const workspaceDir = getWorkspacePath(testHome, workspaceName);
  const [year, month, day] = dateStr.split("-");
  const itemsBaseDir = join(workspaceDir, "items", year, month, day);

  try {
    const itemDirs: string[] = [];
    for await (const entry of Deno.readDir(itemsBaseDir)) {
      if (entry.isDirectory) {
        itemDirs.push(entry.name);
      }
    }
    // Sort by directory name (UUID) to get consistent order
    // UUID v7 has timestamp prefix, so sorting gives creation order
    return itemDirs.sort();
  } catch {
    return [];
  }
};

/**
 * Gets an item ID by title from ls output or filesystem.
 * If title is provided, searches ls output; otherwise uses filesystem order.
 */
export const getItemIdByTitle = async (
  testHome: string,
  workspaceName: string,
  dateStr: string,
  title: string,
): Promise<string | null> => {
  const workspaceDir = getWorkspacePath(testHome, workspaceName);
  const candidates = await collectItemDirectories(workspaceDir, dateStr);

  for (const candidate of candidates) {
    const contentMd = join(candidate.directory, "content.md");
    try {
      const content = await Deno.readTextFile(contentMd);
      if (content.includes(title)) {
        return candidate.id;
      }
    } catch {
      // Skip if content.md doesn't exist or can't be read
    }
  }
  return null;
};

export const findItemDirectoryById = async (
  testHome: string,
  workspaceName: string,
  itemId: string,
): Promise<string | null> => {
  const workspaceDir = getWorkspacePath(testHome, workspaceName);
  const candidates = await collectItemDirectories(workspaceDir);
  const match = candidates.find((candidate) => candidate.id === itemId);
  return match?.directory ?? null;
};

type ItemDirectoryEntry = Readonly<{
  id: string;
  directory: string;
}>;

const collectItemDirectories = async (
  workspaceDir: string,
  dateStr?: string,
): Promise<ItemDirectoryEntry[]> => {
  const itemsRoot = join(workspaceDir, "items");

  const gatherFromPath = async (baseDir: string): Promise<ItemDirectoryEntry[]> => {
    const entries: ItemDirectoryEntry[] = [];
    try {
      for await (const entry of Deno.readDir(baseDir)) {
        if (entry.isDirectory) {
          entries.push({ id: entry.name, directory: join(baseDir, entry.name) });
        }
      }
    } catch {
      // ignore missing directories
    }
    return entries;
  };

  if (dateStr) {
    const [year, month, day] = dateStr.split("-");
    const dateDir = join(itemsRoot, year, month, day);
    const entries = await gatherFromPath(dateDir);
    if (entries.length > 0) {
      return entries;
    }
  }

  const allEntries: ItemDirectoryEntry[] = [];
  try {
    for await (const yearEntry of Deno.readDir(itemsRoot)) {
      if (!yearEntry.isDirectory || yearEntry.name.startsWith(".")) {
        continue;
      }
      const yearDir = join(itemsRoot, yearEntry.name);
      for await (const monthEntry of Deno.readDir(yearDir)) {
        if (!monthEntry.isDirectory || monthEntry.name.startsWith(".")) {
          continue;
        }
        const monthDir = join(yearDir, monthEntry.name);
        for await (const dayEntry of Deno.readDir(monthDir)) {
          if (!dayEntry.isDirectory || dayEntry.name.startsWith(".")) {
            continue;
          }
          if (dayEntry.name === "edges") {
            continue;
          }
          const dayDir = join(monthDir, dayEntry.name);
          for await (const itemEntry of Deno.readDir(dayDir)) {
            if (itemEntry.isDirectory && !itemEntry.name.startsWith(".")) {
              allEntries.push({ id: itemEntry.name, directory: join(dayDir, itemEntry.name) });
            }
          }
        }
      }
    }
  } catch {
    // ignore missing trees
  }

  return allEntries;
};
