import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { dateTimeFromDate, parseDateTime, parseDuration } from "../../../domain/primitives/mod.ts";
import { CreateItemWorkflow } from "../../../domain/workflows/create_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_parser.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";
import { formatError } from "../error_formatter.ts";
import { isDebugMode } from "../debug.ts";
import { executeAutoCommit } from "../auto_commit_helper.ts";
import { executePrePull } from "../pre_pull_helper.ts";
import { deriveFilePathFromId } from "../../../infrastructure/fileSystem/item_repository.ts";
import { handlePostEditUpdates, launchEditor } from "../utils/edit_item_helper.ts";

const formatItemLabel = (
  item: { data: { id: { toString(): string }; alias?: { toString(): string } } },
): string => item.data.alias ? item.data.alias.toString() : item.data.id.toString();

const reportValidationIssues = (
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
) => {
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "value";
    console.error(`  - ${path}: ${issue.message}`);
  }
};

export function createEventCommand() {
  return new Command()
    .description("Create a new event")
    .arguments("[title:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-b, --body <body:string>", "Body text")
    .option("-d, --dir <dir:string>", "Directory locator (e.g., /2025-11-03, /alias, ./1)")
    .option("-p, --project <project:string>", "Project reference (alias)")
    .option("-c, --context <context:string>", "Context tag (repeatable)", { collect: true })
    .option("-a, --alias <alias:string>", "Alias for the item")
    .option("-s, --start-at <startAt:string>", "Start date/time (ISO 8601 format)")
    .option("--duration <duration:string>", "Duration (e.g., 30m, 2h, 1h30m)")
    .option("-e, --edit", "Open editor after creation")
    .action(async (options: Record<string, unknown>, title?: string) => {
      const debug = isDebugMode();
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(formatError(depsResult.error.error, debug));
        } else {
          console.error(formatError(depsResult.error, debug));
        }
        return;
      }

      const deps = depsResult.value;

      // Pre-pull to get latest changes before file operation
      await executePrePull({
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
      });

      const resolvedTitle = typeof title === "string" && title.trim().length > 0
        ? title
        : "Untitled";

      const now = new Date();
      const dirArg = typeof options.dir === "string" ? options.dir : undefined;

      const cwdResult = await CwdResolutionService.getCwd({
        sessionRepository: deps.sessionRepository,
        workspacePath: deps.root,
        itemRepository: deps.itemRepository,
        timezone: deps.timezone,
      });
      if (cwdResult.type === "error") {
        console.error(formatError(cwdResult.error, debug));
        return;
      }
      if (cwdResult.value.warning) {
        console.error(`Warning: ${cwdResult.value.warning}`);
      }

      // Resolve parent directory
      let parentDirectory = cwdResult.value.directory;

      if (dirArg) {
        const exprResult = parsePathExpression(dirArg);
        if (exprResult.type === "error") {
          console.error(
            "Invalid directory expression:",
            exprResult.error.issues.map((i) => i.message).join(", "),
          );
          return;
        }

        const pathResolver = createPathResolver({
          aliasRepository: deps.aliasRepository,
          itemRepository: deps.itemRepository,
          timezone: deps.timezone,
          today: now,
          prefixCandidates: () => deps.cacheUpdateService.getAliases(),
        });

        const resolveResult = await pathResolver.resolvePath(
          cwdResult.value.directory,
          exprResult.value,
        );

        if (resolveResult.type === "error") {
          console.error(
            "Failed to resolve directory:",
            resolveResult.error.issues.map((i) => i.message).join(", "),
          );
          return;
        }

        parentDirectory = resolveResult.value;
      }

      const createdAtResult = dateTimeFromDate(now);
      if (createdAtResult.type === "error") {
        console.error(formatError(createdAtResult.error, debug));
        return;
      }

      const bodyOption = typeof options.body === "string" ? options.body : undefined;
      const projectOption = typeof options.project === "string" ? options.project : undefined;
      const contextOption = Array.isArray(options.context)
        ? options.context as string[]
        : undefined;
      const aliasOption = typeof options.alias === "string" ? options.alias : undefined;

      // Parse startAt if provided
      // For time-only formats (HH:MM), use parent directory date as reference
      let startAt = undefined;
      if (typeof options.startAt === "string") {
        // Extract reference date from parent directory for time-only formats
        // Use noon UTC to avoid day shifts when formatting in workspace timezone
        let referenceDate = now;
        if (parentDirectory.head.kind === "date") {
          const dateStr = parentDirectory.head.date.toString();
          const [year, month, day] = dateStr.split("-").map(Number);
          referenceDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        }

        const startAtResult = parseDateTime(options.startAt, {
          referenceDate,
          timezone: deps.timezone,
        });
        if (startAtResult.type === "error") {
          console.error("Invalid start-at format:");
          reportValidationIssues(startAtResult.error.issues);
          return;
        }
        startAt = startAtResult.value;
      }

      // Parse duration if provided
      let duration = undefined;
      if (typeof options.duration === "string") {
        const durationResult = parseDuration(options.duration);
        if (durationResult.type === "error") {
          console.error("Invalid duration format:");
          reportValidationIssues(durationResult.error.issues);
          return;
        }
        duration = durationResult.value;
      }

      const workflowResult = await CreateItemWorkflow.execute({
        title: resolvedTitle,
        itemType: "event",
        body: bodyOption,
        project: projectOption,
        contexts: contextOption,
        alias: aliasOption,
        startAt,
        duration,
        parentDirectory: parentDirectory,
        createdAt: createdAtResult.value,
        timezone: deps.timezone,
      }, {
        itemRepository: deps.itemRepository,
        aliasRepository: deps.aliasRepository,
        aliasAutoGenerator: deps.aliasAutoGenerator,
        rankService: deps.rankService,
        idGenerationService: deps.idGenerationService,
      });

      if (workflowResult.type === "error") {
        if (workflowResult.error.kind === "validation") {
          // Check for date consistency errors and provide user-friendly message
          const hasDateConsistency = workflowResult.error.issues.some(
            (i) => i.code === "date_time_inconsistency",
          );
          if (hasDateConsistency) {
            console.error("Event date/time consistency error:");
            console.error(
              "The start time's date must match the parent directory date.",
            );
          }
          console.error(formatError(workflowResult.error, debug));
          reportValidationIssues(workflowResult.error.issues);
        } else {
          console.error(formatError(workflowResult.error.error, debug));
        }
        return;
      }

      const { item, createdTopics } = workflowResult.value;

      // Display notifications for auto-created topics
      for (const topicAlias of createdTopics) {
        console.log(`Created topic: ${topicAlias.toString()}`);
      }

      // Update cache with created item
      await deps.cacheUpdateService.updateFromItem(item);

      const label = formatItemLabel(item);
      console.log(
        `✅ Created event [${label}] ${item.data.title.toString()} at ${parentDirectory.toString()}`,
      );

      // Auto-commit if enabled
      const autoCommitDeps = {
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
        stateRepository: deps.stateRepository,
      };
      await executeAutoCommit(autoCommitDeps, `create new event "${resolvedTitle}"`);

      if (options.edit === true) {
        const filePath = deriveFilePathFromId(
          { root: deps.root, timezone: deps.timezone },
          item.data.id.toString(),
        );

        if (!filePath) {
          console.error(`Could not determine file path for item: ${label}`);
          return;
        }

        try {
          await launchEditor(filePath);
          const updatedItem = await handlePostEditUpdates(
            {
              itemRepository: deps.itemRepository,
              aliasRepository: deps.aliasRepository,
              cacheUpdateService: deps.cacheUpdateService,
            },
            {
              itemId: item.data.id,
              oldAlias: item.data.alias,
              occurredAt: createdAtResult.value,
            },
          );

          console.log(`✅ Updated ${formatItemLabel(updatedItem)}`);

          // Auto-commit edits if enabled
          await executeAutoCommit(autoCommitDeps, `edit event via editor after creation`);
        } catch (error) {
          console.error(
            `Failed to edit item: ${error instanceof Error ? error.message : String(error)}`,
          );
          Deno.exit(1);
        }
      }
    });
}
