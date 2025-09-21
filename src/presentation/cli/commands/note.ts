import { Command } from "jsr:@cliffy/command@1.0.0-rc.4";
import { loadCliDependencies } from "../dependencies.ts";
import { parseDateArgument } from "../utils/date.ts";
import { dateTimeFromDate } from "../../../domain/primitives/mod.ts";
import { CreateItemWorkflow } from "../../../domain/workflows/create_item.ts";

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
    .option("-b, --body <body:string>", "Body text")
    .option("-p, --project <project:string>", "Project tag")
    .option("-c, --context <context:string>", "Context tag")
    .option("-d, --date <date:string>", "Note date (flexible: YYYY-MM-DD, today, tomorrow, etc.)")
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
      const dateArg = typeof options.date === "string" ? options.date : undefined;
      const dateResult = parseDateArgument(dateArg, deps.timezone, now);
      if (dateResult.type === "error") {
        console.error(dateResult.error.message);
        return;
      }
      if (dateResult.value.length !== 1) {
        console.error("note creation accepts a single target date");
        return;
      }
      const day = dateResult.value[0];

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
        day,
        createdAt: createdAtResult.value,
      }, {
        itemRepository: deps.itemRepository,
        containerRepository: deps.containerRepository,
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
      console.log(`✅ Created note [${shortId}] ${item.data.title.toString()} (${day.toString()})`);

      if (options.edit === true) {
        console.warn("Editor integration not implemented yet");
      }
    });
}
