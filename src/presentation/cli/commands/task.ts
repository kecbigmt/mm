import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { dateTimeFromDate, parseDateTime } from "../../../domain/primitives/mod.ts";
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

export function createTaskCommand() {
  return new Command()
    .description("Create a new task")
    .arguments("[title:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-b, --body <body:string>", "Body text")
    .option("-p, --parent <parent:string>", "Parent locator (e.g., /2025-11-03, /alias, ./1)")
    .option("-c, --context <context:string>", "Context tag")
    .option("-a, --alias <alias:string>", "Alias for the item")
    .option("-d, --due-at <dueAt:string>", "Due date/time (ISO 8601 format)")
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

      // Parse dueAt if provided
      // For time-only formats (HH:MM), use parent placement date as reference
      let dueAt = undefined;
      if (typeof options.dueAt === "string") {
        // Extract reference date from parent placement for time-only formats
        let referenceDate = now;
        if (parentPlacement.head.kind === "date") {
          const dateStr = parentPlacement.head.date.toString();
          const [year, month, day] = dateStr.split("-").map(Number);
          referenceDate = new Date(year, month - 1, day);
        }

        const dueAtResult = parseDateTime(options.dueAt, referenceDate);
        if (dueAtResult.type === "error") {
          console.error("Invalid due-at format:");
          reportValidationIssues(dueAtResult.error.issues);
          return;
        }
        dueAt = dueAtResult.value;
      }

      const workflowResult = await CreateItemWorkflow.execute({
        title: resolvedTitle,
        itemType: "task",
        body: bodyOption,
        context: contextOption,
        alias: aliasOption,
        dueAt,
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
        `✅ Created task [${label}] ${item.data.title.toString()} at ${parentPlacement.toString()}`,
      );

      if (options.edit === true) {
        console.warn("Editor integration not implemented yet");
      }
    });
}
