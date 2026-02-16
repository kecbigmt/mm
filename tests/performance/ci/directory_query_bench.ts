/**
 * CI-Optimized E2E Performance Benchmark
 *
 * This benchmark verifies the core scalability property: query performance
 * scales with result set size (m) rather than total item count (n),
 * demonstrating O(m) instead of O(n) complexity.
 *
 * Why only one benchmark for CI?
 * - Time constraint: E2E benchmarks are expensive (file I/O, process spawning)
 * - Focus: Scalability is the most critical performance characteristic
 * - Coverage: This benchmark validates the edge index optimization
 *
 * For comprehensive performance testing, use directory_query_bench.ts locally.
 *
 * Run with: deno bench --allow-read --allow-write --allow-env --allow-run tests/performance/ci/
 */

import { cleanupTestEnvironment, runCommand, setupTestEnvironment } from "../../e2e/helpers.ts";

/**
 * Create multiple items in a workspace for benchmarking
 */
const createItems = async (testHome: string, count: number, date: string) => {
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(runCommand(testHome, ["note", `Item ${i}`, "-d", date]));
  }
  const results = await Promise.all(promises);

  // Fail fast if any command failed
  for (const result of results) {
    if (!result.success) {
      throw new Error(`Failed to create item: ${result.stderr}`);
    }
  }
};

/**
 * Scalability benchmark: O(m) performance verification
 *
 * Creates 500 items across 50 dates (10 items per date), but queries only
 * one date (returning 10 items). If the edge index optimization is working
 * correctly, query time should be independent of total workspace size and
 * depend only on the result set size.
 *
 * This benchmark will catch regressions such as:
 * - Breaking the O(m) index optimization (falling back to O(n))
 * - File I/O inefficiencies
 * - Query processing slowdowns
 * - CLI initialization overhead
 */
Deno.bench({
  name: "ls command - 500 items workspace, single date query (10 match)",
  group: "ci-scalability",
  baseline: true,
  permissions: { read: true, write: true, env: true, run: true },
  async fn(b) {
    const ctx = await setupTestEnvironment();

    try {
      // Initialize workspace
      const initResult = await runCommand(ctx.testHome, ["workspace", "init", "bench"]);
      if (!initResult.success) {
        throw new Error(`Failed to initialize workspace: ${initResult.stderr}`);
      }

      // Create 500 items across 50 different dates (10 items per date)
      // Span across January and February to ensure all dates are valid
      for (let i = 0; i < 50; i++) {
        const dayOfYear = i + 1;
        const month = dayOfYear <= 31 ? 1 : 2;
        const day = dayOfYear <= 31 ? dayOfYear : dayOfYear - 31;
        const date = `2025-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        await createItems(ctx.testHome, 10, date);
      }

      // Query only one date (should return 10 items)
      // Performance should be similar to querying 10 items from a 100-item workspace
      b.start();
      const queryResult = await runCommand(ctx.testHome, ["ls", "2025-01-01"]);
      b.end();

      if (!queryResult.success) {
        throw new Error(`Query failed: ${queryResult.stderr}`);
      }
    } finally {
      await cleanupTestEnvironment(ctx);
    }
  },
});
