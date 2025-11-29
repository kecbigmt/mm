import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { dateTimeFromDate, parseDateTime, parseDuration } from "../../../domain/primitives/mod.ts";
import { CreateItemWorkflow } from "../../../domain/workflows/create_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";
import { parsePathExpression } from "../path_expression.ts";
import { createPathResolver } from "../../../domain/services/path_resolver.ts";

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
    .option("-p, --parent <parent:string>", "Parent locator (e.g., /2025-11-03, /alias, ./1)")
    .option("-c, --context <context:string>", "Context tag")
    .option("-a, --alias <alias:string>", "Alias for the item")
    .option("-s, --start-at <startAt:string>", "Start date/time (ISO 8601 format)")
    .option("-d, --duration <duration:string>", "Duration (e.g., 30m, 2h, 1h30m)")
    .option("-e, --edit", "Open editor after creation")
    .action(async (options: Record<string, unknown>, title?: string) => {
      const workspaceOption = typeof options.workspace === "string" ? options.workspace : undefined;
      const depsResult = await loadCliDependencies(workspaceOption);
      if (depsResult.type === "error") {
        if (depsResult.error.type === "repository") {
          console.error(depsResult.error.error.message);
        } else {
          console.error(depsResult.error.message);
        }
        return;
      }

      const deps = depsResult.value;
      const resolvedTitle = typeof title === "string" && title.trim().length > 0
        ? title
        : "Untitled";

      const now = new Date();
      const parentArg = typeof options.parent === "string" ? options.parent : undefined;

      const cwdResult = await CwdResolutionService.getCwd(
        {
          stateRepository: deps.stateRepository,
          itemRepository: deps.itemRepository,
        },
        now,
      );
      if (cwdResult.type === "error") {
        console.error(cwdResult.error.message);
        return;
      }

      // Resolve parent placement
      let parentPlacement = cwdResult.value;

      if (parentArg) {
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
        console.error(createdAtResult.error.message);
        return;
      }

      const bodyOption = typeof options.body === "string" ? options.body : undefined;
      const contextOption = typeof options.context === "string" ? options.context : undefined;
      const aliasOption = typeof options.alias === "string" ? options.alias : undefined;

      // Parse startAt if provided
      // For time-only formats (HH:MM), use parent placement date as reference
      let startAt = undefined;
      if (typeof options.startAt === "string") {
        // Extract reference date from parent placement for time-only formats
        // Use noon UTC to avoid day shifts when formatting in workspace timezone
        let referenceDate = now;
        if (parentPlacement.head.kind === "date") {
          const dateStr = parentPlacement.head.date.toString();
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
        context: contextOption,
        alias: aliasOption,
        startAt,
        duration,
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
          // Check for date consistency errors and provide user-friendly message
          const hasDateConsistency = workflowResult.error.issues.some(
            (i) => i.code === "date_time_inconsistency",
          );
          if (hasDateConsistency) {
            console.error("Event date/time consistency error:");
            console.error(
              "The start time's date must match the parent placement date.",
            );
          }
          console.error(workflowResult.error.message);
          reportValidationIssues(workflowResult.error.issues);
        } else {
          console.error(workflowResult.error.error.message);
        }
        return;
      }

      const item = workflowResult.value.item;
      const label = formatItemLabel(item);
      console.log(
        `✅ Created event [${label}] ${item.data.title.toString()} at ${parentPlacement.toString()}`,
      );

      if (options.edit === true) {
        console.warn("Editor integration not implemented yet");
      }
    });
}
