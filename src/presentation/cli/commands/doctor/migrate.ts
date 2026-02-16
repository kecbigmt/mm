import { Command } from "@cliffy/command";
import { type CliDependencies, loadCliDependencies } from "../../dependencies.ts";
import { formatError } from "../../error_formatter.ts";
import { isDebugMode } from "../../debug.ts";
import {
  readWorkspaceSchema,
  writeWorkspaceSchema,
} from "../../../../infrastructure/fileSystem/workspace_schema_reader.ts";
import {
  scanRawItems,
  writeRawItemFile,
} from "../../../../infrastructure/fileSystem/migration_scanner.ts";
import {
  buildMigrationPlan,
  buildScanResult,
  migrateItemFrontmatter,
} from "../../../../domain/workflows/migrate_schema.ts";
import type {
  MigrationItemError,
  MigrationPlan,
  MigrationScanError,
  MigrationScanResult,
  RawItemFile,
} from "../../../../domain/workflows/migrate_schema.ts";
import { CURRENT_WORKSPACE_SCHEMA } from "../../../../domain/models/workspace_schema.ts";
import {
  buildTopicItem,
  persistPreparedTopic,
} from "../../../../domain/services/topic_auto_creation_service.ts";
import { parseAliasSlug } from "../../../../domain/primitives/alias_slug.ts";
import { dateTimeFromDate } from "../../../../domain/primitives/date_time.ts";
import { Result } from "../../../../shared/result.ts";
import type { AliasRepository } from "../../../../domain/repositories/alias_repository.ts";
import type { VersionControlService } from "../../../../domain/services/version_control_service.ts";

// --- Progress display helpers ---

function writeProgress(message: string): void {
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(`\r${message}`));
}

function clearProgress(): void {
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(`\r${"".padEnd(80)}\r`));
}

// --- Scanning phase ---

/**
 * Scan all items in the workspace and build a scan result.
 */
async function scanItems(workspaceRoot: string): Promise<MigrationScanResult> {
  console.log("Scanning items...");
  const items: RawItemFile[] = [];
  const parseErrors: MigrationScanError[] = [];

  for await (const result of scanRawItems(workspaceRoot)) {
    if (result.type === "error") {
      parseErrors.push(result.error);
    } else {
      items.push(result.value);
    }
  }

  const scanResult = buildScanResult(items, parseErrors);

  console.log(
    `Found ${scanResult.totalItems} items (${scanResult.itemsWithAliases} with alias strings requiring conversion)`,
  );

  if (parseErrors.length > 0) {
    console.log(`\nWarning: ${parseErrors.length} items could not be parsed`);
  }

  return scanResult;
}

// --- Alias resolution phase ---

/**
 * Find which aliases already have permanent items in the workspace.
 */
async function findExistingAliases(
  aliases: ReadonlyArray<string>,
  aliasRepository: AliasRepository,
): Promise<Set<string>> {
  const existingAliases = new Set<string>();
  for (const alias of aliases) {
    const slugResult = parseAliasSlug(alias);
    if (slugResult.type === "ok") {
      const aliasLookup = await aliasRepository.load(slugResult.value);
      if (aliasLookup.type === "ok" && aliasLookup.value) {
        existingAliases.add(alias);
      }
    }
  }
  return existingAliases;
}

/**
 * Build alias-to-UUID map from existing permanent items.
 */
async function buildExistingAliasMap(
  existingAliases: ReadonlySet<string>,
  aliasRepository: AliasRepository,
): Promise<Map<string, string>> {
  const aliasToUuid = new Map<string, string>();
  for (const alias of existingAliases) {
    const slugResult = parseAliasSlug(alias);
    if (slugResult.type === "ok") {
      const aliasLookup = await aliasRepository.load(slugResult.value);
      if (aliasLookup.type === "ok" && aliasLookup.value) {
        aliasToUuid.set(alias, aliasLookup.value.data.itemId.toString());
      }
    }
  }
  return aliasToUuid;
}

// --- Permanent item creation phase ---

/**
 * Create permanent items for aliases that do not yet exist.
 * Returns the alias-to-UUID map (including both existing and newly created).
 */
async function createPermanentItems(
  plan: MigrationPlan,
  existingAliases: ReadonlySet<string>,
  deps: CliDependencies,
): Promise<Map<string, string>> {
  const aliasToUuid = await buildExistingAliasMap(existingAliases, deps.aliasRepository);

  if (plan.permanentItemsToCreate.length === 0) {
    return aliasToUuid;
  }

  const nowResult = dateTimeFromDate(new Date());
  const now = Result.unwrap(nowResult);
  let created = 0;
  const total = plan.permanentItemsToCreate.length;

  for (const alias of plan.permanentItemsToCreate) {
    const slugResult = parseAliasSlug(alias);
    if (slugResult.type === "error") {
      console.error(`Error: Invalid alias '${alias}', skipping`);
      continue;
    }

    const topicDeps = {
      itemRepository: deps.itemRepository,
      aliasRepository: deps.aliasRepository,
      rankService: deps.rankService,
      idGenerationService: deps.idGenerationService,
    };

    const buildResult = await buildTopicItem(slugResult.value, now, topicDeps);
    if (buildResult.type === "error") {
      console.error(
        `Error creating permanent item for '${alias}': ${JSON.stringify(buildResult.error)}`,
      );
      continue;
    }

    const persistResult = await persistPreparedTopic(buildResult.value, topicDeps);
    if (persistResult.type === "error") {
      console.error(
        `Error persisting permanent item for '${alias}': ${persistResult.error.message}`,
      );
      continue;
    }

    aliasToUuid.set(alias, buildResult.value.item.data.id.toString());
    created++;
    writeProgress(`Creating permanent items... (${created}/${total})`);
  }

  clearProgress();
  console.log(`\u2713 Created permanent items`);

  return aliasToUuid;
}

// --- Frontmatter update phase ---

/**
 * Update all item frontmatter with UUID references and schema bump.
 * Returns migration errors encountered during the process.
 */
async function updateItemFrontmatter(
  scanResult: MigrationScanResult,
  aliasToUuid: ReadonlyMap<string, string>,
): Promise<MigrationItemError[]> {
  const migrationErrors: MigrationItemError[] = [];
  let updated = 0;
  const totalToUpdate = scanResult.allItems.length;

  for (const item of scanResult.allItems) {
    const migrateResult = migrateItemFrontmatter(item.frontmatter, aliasToUuid);

    if (migrateResult.type === "error") {
      for (const err of migrateResult.error) {
        migrationErrors.push({ ...err, path: item.filePath });
      }
      continue;
    }

    const writeResult = await writeRawItemFile(item.filePath, migrateResult.value, item.body);
    if (writeResult.type === "error") {
      migrationErrors.push({
        path: item.filePath,
        alias: "",
        message: writeResult.error.message,
      });
      continue;
    }

    updated++;
    writeProgress(`Updating item frontmatter... (${updated}/${totalToUpdate})`);
  }

  clearProgress();
  console.log(`\u2713 Updated item frontmatter`);

  return migrationErrors;
}

// --- Error reporting ---

/**
 * Report migration errors. Returns true if errors occurred (migration should abort).
 */
function reportMigrationErrors(errors: ReadonlyArray<MigrationItemError>): boolean {
  if (errors.length === 0) {
    return false;
  }

  console.log(`\nErrors occurred during migration:`);
  const toShow = errors.slice(0, 10);
  for (const err of toShow) {
    console.log(`  \u2717 ${err.path}: ${err.message}`);
  }
  if (errors.length > 10) {
    console.log(`  ... and ${errors.length - 10} more errors`);
  }
  console.log(`\nWorkspace schema NOT updated due to errors.`);
  return true;
}

// --- Display helpers ---

function displayDryRunResults(plan: MigrationPlan, _scanResult: MigrationScanResult): void {
  console.log(`\nAnalysis Results:`);
  if (plan.permanentItemsToCreate.length > 0) {
    console.log(
      `  - Will create ${plan.permanentItemsToCreate.length} permanent items for aliases:`,
    );
    const toShow = plan.permanentItemsToCreate.slice(0, 3);
    for (const alias of toShow) {
      console.log(`    \u2022 ${alias}`);
    }
    if (plan.permanentItemsToCreate.length > 3) {
      console.log(`    ... (${plan.permanentItemsToCreate.length - 3} more)`);
    }
  } else {
    console.log(`  - No new permanent items needed`);
  }

  console.log(
    `\n  - Will update ${plan.itemsToUpdate} item frontmatter files (schema /3 \u2192 /4)`,
  );
  if (plan.itemsWithAliasConversion > 0) {
    console.log(`    \u2022 ${plan.itemsWithAliasConversion} items with alias string conversion`);
  }
  if (plan.itemsWithSchemaBumpOnly > 0) {
    console.log(`    \u2022 ${plan.itemsWithSchemaBumpOnly} items with schema bump only`);
  }

  console.log(`\nRun without --dry-run to apply the migration.`);
}

async function performGitChecks(
  vcs: VersionControlService,
  workspaceRoot: string,
): Promise<boolean> {
  let ok = true;

  // Check uncommitted changes
  const uncommittedResult = await vcs.hasUncommittedChanges(workspaceRoot);
  if (uncommittedResult.type === "error") {
    // Git not available or not initialized -- skip git checks
    if (
      uncommittedResult.error.kind === "VersionControlNotAvailableError" ||
      uncommittedResult.error.kind === "VersionControlNotInitializedError"
    ) {
      console.log("\u2713 Git not detected, skipping Git checks");
      return true;
    }
    console.log(`\u2717 Error checking Git status: ${uncommittedResult.error.message}`);
    return false;
  }

  if (uncommittedResult.value) {
    console.log(`\u2717 Uncommitted changes detected`);
    console.log(`\nPlease commit your changes before migrating.`);
    ok = false;
  } else {
    console.log(`\u2713 No uncommitted changes`);
  }

  // Check unpushed commits
  const unpushedResult = await vcs.hasUnpushedCommits(workspaceRoot);
  if (unpushedResult.type === "error") {
    // Non-fatal: can't determine, skip
    console.log(`\u2713 Could not check for unpushed commits (no remote tracking?)`);
  } else if (unpushedResult.value) {
    console.log(`\u2717 Unpushed commits detected`);
    console.log(`\nPlease push your commits before migrating.`);
    ok = false;
  } else {
    console.log(`\u2713 No unpushed commits`);
  }

  if (!ok) {
    console.log(`\nPlease commit and push your changes before migrating.`);
    console.log(`This ensures no conflicts occur during multi-device sync.`);
  } else {
    console.log(`\u2713 Working directory clean`);
  }

  return ok;
}

function displayMigrationSummary(plan: MigrationPlan): void {
  console.log(`\nThis will:`);
  if (plan.permanentItemsToCreate.length > 0) {
    console.log(
      `  1. Create ${plan.permanentItemsToCreate.length} permanent items for aliases`,
    );
  }
  const stepOffset = plan.permanentItemsToCreate.length > 0 ? 1 : 0;
  console.log(
    `  ${
      1 + stepOffset
    }. Update ${plan.itemsToUpdate} item frontmatter files (schema /3 \u2192 /4)`,
  );
  console.log(
    `  ${2 + stepOffset}. Update workspace schema: ${
      plan.currentWorkspaceSchema ?? "unknown"
    } \u2192 ${CURRENT_WORKSPACE_SCHEMA}`,
  );

  console.log(`\n\u26a0\ufe0f  Before migrating:`);
  console.log(`  - Commit all local changes`);
  console.log(`  - Push to remote (if using Git sync)`);
  console.log(`  - Run on ONE device only to avoid conflicts`);
}

async function promptConfirmation(): Promise<boolean> {
  const buf = new Uint8Array(1024);
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode("\nContinue? [y/N] "));

  try {
    const n = await Deno.stdin.read(buf);
    if (n === null) return false;
    const input = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    return input === "y";
  } catch {
    return false;
  }
}

// --- Command entry point ---

export function createMigrateCommand() {
  return new Command()
    .description("Migrate workspace to latest schema version")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("--dry-run", "Preview changes without applying them")
    .action(async (options: Record<string, unknown>) => {
      const debug = isDebugMode();
      const dryRun = options.dryRun === true;
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;

      const depsResult = await loadCliDependencies(workspaceOption, { skipSchemaCheck: true });
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

      if (dryRun) {
        console.log("Running in dry-run mode (no changes will be made)\n");
      }

      // Phase 1: Scan items
      const scanResult = await scanItems(workspaceRoot);

      // Read workspace schema
      const schemaResult = await readWorkspaceSchema(workspaceRoot);
      if (schemaResult.type === "error") {
        console.error(`Error reading workspace schema: ${schemaResult.error.message}`);
        Deno.exit(2);
      }

      // Identify which aliases already exist as permanent items
      const existingAliases = await findExistingAliases(
        scanResult.uniqueAliases,
        deps.aliasRepository,
      );
      const plan = buildMigrationPlan(scanResult, schemaResult.value, existingAliases);

      if (dryRun) {
        displayDryRunResults(plan, scanResult);
        Deno.exit(0);
      }

      // Phase 2: Git checks
      console.log("\nChecking Git status...");
      const gitChecksOk = await performGitChecks(deps.versionControlService, workspaceRoot);
      if (!gitChecksOk) {
        console.log("\nAborting migration.");
        Deno.exit(1);
      }

      // Phase 3: Confirmation prompt
      displayMigrationSummary(plan);
      const confirmed = await promptConfirmation();
      if (!confirmed) {
        console.log("Migration cancelled.");
        Deno.exit(0);
      }

      // Phase 4: Create permanent items
      const aliasToUuid = await createPermanentItems(plan, existingAliases, deps);

      // Phase 5: Update item frontmatter
      const migrationErrors = await updateItemFrontmatter(scanResult, aliasToUuid);

      // Phase 6: Handle errors
      if (reportMigrationErrors(migrationErrors)) {
        Deno.exit(1);
      }

      // Phase 7: Update workspace schema
      console.log(
        `\nUpdating workspace schema: ${
          schemaResult.value ?? "unknown"
        } \u2192 ${CURRENT_WORKSPACE_SCHEMA}`,
      );
      const updateResult = await writeWorkspaceSchema(workspaceRoot, CURRENT_WORKSPACE_SCHEMA);
      if (updateResult.type === "error") {
        console.error(`Error updating workspace schema: ${updateResult.error.message}`);
        Deno.exit(1);
      }
      console.log(`\u2713 Updated workspace schema`);

      console.log(`\n\u2713 Migration completed successfully`);
      console.log(`\nNext steps:`);
      console.log(
        `  - Commit the changes: git add -A && git commit -m "chore: migrate to schema v4"`,
      );
      console.log(`  - Push to remote: git push`);
    });
}
