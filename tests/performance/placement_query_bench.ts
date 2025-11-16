/**
 * E2E Performance Benchmarks for Placement Queries
 *
 * These benchmarks test the real-world performance of the `ls` command
 * using the edge index optimization.
 *
 * The benchmarks verify that query performance scales with result set size (m)
 * rather than total item count (n), demonstrating O(m) instead of O(n) complexity.
 *
 * Run with: deno bench --allow-read --allow-write --allow-env --allow-run tests/performance/
 */

import { cleanupTestEnvironment, runCommand, setupTestEnvironment } from "../e2e/helpers.ts";

/**
 * Create multiple items in a workspace for benchmarking
 */
const createItems = async (testHome: string, count: number, date: string) => {
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(runCommand(testHome, ["note", `Item ${i}`, "-p", date]));
  }
  await Promise.all(promises);
};

/**
 * Baseline: Query with small workspace (100 items)
 */
Deno.bench({
  name: "ls command - 100 items, single date (10 match)",
  group: "scalability",
  baseline: true,
  permissions: { read: true, write: true, env: true, run: true },
  async fn(b) {
    const ctx = await setupTestEnvironment();

    try {
      // Initialize workspace
      await runCommand(ctx.testHome, ["workspace", "init", "bench"]);

      // Create 100 items across 10 different dates (10 items per date)
      for (let day = 1; day <= 10; day++) {
        const date = `2025-01-${day.toString().padStart(2, "0")}`;
        await createItems(ctx.testHome, 10, date);
      }

      // Query only one date (should return 10 items)
      b.start();
      await runCommand(ctx.testHome, ["ls", "2025-01-01"]);
      b.end();
    } finally {
      await cleanupTestEnvironment(ctx);
    }
  },
});

/**
 * Scale test: Query with medium workspace (1000 items)
 *
 * If optimization works correctly, this should not be significantly
 * slower than the 100-item case, since we're still only matching 10 items.
 */
Deno.bench({
  name: "ls command - 1000 items, single date (10 match)",
  group: "scalability",
  permissions: { read: true, write: true, env: true, run: true },
  async fn(b) {
    const ctx = await setupTestEnvironment();

    try {
      await runCommand(ctx.testHome, ["workspace", "init", "bench"]);

      // Create 1000 items across 100 different dates (10 items per date)
      for (let day = 1; day <= 100; day++) {
        const date = `2025-01-${day.toString().padStart(2, "0")}`;
        await createItems(ctx.testHome, 10, date);
      }

      // Query only one date (should return 10 items)
      b.start();
      await runCommand(ctx.testHome, ["ls", "2025-01-01"]);
      b.end();
    } finally {
      await cleanupTestEnvironment(ctx);
    }
  },
});

/**
 * Date range query: 7 days
 */
Deno.bench({
  name: "ls command - date range (7 days, 70 items match)",
  group: "date-range",
  permissions: { read: true, write: true, env: true, run: true },
  async fn(b) {
    const ctx = await setupTestEnvironment();

    try {
      await runCommand(ctx.testHome, ["workspace", "init", "bench"]);

      // Create items across 30 days
      for (let day = 1; day <= 30; day++) {
        const date = `2025-01-${day.toString().padStart(2, "0")}`;
        await createItems(ctx.testHome, 10, date);
      }

      // Query 7-day range (should return 70 items)
      b.start();
      await runCommand(ctx.testHome, ["ls", "2025-01-01..2025-01-07"]);
      b.end();
    } finally {
      await cleanupTestEnvironment(ctx);
    }
  },
});

/**
 * Empty result query
 *
 * This should be very fast regardless of workspace size.
 */
Deno.bench({
  name: "ls command - empty result (no items match)",
  group: "edge-cases",
  permissions: { read: true, write: true, env: true, run: true },
  async fn(b) {
    const ctx = await setupTestEnvironment();

    try {
      await runCommand(ctx.testHome, ["workspace", "init", "bench"]);

      // Create items on different dates
      for (let day = 1; day <= 10; day++) {
        const date = `2025-01-${day.toString().padStart(2, "0")}`;
        await createItems(ctx.testHome, 10, date);
      }

      // Query a date with no items
      b.start();
      await runCommand(ctx.testHome, ["ls", "2025-02-01"]);
      b.end();
    } finally {
      await cleanupTestEnvironment(ctx);
    }
  },
});

/**
 * Large result set query
 *
 * Tests performance when many items match.
 */
Deno.bench({
  name: "ls command - large result set (100 items match)",
  group: "result-size",
  permissions: { read: true, write: true, env: true, run: true },
  async fn(b) {
    const ctx = await setupTestEnvironment();

    try {
      await runCommand(ctx.testHome, ["workspace", "init", "bench"]);

      // Create 100 items on one date
      await createItems(ctx.testHome, 100, "2025-01-01");

      // Create items on other dates too
      for (let day = 2; day <= 10; day++) {
        const date = `2025-01-${day.toString().padStart(2, "0")}`;
        await createItems(ctx.testHome, 10, date);
      }

      // Query the date with 100 items
      b.start();
      await runCommand(ctx.testHome, ["ls", "2025-01-01"]);
      b.end();
    } finally {
      await cleanupTestEnvironment(ctx);
    }
  },
});
