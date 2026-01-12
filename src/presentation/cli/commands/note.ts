import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { createPermanentPlacement, dateTimeFromDate } from "../../../domain/primitives/mod.ts";
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

export function createNoteCommand() {
  return new Command()
    .description("Create a new note")
    .arguments("[title:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-b, --body <body:string>", "Body text")
    .option("-p, --parent <parent:string>", "Parent locator (e.g., /2025-11-03, /alias, ./1)")
    .option("--placement <placement:string>", "Placement type (permanent)")
    .option("-c, --context <context:string>", "Context tag")
    .option("-a, --alias <alias:string>", "Alias for the item")
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
      const parentArg = typeof options.parent === "string" ? options.parent : undefined;
      const placementArg = typeof options.placement === "string" ? options.placement : undefined;

      // Handle --placement option
      if (placementArg) {
        if (placementArg !== "permanent") {
          console.error(
            `Invalid placement value: "${placementArg}". Only "permanent" is supported.`,
          );
          return;
        }
        if (parentArg) {
          console.error("Cannot use both --parent and --placement options together.");
          return;
        }
      }

      const cwdResult = await CwdResolutionService.getCwd(
        {
          stateRepository: deps.stateRepository,
          itemRepository: deps.itemRepository,
        },
        now,
      );
      if (cwdResult.type === "error") {
        console.error(formatError(cwdResult.error, debug));
        return;
      }

      // Resolve parent placement
      let parentPlacement = cwdResult.value;

      if (placementArg === "permanent") {
        // Use permanent placement
        parentPlacement = createPermanentPlacement();
      } else if (parentArg) {
        const exprResult = parsePathExpression(parentArg);
        if (exprResult.type === "error") {
          console.error(
            "Invalid parent expression:",
            exprResult.error.issues.map((i) => i.message).join(", "),
          );
          return;
        }

        const pathResolver = createPathResolver({
          aliasRepository: deps.aliasRepository,
          itemRepository: deps.itemRepository,
          timezone: deps.timezone,
          today: now,
        });

        const resolveResult = await pathResolver.resolvePath(
          cwdResult.value,
          exprResult.value,
        );

        if (resolveResult.type === "error") {
          console.error(
            "Failed to resolve parent:",
            resolveResult.error.issues.map((i) => i.message).join(", "),
          );
          return;
        }

        parentPlacement = resolveResult.value;
      }

      const createdAtResult = dateTimeFromDate(now);
      if (createdAtResult.type === "error") {
        console.error(formatError(createdAtResult.error, debug));
        return;
      }

      const bodyOption = typeof options.body === "string" ? options.body : undefined;
      const contextOption = typeof options.context === "string" ? options.context : undefined;
      const aliasOption = typeof options.alias === "string" ? options.alias : undefined;

      const workflowResult = await CreateItemWorkflow.execute({
        title: resolvedTitle,
        itemType: "note",
        body: bodyOption,
        context: contextOption,
        alias: aliasOption,
        parentPlacement: parentPlacement,
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
          console.error(formatError(workflowResult.error, debug));
          reportValidationIssues(workflowResult.error.issues);
        } else {
          console.error(formatError(workflowResult.error.error, debug));
        }
        return;
      }

      const item = workflowResult.value.item;

      // Update cache with created item
      await deps.cacheUpdateService.updateFromItem(item);

      const label = formatItemLabel(item);
      console.log(
        `✅ Created note [${label}] ${item.data.title.toString()} at ${parentPlacement.toString()}`,
      );

      // Auto-commit if enabled
      const autoCommitDeps = {
        workspaceRoot: deps.root,
        versionControlService: deps.versionControlService,
        workspaceRepository: deps.workspaceRepository,
        stateRepository: deps.stateRepository,
      };
      await executeAutoCommit(autoCommitDeps, `create new note "${resolvedTitle}"`);

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
          await executeAutoCommit(autoCommitDeps, `edit note via editor after creation`);
        } catch (error) {
          console.error(
            `Failed to edit item: ${error instanceof Error ? error.message : String(error)}`,
          );
          Deno.exit(1);
        }
      }
    });
}
