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
