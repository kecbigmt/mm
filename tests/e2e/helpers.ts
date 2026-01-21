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
  gitConfigPath?: string;
  originalGitConfig?: string;
  sessionDir: string;
}>;

/**
 * Sets up an isolated test environment with a temporary MM_HOME.
 */
export const setupTestEnvironment = async (): Promise<TestContext> => {
  const testHome = await Deno.makeTempDir({ prefix: "mm_e2e_test_" });
  const originalHome = Deno.env.get("MM_HOME");
  Deno.env.set("MM_HOME", testHome);

  // Set up Git config for CI environments
  const gitConfigPath = join(testHome, ".gitconfig");
  await Deno.writeTextFile(
    gitConfigPath,
    `[user]
	name = MM Test
	email = test@mm.local
`,
  );
  const originalGitConfig = Deno.env.get("GIT_CONFIG_GLOBAL");
  Deno.env.set("GIT_CONFIG_GLOBAL", gitConfigPath);

  // Create session directory for test isolation
  const sessionDir = await Deno.makeTempDir({ prefix: "mm_e2e_session_" });

  return { testHome, originalHome, gitConfigPath, originalGitConfig, sessionDir };
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

  // Restore Git config
  if (ctx.originalGitConfig !== undefined) {
    Deno.env.set("GIT_CONFIG_GLOBAL", ctx.originalGitConfig);
  } else {
    Deno.env.delete("GIT_CONFIG_GLOBAL");
  }

  if (Deno.env.get("MM_E2E_KEEP") === "1") {
    console.warn(`MM_E2E_KEEP=1 set; preserving test home at ${ctx.testHome}`);
    return;
  }
  await Deno.remove(ctx.testHome, { recursive: true });
  await Deno.remove(ctx.sessionDir, { recursive: true });
};

/**
 * Path to the compiled mm binary. Set MM_TEST_BINARY env to use compiled binary.
 */
const MM_BINARY_PATH = Deno.env.get("MM_TEST_BINARY");

export type RunCommandOptions = Readonly<{
  sessionDir?: string;
}>;

/**
 * Runs an mm CLI command in a subprocess with the test MM_HOME.
 * Uses a unique PPID simulation for session isolation via MM_SESSION_BASE_DIR.
 */
export const runCommand = async (
  testHome: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<CommandResult> => {
  // Inherit GIT_CONFIG_GLOBAL if set (for CI environments)
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    MM_HOME: testHome,
  };

  // Set session base directory for test isolation
  if (options?.sessionDir) {
    env.MM_SESSION_BASE_DIR = options.sessionDir;
  }

  // Clean up environment variables that should not be inherited
  delete env.MM_CWD;

  const command = MM_BINARY_PATH
    ? new Deno.Command(MM_BINARY_PATH, {
      args,
      cwd: Deno.cwd(),
      env,
      stdout: "piped",
      stderr: "piped",
    })
    : new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-read",
        "--allow-write",
        "--allow-env",
        "--allow-run",
        "--allow-sys",
        "src/main.ts",
        ...args,
      ],
      cwd: Deno.cwd(),
      env,
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

export const getCurrentDateFromCli = async (
  testHome: string,
  options?: RunCommandOptions,
): Promise<string> => {
  const pwdResult = await runCommand(testHome, ["pwd"], options);
  if (!pwdResult.success) {
    throw new Error(`Failed to resolve current date from pwd: ${pwdResult.stderr}`);
  }
  const match = pwdResult.stdout.match(/^\/(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new Error(`Failed to extract date from pwd output: ${pwdResult.stdout}`);
  }
  return match[1];
};

export type CdResult = Readonly<{
  success: boolean;
  stdout: string;
  stderr: string;
}>;

/**
 * Runs cd command. With session-based storage, cd writes to session file directly.
 * No special parsing needed - just run the command.
 */
export const runCd = async (
  testHome: string,
  path: string,
  options?: RunCommandOptions,
): Promise<CdResult> => {
  const result = await runCommand(testHome, ["cd", path], options);
  return {
    success: result.success,
    stdout: result.stdout,
    stderr: result.stderr,
  };
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
 * Uses local timezone to match CLI behavior.
 */
export const addDaysToString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");
  return `${newYear}-${newMonth}-${newDay}`;
};

/**
 * Finds the next occurrence of a weekday from a given date.
 * Returns the date string (YYYY-MM-DD) of the next occurrence.
 * If today is the target weekday, returns next week's occurrence.
 * Uses local timezone to match CLI behavior.
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

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const baseIndex = date.getDay();
  let delta = (targetIndex - baseIndex + 7) % 7;
  if (delta === 0) {
    delta = 7; // Next week if today is the target weekday
  }
  date.setDate(date.getDate() + delta);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");
  return `${newYear}-${newMonth}-${newDay}`;
};

/**
 * Finds the previous occurrence of a weekday from a given date.
 * Returns the date string (YYYY-MM-DD) of the previous occurrence.
 * If today is the target weekday, returns last week's occurrence.
 * Uses local timezone to match CLI behavior.
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

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const baseIndex = date.getDay();
  let delta = (baseIndex - targetIndex + 7) % 7;
  if (delta === 0) {
    delta = 7; // Last week if today is the target weekday
  }
  date.setDate(date.getDate() - delta);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");
  return `${newYear}-${newMonth}-${newDay}`;
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
  const candidates = await collectItemFiles(workspaceDir, dateStr);
  if (candidates.length === 0) {
    throw new Error(`No items found${dateStr ? ` for date ${dateStr}` : ""}`);
  }

  const sorted = candidates.map((candidate) => candidate.id).sort();
  return sorted[0];
};

/**
 * Gets item IDs from a date directory, ordered by creation (filename is <uuid>.md).
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
    const itemIds: string[] = [];
    for await (const entry of Deno.readDir(itemsBaseDir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        // Extract UUID from filename (remove .md extension)
        const id = entry.name.slice(0, -3);
        itemIds.push(id);
      }
    }
    // Sort by UUID to get consistent order
    // UUID v7 has timestamp prefix, so sorting gives creation order
    return itemIds.sort();
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
  const candidates = await collectItemFiles(workspaceDir, dateStr);

  for (const candidate of candidates) {
    try {
      const content = await Deno.readTextFile(candidate.filePath);
      if (content.includes(title)) {
        return candidate.id;
      }
    } catch {
      // Skip if file doesn't exist or can't be read
    }
  }
  return null;
};

export const findItemFileById = async (
  testHome: string,
  workspaceName: string,
  itemId: string,
): Promise<string | null> => {
  const workspaceDir = getWorkspacePath(testHome, workspaceName);
  const candidates = await collectItemFiles(workspaceDir);
  const match = candidates.find((candidate) => candidate.id === itemId);
  return match?.filePath ?? null;
};

type ItemFileEntry = Readonly<{
  id: string;
  filePath: string;
}>;

const collectItemFiles = async (
  workspaceDir: string,
  dateStr?: string,
): Promise<ItemFileEntry[]> => {
  const itemsRoot = join(workspaceDir, "items");

  const gatherFromPath = async (baseDir: string): Promise<ItemFileEntry[]> => {
    const entries: ItemFileEntry[] = [];
    try {
      for await (const entry of Deno.readDir(baseDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          // Extract UUID from filename (remove .md extension)
          const id = entry.name.slice(0, -3);
          entries.push({ id, filePath: join(baseDir, entry.name) });
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

  const allEntries: ItemFileEntry[] = [];
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
            if (itemEntry.isFile && itemEntry.name.endsWith(".md")) {
              // Extract UUID from filename (remove .md extension)
              const id = itemEntry.name.slice(0, -3);
              allEntries.push({ id, filePath: join(dayDir, itemEntry.name) });
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

// ANSI escape code pattern for stripping colors
// deno-lint-ignore no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Strips ANSI escape codes from a string.
 */
export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

/**
 * Filters ls command output to only include item lines (not headers, stubs, or empty lines).
 * Headers are lines that start with [ (possibly with ANSI codes).
 * Stubs are lines that start with 📁 or [section].
 * Item lines typically start with an emoji (📝, ✔️, ✅, 🗞️, 🕒) or plain icon like [note], [task], [event].
 *
 * @param lsOutput - Raw output from ls command
 * @returns Array of item lines only
 */
export const extractItemLines = (lsOutput: string): string[] => {
  return lsOutput
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return false;

      // Strip ANSI codes and check if it's a header line
      const stripped = stripAnsi(trimmed);

      // Header lines start with [ like [2025-11-29] or [alias/1]
      if (stripped.startsWith("[")) return false;

      // Section stubs start with folder icon
      if (stripped.startsWith("📁")) return false;

      return true;
    });
};
