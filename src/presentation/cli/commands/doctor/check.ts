import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../../dependencies.ts";
import {
  createWorkspaceScanner,
  ScanError,
} from "../../../../infrastructure/fileSystem/workspace_scanner.ts";
import {
  checkIndexIntegrity,
  EdgeReferenceWithPath,
  IndexIntegrityIssue,
} from "../../../../infrastructure/fileSystem/index_doctor.ts";
import { Item } from "../../../../domain/models/item.ts";
import { Alias } from "../../../../domain/models/alias.ts";
import { parseItemId } from "../../../../domain/primitives/item_id.ts";
import { formatError } from "../../error_formatter.ts";
import { isDebugMode } from "../../debug.ts";

/**
 * Item validation issue (parse errors during scanning)
 */
type ItemValidationIssue = Readonly<{
  path: string;
  error: ScanError;
}>;

/**
 * Edge validation issue (parse errors during scanning)
 */
type EdgeValidationIssue = Readonly<{
  path: string;
  error: ScanError;
}>;

/**
 * Alias validation issue (parse errors during scanning)
 */
type AliasValidationIssue = Readonly<{
  path: string;
  error: ScanError;
}>;

/**
 * Complete check report
 */
type CheckReport = Readonly<{
  itemsScanned: number;
  edgesScanned: number;
  aliasesScanned: number;
  itemIssues: ReadonlyArray<ItemValidationIssue>;
  edgeIssues: ReadonlyArray<EdgeValidationIssue>;
  aliasIssues: ReadonlyArray<AliasValidationIssue>;
  integrityIssues: ReadonlyArray<IndexIntegrityIssue>;
}>;

/**
 * Create the check subcommand for mm doctor
 */
export function createCheckCommand() {
  return new Command()
    .description("Inspect workspace integrity without modifications")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .action(async (options: Record<string, unknown>) => {
      const debug = isDebugMode();
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);

      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(formatError(depsResult.error.error, debug));
        } else {
          console.error(formatError(depsResult.error, debug));
        }
        Deno.exit(2);
      }

      const deps = depsResult.value;
      const workspaceRoot = deps.root;

      console.log("Checking workspace integrity...\n");

      // Scan and validate workspace
      const report = await scanAndValidate(workspaceRoot);

      // Display report
      displayReport(report);

      // Exit with appropriate code
      const hasIssues = report.itemIssues.length > 0 ||
        report.edgeIssues.length > 0 ||
        report.aliasIssues.length > 0 ||
        report.integrityIssues.length > 0;

      Deno.exit(hasIssues ? 1 : 0);
    });
}

/**
 * Extract item ID from file path
 *
 * Uses parseItemId to validate the ID format, ensuring consistency
 * with the rest of the codebase.
 *
 * Examples:
 * - "items/2025/11/20/019a9ec8-e55a-7fe4-93ca-7d84b5bd9adf.md" → "019a9ec8-e55a-7fe4-93ca-7d84b5bd9adf"
 * - "/path/to/items/019a9ec8-e55a-7fe4-93ca-7d84b5bd9adf.md" → "019a9ec8-e55a-7fe4-93ca-7d84b5bd9adf"
 */
function extractItemIdFromPath(path: string): string | null {
  const fileName = path.split("/").pop();
  if (!fileName) return null;

  // Remove .md extension
  const withoutExt = fileName.replace(/\.md$/, "");

  // Validate using parseItemId to ensure consistency
  const result = parseItemId(withoutExt);
  if (result.type === "ok") {
    return withoutExt;
  }

  return null;
}

/**
 * Scan workspace and validate all data
 */
async function scanAndValidate(workspaceRoot: string): Promise<CheckReport> {
  const scanner = createWorkspaceScanner(workspaceRoot);

  // Scan items
  const items = new Map<string, Item>();
  const itemIssues: ItemValidationIssue[] = [];
  const failedItemIds = new Set<string>();
  let itemsScanned = 0;

  for await (const result of scanner.scanAllItems()) {
    itemsScanned++;
    if (result.type === "error") {
      itemIssues.push({
        path: result.error.path,
        error: result.error,
      });

      // Extract item ID from path to ignore in orphaned checks
      const itemId = extractItemIdFromPath(result.error.path);
      if (itemId) {
        failedItemIds.add(itemId);
      }
    } else {
      const item = result.value;
      items.set(item.data.id.toString(), item);
    }
  }

  // Scan edges with path info
  const edges: EdgeReferenceWithPath[] = [];
  const edgeIssues: EdgeValidationIssue[] = [];
  let edgesScanned = 0;

  for await (const result of scanner.scanAllEdgesWithPath()) {
    edgesScanned++;
    if (result.type === "error") {
      edgeIssues.push({
        path: result.error.path,
        error: result.error,
      });
    } else {
      edges.push(result.value);
    }
  }

  // Scan aliases
  const aliases: Alias[] = [];
  const aliasIssues: AliasValidationIssue[] = [];
  let aliasesScanned = 0;

  for await (const result of scanner.scanAllAliases()) {
    aliasesScanned++;
    if (result.type === "error") {
      aliasIssues.push({
        path: result.error.path,
        error: result.error,
      });
    } else {
      aliases.push(result.value);
    }
  }

  // Check index integrity, ignoring items that failed to parse
  const integrityIssues = checkIndexIntegrity(items, edges, aliases, failedItemIds);

  return {
    itemsScanned,
    edgesScanned,
    aliasesScanned,
    itemIssues,
    edgeIssues,
    aliasIssues,
    integrityIssues,
  };
}

/**
 * Display the check report
 */
function displayReport(report: CheckReport): void {
  // Summary of scanned items
  console.log(`✓ Scanned ${report.itemsScanned} items`);
  console.log(`✓ Scanned ${report.edgesScanned} edges`);
  console.log(`✓ Scanned ${report.aliasesScanned} aliases`);

  const totalIssues = report.itemIssues.length +
    report.edgeIssues.length +
    report.aliasIssues.length +
    report.integrityIssues.length;

  if (totalIssues === 0) {
    console.log("\n✅ No issues found.");
    return;
  }

  console.log("\nIssues found:\n");

  // Item parse errors
  if (report.itemIssues.length > 0) {
    console.log("[Frontmatter Errors]");
    for (const issue of report.itemIssues) {
      console.log(`  • ${issue.path}`);
      console.log(`    - ${issue.error.message}`);
    }
    console.log();
  }

  // Edge parse errors
  if (report.edgeIssues.length > 0) {
    console.log("[Edge File Errors]");
    for (const issue of report.edgeIssues) {
      console.log(`  • ${issue.path}`);
      console.log(`    - ${issue.error.message}`);
    }
    console.log();
  }

  // Alias parse errors
  if (report.aliasIssues.length > 0) {
    console.log("[Alias File Errors]");
    for (const issue of report.aliasIssues) {
      console.log(`  • ${issue.path}`);
      console.log(`    - ${issue.error.message}`);
    }
    console.log();
  }

  // Index integrity issues
  if (report.integrityIssues.length > 0) {
    // Group by kind for better readability
    const groupedIssues = groupIssuesByKind(report.integrityIssues);

    for (const [kind, issues] of groupedIssues) {
      const sectionName = formatIssueSectionName(kind);
      console.log(`[${sectionName}]`);
      for (const issue of issues) {
        if (issue.path) {
          console.log(`  • ${issue.path}`);
          console.log(`    - ${issue.message}`);
        } else {
          console.log(`  • ${issue.message}`);
        }
      }
      console.log();
    }
  }

  // Summary
  console.log(`Summary: ${totalIssues} issue(s) found`);
}

/**
 * Group integrity issues by kind
 */
function groupIssuesByKind(
  issues: ReadonlyArray<IndexIntegrityIssue>,
): Map<IndexIntegrityIssue["kind"], IndexIntegrityIssue[]> {
  const grouped = new Map<IndexIntegrityIssue["kind"], IndexIntegrityIssue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.kind) ?? [];
    existing.push(issue);
    grouped.set(issue.kind, existing);
  }

  return grouped;
}

/**
 * Format issue kind into human-readable section name
 */
function formatIssueSectionName(kind: IndexIntegrityIssue["kind"]): string {
  switch (kind) {
    case "EdgeTargetNotFound":
      return "Orphaned Edges";
    case "DuplicateEdge":
      return "Duplicate Edges";
    case "CycleDetected":
      return "Graph Cycles";
    case "AliasConflict":
      return "Alias Conflicts";
    case "EdgeItemMismatch":
      return "Edge-Item Mismatches";
    case "MissingEdge":
      return "Missing Edges";
    case "EdgeLocationMismatch":
      return "Stale Edges";
    case "OrphanedAliasIndex":
      return "Orphaned Alias Index";
    case "MissingAliasIndex":
      return "Missing Alias Index";
    default:
      return "Other Issues";
  }
}
