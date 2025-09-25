import { Result } from "../../shared/result.ts";
import { createValidationIssue, ValidationIssue } from "../../shared/errors.ts";
import { createItem, Item } from "../models/item.ts";
import {
  createItemIcon,
  DateTime,
  ItemId,
  itemStatusOpen,
  itemTitleFromString,
  parseSectionPath,
  SectionPath,
  TagSlug,
  tagSlugFromString,
} from "../primitives/mod.ts";
import { CalendarDay } from "../primitives/calendar_day.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createItemEdge } from "../models/edge.ts";
import { RankService } from "../services/rank_service.ts";
import { IdGenerationService } from "../services/id_generation_service.ts";
import { createRootPlacement } from "../models/placement.ts";

export type CreateItemInput = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  context?: string;
  day: CalendarDay;
  createdAt: DateTime;
}>;

export type CreateItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type CreateItemValidationError = Readonly<{
  kind: "validation";
  message: string;
  issues: ReadonlyArray<ValidationIssue>;
}>;

export type CreateItemRepositoryError = Readonly<{
  kind: "repository";
  error: RepositoryError;
}>;

export type CreateItemError = CreateItemValidationError | CreateItemRepositoryError;

export type CreateItemResult = Readonly<{
  item: Item;
}>;

const invalidInput = (
  issues: ReadonlyArray<ValidationIssue>,
): CreateItemValidationError => ({
  kind: "validation",
  message: "invalid item input",
  issues,
});

const repositoryFailure = (error: RepositoryError): CreateItemRepositoryError => ({
  kind: "repository",
  error,
});

export const CreateItemWorkflow = {
  execute: async (
    input: CreateItemInput,
    deps: CreateItemDependencies,
  ): Promise<Result<CreateItemResult, CreateItemError>> => {
    const issues: ValidationIssue[] = [];

    const titleResult = itemTitleFromString(input.title);
    const title = titleResult.type === "ok" ? titleResult.value : undefined;
    if (titleResult.type === "error") {
      issues.push(
        ...titleResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["title", ...issue.path],
          })
        ),
      );
    }

    let context: TagSlug | undefined;
    if (typeof input.context === "string") {
      const contextResult = tagSlugFromString(input.context);
      if (contextResult.type === "error") {
        issues.push(
          ...contextResult.error.issues.map((issue) =>
            createValidationIssue(issue.message, {
              code: issue.code,
              path: ["context", ...issue.path],
            })
          ),
        );
      } else {
        context = contextResult.value;
      }
    }

    const daySegments = input.day.toString().split("-");
    const sectionResult = parseSectionPath(`:${daySegments.join("-")}`);
    const section = sectionResult.type === "ok" ? sectionResult.value : undefined;
    if (sectionResult.type === "error") {
      issues.push(
        ...sectionResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["placement", "section", ...issue.path],
          })
        ),
      );
    }

    const idResult = deps.idGenerationService.generateId();
    const id = idResult.type === "ok" ? idResult.value : undefined;
    if (idResult.type === "error") {
      issues.push(
        ...idResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["id", ...issue.path],
          })
        ),
      );
    }

    if (issues.length > 0) {
      return Result.error(invalidInput(issues));
    }

    const resolvedSection = section as SectionPath;
    const resolvedId = id as ItemId;
    const resolvedTitle = title!;

    const rankResult = deps.rankService.middleRank();
    if (rankResult.type === "error") {
      return Result.error(invalidInput(
        rankResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["rank", ...issue.path],
          })
        ),
      ));
    }

    const placement = createRootPlacement(
      resolvedSection,
      rankResult.value,
    );
    const placementEdge = createItemEdge(resolvedId, rankResult.value);

    const trimmedBody = typeof input.body === "string" ? input.body.trim() : undefined;
    const body = trimmedBody && trimmedBody.length > 0 ? trimmedBody : undefined;

    const item = createItem({
      id: resolvedId,
      title: resolvedTitle,
      icon: createItemIcon(input.itemType),
      status: itemStatusOpen(),
      placement,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      body,
      context,
    }, [placementEdge]);

    const saveResult = await deps.itemRepository.save(item);
    if (saveResult.type === "error") {
      return Result.error(repositoryFailure(saveResult.error));
    }

    return Result.ok({ item });
  },
};
