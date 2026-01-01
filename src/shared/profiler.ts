/**
 * Simple profiler utility for performance measurement.
 *
 * Enable profiling by setting MM_PROFILE=1 environment variable.
 * Results are output to stderr after the operation completes.
 */

type ProfileEntry = {
  name: string;
  startTime: number;
  endTime?: number;
  children: ProfileEntry[];
};

type ProfilerState = {
  enabled: boolean;
  root: ProfileEntry;
  stack: ProfileEntry[];
};

let state: ProfilerState | null = null;

/**
 * Check if profiling is enabled via MM_PROFILE environment variable.
 */
export const isProfilingEnabled = (): boolean => {
  try {
    return Deno.env.get("MM_PROFILE") === "1";
  } catch {
    return false;
  }
};

/**
 * Initialize the profiler. Call this at the start of the operation.
 */
export const profilerInit = (rootName: string): void => {
  if (!isProfilingEnabled()) {
    state = null;
    return;
  }

  const root: ProfileEntry = {
    name: rootName,
    startTime: performance.now(),
    children: [],
  };

  state = {
    enabled: true,
    root,
    stack: [root],
  };
};

/**
 * Start a new profiling section. Sections can be nested.
 */
export const profilerStart = (name: string): void => {
  if (!state?.enabled) return;

  const entry: ProfileEntry = {
    name,
    startTime: performance.now(),
    children: [],
  };

  const current = state.stack[state.stack.length - 1];
  current.children.push(entry);
  state.stack.push(entry);
};

/**
 * End the current profiling section.
 */
export const profilerEnd = (): void => {
  if (!state?.enabled) return;
  if (state.stack.length <= 1) return; // Don't pop root

  const entry = state.stack.pop();
  if (entry) {
    entry.endTime = performance.now();
  }
};

/**
 * Finalize profiling and output results to stderr.
 */
export const profilerFinish = (): void => {
  if (!state?.enabled) return;

  state.root.endTime = performance.now();

  const totalMs = state.root.endTime - state.root.startTime;

  console.error("\n=== Performance Profile ===");
  console.error(`Total: ${totalMs.toFixed(2)}ms\n`);

  printEntry(state.root, 0, totalMs);

  state = null;
};

const printEntry = (entry: ProfileEntry, depth: number, totalMs: number): void => {
  const indent = "  ".repeat(depth);
  const duration = (entry.endTime ?? performance.now()) - entry.startTime;
  const percent = totalMs > 0 ? ((duration / totalMs) * 100).toFixed(1) : "0.0";
  const bar = "█".repeat(Math.round(Number(percent) / 5));

  console.error(`${indent}${entry.name}: ${duration.toFixed(2)}ms (${percent}%) ${bar}`);

  for (const child of entry.children) {
    printEntry(child, depth + 1, totalMs);
  }
};

/**
 * Utility to wrap an async function with profiling.
 */
export const profileAsync = async <T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> => {
  profilerStart(name);
  try {
    return await fn();
  } finally {
    profilerEnd();
  }
};

/**
 * Utility to wrap a sync function with profiling.
 */
export const profileSync = <T>(
  name: string,
  fn: () => T,
): T => {
  profilerStart(name);
  try {
    return fn();
  } finally {
    profilerEnd();
  }
};
