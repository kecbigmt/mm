/**
 * Deno Benchmark Comparison Script
 *
 * Compares benchmark results from main branch vs PR branch
 * and generates a Markdown report.
 *
 * Usage:
 *   deno run --allow-read scripts/bench_compare_main_vs_pr.ts \
 *     bench-main.json bench-pr.json > bench-report.md
 */

interface BenchResult {
  origin: string;
  group?: string;
  name: string;
  baseline: boolean;
  results: Array<{
    ok?: {
      n: number;
      min: number;
      max: number;
      avg: number;
      p75: number;
      p99: number;
      p995: number;
      p999: number;
    };
    failed?: {
      error: string;
    };
  }>;
}

interface ComparisonRow {
  group: string;
  name: string;
  mainAvg: number | null;
  prAvg: number | null;
  ratio: number | null;
  percentChange: number | null;
}

function nsToMs(ns: number): number {
  return ns / 1_000_000;
}

function formatMs(ms: number): string {
  return ms.toFixed(3);
}

function formatRatio(ratio: number, percentChange: number): string {
  const sign = percentChange > 0 ? "+" : "";
  const indicator = Math.abs(percentChange) > 5 ? "**" : "";
  return `${indicator}${ratio.toFixed(2)}x (${sign}${percentChange.toFixed(0)}%)${indicator}`;
}

async function loadBenchResults(path: string): Promise<BenchResult[]> {
  try {
    const content = await Deno.readTextFile(path);
    const lines = content.trim().split("\n");
    const results: BenchResult[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        results.push(parsed);
      } catch {
        // Skip invalid JSON lines
      }
    }

    return results;
  } catch (error) {
    console.error(`Error reading ${path}: ${error}`);
    return [];
  }
}

function extractAvg(result: BenchResult): number | null {
  const firstResult = result.results?.[0];
  if (!firstResult?.ok) return null;
  return firstResult.ok.avg;
}

function compareBenchmarks(
  mainResults: BenchResult[],
  prResults: BenchResult[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  // Create a map of main results for quick lookup
  const mainMap = new Map<string, BenchResult>();
  for (const result of mainResults) {
    const key = `${result.group || "-"}::${result.name}`;
    mainMap.set(key, result);
  }

  // Create a map of PR results
  const prMap = new Map<string, BenchResult>();
  for (const result of prResults) {
    const key = `${result.group || "-"}::${result.name}`;
    prMap.set(key, result);
  }

  // Get all unique keys
  const allKeys = new Set([...mainMap.keys(), ...prMap.keys()]);

  for (const key of allKeys) {
    const mainResult = mainMap.get(key);
    const prResult = prMap.get(key);

    const group = mainResult?.group || prResult?.group || "-";
    const name = mainResult?.name || prResult?.name || "unknown";

    const mainAvg = mainResult ? extractAvg(mainResult) : null;
    const prAvg = prResult ? extractAvg(prResult) : null;

    let ratio: number | null = null;
    let percentChange: number | null = null;

    if (mainAvg !== null && prAvg !== null) {
      ratio = prAvg / mainAvg;
      percentChange = ((prAvg - mainAvg) / mainAvg) * 100;
    }

    rows.push({
      group,
      name,
      mainAvg,
      prAvg,
      ratio,
      percentChange,
    });
  }

  return rows;
}

function generateMarkdownReport(rows: ComparisonRow[]): string {
  let md = "## Deno Bench Comparison (main vs PR)\n\n";

  if (rows.length === 0) {
    md += "> No benchmark results found.\n";
    return md;
  }

  md += "| Group | Name | main avg (ms) | PR avg (ms) | Ratio |\n";
  md += "|-------|------|---------------|-------------|-------|\n";

  for (const row of rows) {
    const group = row.group;
    const name = row.name;

    let mainAvgStr = "-";
    let prAvgStr = "-";
    let ratioStr = "-";

    if (row.mainAvg === null && row.prAvg !== null) {
      prAvgStr = formatMs(nsToMs(row.prAvg));
      ratioStr = "(only in PR)";
    } else if (row.mainAvg !== null && row.prAvg === null) {
      mainAvgStr = formatMs(nsToMs(row.mainAvg));
      ratioStr = "(only in main)";
    } else if (
      row.mainAvg !== null && row.prAvg !== null && row.ratio !== null &&
      row.percentChange !== null
    ) {
      mainAvgStr = formatMs(nsToMs(row.mainAvg));
      prAvgStr = formatMs(nsToMs(row.prAvg));
      ratioStr = formatRatio(row.ratio, row.percentChange);
    }

    md += `| ${group} | ${name} | ${mainAvgStr} | ${prAvgStr} | ${ratioStr} |\n`;
  }

  md += "\n";
  md += "> Note: CI does not fail on performance differences.  \n";
  md += "> CI fails **only** if deno bench itself fails.\n";

  return md;
}

async function main() {
  try {
    const args = Deno.args;

    if (args.length < 2) {
      console.error(
        "Usage: deno run --allow-read bench_compare_main_vs_pr.ts <main.json> <pr.json>",
      );
      Deno.exit(0); // Exit 0 as per spec
    }

    const [mainPath, prPath] = args;

    const mainResults = await loadBenchResults(mainPath);
    const prResults = await loadBenchResults(prPath);

    const rows = compareBenchmarks(mainResults, prResults);
    const report = generateMarkdownReport(rows);

    console.log(report);

    Deno.exit(0);
  } catch (error) {
    console.error("Error generating comparison report:", error);
    console.log("\n## Deno Bench Comparison (main vs PR)\n\n");
    console.log("> Failed to generate comparison report.\n");
    Deno.exit(0); // Exit 0 even on error as per spec
  }
}

if (import.meta.main) {
  main();
}
