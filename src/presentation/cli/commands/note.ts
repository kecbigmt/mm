import { Command } from "@cliffy/command";
import { loadCliDependencies } from "../dependencies.ts";
import { dateTimeFromDate, parseLocator } from "../../../domain/primitives/mod.ts";
import { CreateItemWorkflow } from "../../../domain/workflows/create_item.ts";
import { CwdResolutionService } from "../../../domain/services/cwd_resolution_service.ts";

const formatShortId = (id: string): string => id.slice(-7);

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
    .option("-c, --context <context:string>", "Context tag")
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
          aliasRepository: deps.aliasRepository,
        },
        now,
      );
      if (cwdResult.type === "error") {
        console.error(cwdResult.error.message);
        return;
      }

      const parentPath = (() => {
        if (!parentArg) {
          return cwdResult.value;
        }

        const locatorResult = parseLocator(parentArg, {
          today: now,
          cwd: cwdResult.value,
        });
        if (locatorResult.type === "error") {
          console.error(
            "Invalid parent locator:",
            locatorResult.error.issues.map((i) => i.message).join(", "),
          );
          return undefined;
        }

        if (locatorResult.value.path.isRange()) {
          console.error("Parent path cannot be a range");
          return undefined;
        }

        return locatorResult.value.path;
      })();

      if (!parentPath) {
        return;
      }

      const createdAtResult = dateTimeFromDate(now);
      if (createdAtResult.type === "error") {
        console.error(createdAtResult.error.message);
        return;
      }

      const bodyOption = typeof options.body === "string" ? options.body : undefined;
      const contextOption = typeof options.context === "string" ? options.context : undefined;

      const workflowResult = await CreateItemWorkflow.execute({
        title: resolvedTitle,
        itemType: "note",
        body: bodyOption,
        context: contextOption,
        parentPath,
        createdAt: createdAtResult.value,
      }, {
        itemRepository: deps.itemRepository,
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
      const shortId = formatShortId(item.data.id.toString());
      console.log(
        `✅ Created note [${shortId}] ${item.data.title.toString()} at ${parentPath.toString()}`,
      );

      if (options.edit === true) {
        console.warn("Editor integration not implemented yet");
      }
    });
}
