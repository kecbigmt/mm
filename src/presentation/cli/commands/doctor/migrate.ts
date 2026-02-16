import { Command } from "@cliffy/command";
import { type CliDependencies, loadCliDependencies } from "../../dependencies.ts";
import { formatError } from "../../error_formatter.ts";
import { isDebugMode } from "../../debug.ts";
import {
  readMigrationVersion,
  writeMigrationVersion,
} from "../../../../infrastructure/fileSystem/workspace_schema_reader.ts";
import {
  ALL_MIGRATION_STEPS,
  analyzeSteps,
  applySteps,
  collectAllExternalReferences,
  findApplicableSteps,
  scanRawItems,
  writeRawItemFile,
} from "../../../../infrastructure/fileSystem/migration/mod.ts";
import type {
  MigrationItemError,
  MigrationScanError,
  RawItemFile,
} from "../../../../infrastructure/fileSystem/migration/mod.ts";
import type { StepAnalysis } from "../../../../infrastructure/fileSystem/migration/mod.ts";
import {
  buildTopicItem,
  persistPreparedTopic,
} from "../../../../domain/services/topic_auto_creation_service.ts";
import { parseAliasSlug } from "../../../../domain/primitives/alias_slug.ts";
import { dateTimeFromDate } from "../../../../domain/primitives/date_time.ts";
import { Result } from "../../../../shared/result.ts";
import type { AliasRepository } from "../../../../domain/repositories/alias_repository.ts";
import type { VersionControlService } from "../../../../domain/services/version_control_service.ts";
import { executeAutoCommit } from "../../auto_commit_helper.ts";

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

async function scanItems(workspaceRoot: string): Promise<{
  items: RawItemFile[];
  parseErrors: MigrationScanError[];
}> {
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

  console.log(`Found ${items.length} items`);

  if (parseErrors.length > 0) {
    console.log(`\nWarning: ${parseErrors.length} items could not be parsed`);
  }

  return { items, parseErrors };
}

// --- Alias resolution phase ---

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

async function createPermanentItems(
  aliasesToCreate: ReadonlyArray<string>,
  existingAliases: ReadonlySet<string>,
  deps: CliDependencies,
): Promise<Map<string, string>> {
  const aliasToUuid = await buildExistingAliasMap(existingAliases, deps.aliasRepository);

  if (aliasesToCreate.length === 0) {
    return aliasToUuid;
  }

  const nowResult = dateTimeFromDate(new Date());
  const now = Result.unwrap(nowResult);
  let created = 0;
  const total = aliasesToCreate.length;

  for (const alias of aliasesToCreate) {
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

async function updateItemFrontmatter(
  items: ReadonlyArray<RawItemFile>,
  steps: ReturnType<typeof findApplicableSteps>,
  resolutionMap: ReadonlyMap<string, string>,
): Promise<MigrationItemError[]> {
  const migrationErrors: MigrationItemError[] = [];
  let updated = 0;
  const total = items.length;

  for (const item of items) {
    const migrateResult = applySteps(item.frontmatter, steps, resolutionMap);

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
    writeProgress(`Updating item frontmatter... (${updated}/${total})`);
  }

  clearProgress();
  console.log(`\u2713 Updated item frontmatter`);

  return migrationErrors;
}

// --- Error reporting ---

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
  console.log(`\nMigration version NOT updated due to errors.`);
  return true;
}

// --- Display helpers ---

function displayDryRunResults(
  analyses: ReadonlyArray<StepAnalysis>,
  allRefs: ReadonlyArray<string>,
  currentMigration: number,
): void {
  console.log(`\nAnalysis Results:`);
  console.log(`  Current migration version: ${currentMigration}`);

  for (const analysis of analyses) {
    console.log(
      `\n  Step ${analysis.step.fromMigration} \u2192 ${analysis.step.toMigration}: ${analysis.step.description}`,
    );
    console.log(`    - ${analysis.applicableItems} items total`);
    if (analysis.itemsWithTransformation > 0) {
      console.log(`    - ${analysis.itemsWithTransformation} items with real changes`);
    }
    if (analysis.itemsWithSchemaBumpOnly > 0) {
      console.log(`    - ${analysis.itemsWithSchemaBumpOnly} items with schema bump only`);
    }
  }

  if (allRefs.length > 0) {
    console.log(`\n  Will create ${allRefs.length} permanent items for aliases:`);
    const toShow = allRefs.slice(0, 3);
    for (const ref of toShow) {
      console.log(`    \u2022 ${ref}`);
    }
    if (allRefs.length > 3) {
      console.log(`    ... (${allRefs.length - 3} more)`);
    }
  } else {
    console.log(`\n  No new permanent items needed`);
  }

  console.log(`\nRun without --dry-run to apply the migration.`);
}

async function performGitChecks(
  vcs: VersionControlService,
  workspaceRoot: string,
): Promise<boolean> {
  let ok = true;

  const uncommittedResult = await vcs.hasUncommittedChanges(workspaceRoot);
  if (uncommittedResult.type === "error") {
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

  const unpushedResult = await vcs.hasUnpushedCommits(workspaceRoot);
  if (unpushedResult.type === "error") {
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

function displayMigrationSummary(
  analyses: ReadonlyArray<StepAnalysis>,
  allRefs: ReadonlyArray<string>,
  currentMigration: number,
  targetMigration: number,
): void {
  console.log(`\nThis will:`);
  let stepNum = 1;
  if (allRefs.length > 0) {
    console.log(`  ${stepNum}. Create ${allRefs.length} permanent items for aliases`);
    stepNum++;
  }
  for (const analysis of analyses) {
    console.log(
      `  ${stepNum}. ${analysis.step.description} (${analysis.applicableItems} items)`,
    );
    stepNum++;
  }
  console.log(
    `  ${stepNum}. Update migration version: ${currentMigration} \u2192 ${targetMigration}`,
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
    .description("Migrate workspace to latest migration version")
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

      // Read current migration version
      const migrationResult = await readMigrationVersion(workspaceRoot);
      if (migrationResult.type === "error") {
        console.error(`Error reading migration version: ${migrationResult.error.message}`);
        Deno.exit(2);
      }
      const currentMigration = migrationResult.value;

      // Find applicable steps
      const steps = findApplicableSteps(currentMigration, ALL_MIGRATION_STEPS);
      if (steps.length === 0) {
        console.log(`Workspace is already at migration version ${currentMigration} (up to date).`);
        Deno.exit(0);
      }

      const targetMigration = steps[steps.length - 1].toMigration;

      // Phase 1: Scan items
      const { items, parseErrors } = await scanItems(workspaceRoot);

      if (parseErrors.length > 0) {
        console.error(`\n${parseErrors.length} items could not be parsed:`);
        for (const err of parseErrors.slice(0, 10)) {
          console.error(`  \u2717 ${err.path}: ${err.message}`);
        }
        if (parseErrors.length > 10) {
          console.error(`  ... and ${parseErrors.length - 10} more`);
        }
        console.error(`\nFix these items before migrating.`);
        Deno.exit(1);
      }

      // Analyze steps
      const analyses = analyzeSteps(items, steps);
      const allRefs = collectAllExternalReferences(items, steps);

      // Find which aliases already exist
      const existingAliases = await findExistingAliases(allRefs, deps.aliasRepository);
      const aliasesToCreate = allRefs.filter((a) => !existingAliases.has(a));

      if (dryRun) {
        displayDryRunResults(analyses, allRefs, currentMigration);
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
      displayMigrationSummary(analyses, aliasesToCreate, currentMigration, targetMigration);
      const confirmed = await promptConfirmation();
      if (!confirmed) {
        console.log("Migration cancelled.");
        Deno.exit(0);
      }

      // Phase 4: Create permanent items
      const aliasToUuid = await createPermanentItems(aliasesToCreate, existingAliases, deps);

      // Phase 5: Update item frontmatter
      const migrationErrors = await updateItemFrontmatter(items, steps, aliasToUuid);

      // Phase 6: Handle errors
      if (reportMigrationErrors(migrationErrors)) {
        Deno.exit(1);
      }

      // Phase 7: Update migration version
      console.log(
        `\nUpdating migration version: ${currentMigration} \u2192 ${targetMigration}`,
      );
      const updateResult = await writeMigrationVersion(workspaceRoot, targetMigration);
      if (updateResult.type === "error") {
        console.error(`Error updating migration version: ${updateResult.error.message}`);
        Deno.exit(1);
      }
      console.log(`\u2713 Updated migration version`);

      console.log(`\n\u2713 Migration completed successfully`);

      // Auto-commit/sync if configured
      await executeAutoCommit(
        {
          workspaceRoot,
          versionControlService: deps.versionControlService,
          workspaceRepository: deps.workspaceRepository,
          stateRepository: deps.stateRepository,
        },
        `migrate workspace to migration version ${targetMigration}`,
      );

      console.log(`\nNext steps:`);
      console.log(
        `  - Verify changes: git status`,
      );
      console.log(
        `  - If not auto-committed: git add -A && git commit -m "chore: migrate to v${targetMigration}"`,
      );
      console.log(`  - If not auto-pushed: git push`);
    });
}
